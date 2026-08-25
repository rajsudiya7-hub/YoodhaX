/*
  # YODDHA X Trading Application Schema

  1. New Tables
    - `users`
      - `id` (uuid, primary key) - User identifier
      - `email` (text, unique) - User email
      - `name` (text) - User display name
      - `country` (text) - Country of user
      - `currency` (text) - Preferred currency (INR, USD, EUR, etc.)
      - `created_at` (timestamp) - Account creation time
      - `updated_at` (timestamp) - Last update time

    - `signals_history`
      - `id` (uuid, primary key) - Signal record identifier
      - `user_id` (uuid, foreign key) - User who generated/viewed the signal
      - `asset` (text) - Trading asset (EURUSD, BTCUSD, etc.)
      - `timeframe` (integer) - Timeframe in minutes (5, 15, 45, 60, 120, 180, 240, 1440)
      - `signal_type` (text) - CALL or PUT
      - `price_target` (integer) - Expected price movement in points
      - `confidence` (integer) - Win rate percentage (82-94%)
      - `market_type` (text) - 'real' or 'otc'
      - `generated_at` (timestamp) - When signal was generated
      - `created_at` (timestamp) - Record creation time

  2. Security
    - Enable RLS on both tables
    - Users can only view their own profile
    - Users can view their own signal history
    - Public read access for viewing own user info (via RLS policies)

  3. Indexes
    - Index on users.email for faster authentication lookups
    - Index on signals_history.user_id for efficient signal history retrieval
    - Index on signals_history.generated_at for time-based queries
*/

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  country text NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create signals history table
CREATE TABLE IF NOT EXISTS signals_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset text NOT NULL,
  timeframe integer NOT NULL,
  signal_type text NOT NULL CHECK (signal_type IN ('CALL', 'PUT')),
  price_target integer NOT NULL,
  confidence integer NOT NULL CHECK (confidence >= 82 AND confidence <= 94),
  market_type text NOT NULL CHECK (market_type IN ('real', 'otc')),
  generated_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Enable RLS on signals_history table
ALTER TABLE signals_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can read own profile"
  ON users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- RLS Policies for signals_history table
CREATE POLICY "Users can view own signals history"
  ON signals_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own signals"
  ON signals_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_signals_user_id ON signals_history(user_id);
CREATE INDEX IF NOT EXISTS idx_signals_generated_at ON signals_history(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_market_type ON signals_history(market_type);
