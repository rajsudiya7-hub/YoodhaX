/*
  # Pattern Library Table for YODDHA X AI Visual Engine

  1. New Tables
    - `pattern_library`
      - `id` (text, primary key)
      - `hash` (text, unique pattern identifier)
      - `candles_data` (jsonb, candle sequence)
      - `outcome` (text: WIN/LOSS/WAIT)
      - `confidence` (integer)
      - `occurrences` (integer)
      - `wins` (integer)
      - `losses` (integer)
      - `timeframe` (integer)
      - `asset` (text)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
  
  2. Security
    - Enable RLS on `pattern_library` table
    - Public read access for all users
    - Authenticated users can insert/update
*/

CREATE TABLE IF NOT EXISTS pattern_library (
  id TEXT PRIMARY KEY,
  hash TEXT UNIQUE NOT NULL,
  candles_data JSONB DEFAULT '[]'::jsonb,
  outcome TEXT DEFAULT 'WAIT' CHECK (outcome IN ('WIN', 'LOSS', 'WAIT')),
  confidence INTEGER DEFAULT 50 CHECK (confidence >= 0 AND confidence <= 100),
  occurrences INTEGER DEFAULT 1,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  timeframe INTEGER DEFAULT 1,
  asset TEXT DEFAULT 'UNKNOWN',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE pattern_library ENABLE ROW LEVEL SECURITY;

-- Public can read patterns
CREATE POLICY "Public can read patterns"
  ON pattern_library FOR SELECT
  USING (true);

-- Authenticated users can insert patterns
CREATE POLICY "Authenticated users can insert patterns"
  ON pattern_library FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Authenticated users can update patterns
CREATE POLICY "Authenticated users can update patterns"
  ON pattern_library FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_pattern_library_hash ON pattern_library(hash);
CREATE INDEX IF NOT EXISTS idx_pattern_library_outcome ON pattern_library(outcome);
CREATE INDEX IF NOT EXISTS idx_pattern_library_confidence ON pattern_library(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_pattern_library_occurrences ON pattern_library(occurrences DESC);
