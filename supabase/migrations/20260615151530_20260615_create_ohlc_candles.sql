-- YODDHA X OHLC Candles Storage
CREATE TABLE yoddhax_ohlc_candles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  asset TEXT NOT NULL,
  timeframe INTEGER NOT NULL DEFAULT 60,
  open_price DECIMAL(18,6) NOT NULL,
  high_price DECIMAL(18,6) NOT NULL,
  low_price DECIMAL(18,6) NOT NULL,
  close_price DECIMAL(18,6) NOT NULL,
  candle_type TEXT NOT NULL CHECK (candle_type IN ('GREEN', 'RED')),
  candle_start TIMESTAMPTZ NOT NULL,
  candle_end TIMESTAMPTZ NOT NULL,
  tick_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for OHLC candles
CREATE INDEX idx_ohlc_asset_timeframe ON yoddhax_ohlc_candles(asset, timeframe);
CREATE INDEX idx_ohlc_candle_start ON yoddhax_ohlc_candles(candle_start DESC);

-- Enable RLS
ALTER TABLE yoddhax_ohlc_candles ENABLE ROW LEVEL SECURITY;

-- Public policies
CREATE POLICY "public_select_ohlc" ON yoddhax_ohlc_candles 
  FOR SELECT USING (true);

CREATE POLICY "public_insert_ohlc" ON yoddhax_ohlc_candles 
  FOR INSERT WITH CHECK (true);

-- Update signals table with more fields
ALTER TABLE yoddhax_signals ADD COLUMN IF NOT EXISTS technical_reason TEXT;
ALTER TABLE yoddhax_signals ADD COLUMN IF NOT EXISTS patterns_detected TEXT[];
ALTER TABLE yoddhax_signals ADD COLUMN IF NOT EXISTS fibonacci_level TEXT;
ALTER TABLE yoddhax_signals ADD COLUMN IF NOT EXISTS confidence DECIMAL(3,2) DEFAULT 0.00;
ALTER TABLE yoddhax_signals ADD COLUMN IF NOT EXISTS timeframe INTEGER DEFAULT 60;

-- Enable realtime for OHLC
ALTER PUBLICATION supabase_realtime ADD TABLE yoddhax_ohlc_candles;