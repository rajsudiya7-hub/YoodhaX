/*
# Create market data cache + engine state tables for the 1-Minute AI Engine

1. Plain-English explanation
   The app now fetches REAL market candles from a licensed provider (Twelve Data)
   through a secure backend. To respect the provider's rate limits and keep the
   engine fast, the backend will cache candle data and the newest live price per
   symbol in the database instead of hitting the provider on every request.

2. New Tables
   - `market_data_cache`
     - `cache_key` (text, primary key) - e.g. "twelvedata:EURUSD:1m"
     - `payload` (jsonb) - the normalized candle array or price snapshot
     - `provider` (text) - data provider name, e.g. "Twelve Data"
     - `symbol` (text) - requested symbol, e.g. EURUSD
     - `timeframe` (text) - e.g. "1m"
     - `fetched_at` (timestamptz) - when the provider was last contacted
   - `market_engine_state`
     - `id` (integer, check id = 1) - singleton row
     - `last_processed_candle` (text) - "SYMBOL:time" of the last analyzed candle; prevents re-analyzing the same closed candle twice
     - `updated_at` (timestamptz)

3. Security
   - RLS enabled on both tables.
   - Grant SELECT to anon + authenticated so the dashboard can read cached data.
   - Grant all needed verbs to service_role (used by the backend function).
   - Policies allow public read (cached market data is not user-owned, single-tenant app);
     writes happen only through the backend using the service role.
*/

CREATE TABLE IF NOT EXISTS market_data_cache (
  cache_key text PRIMARY KEY,
  payload jsonb NOT NULL,
  provider text NOT NULL DEFAULT 'Twelve Data',
  symbol text NOT NULL,
  timeframe text NOT NULL DEFAULT '1m',
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS market_engine_state (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_processed_candle text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE market_data_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_engine_state ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON market_data_cache TO anon, authenticated;
GRANT SELECT ON market_engine_state TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON market_data_cache TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON market_engine_state TO service_role;

DROP POLICY IF EXISTS "Public read market data cache" ON market_data_cache;
CREATE POLICY "Public read market data cache"
ON market_data_cache FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read engine state" ON market_engine_state;
CREATE POLICY "Public read engine state"
ON market_engine_state FOR SELECT
TO anon, authenticated USING (true);

INSERT INTO market_engine_state (id) VALUES (1) ON CONFLICT DO NOTHING;
