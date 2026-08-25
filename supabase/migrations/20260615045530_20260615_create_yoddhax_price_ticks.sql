-- YODDHA X Price Tick Data Table
CREATE TABLE yoddhax_price_ticks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  asset TEXT NOT NULL,
  price DECIMAL(18,6) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries by asset
CREATE INDEX idx_yoddhax_asset ON yoddhax_price_ticks(asset);
CREATE INDEX idx_yoddhax_timestamp ON yoddhax_price_ticks(timestamp DESC);

-- Enable RLS
ALTER TABLE yoddhax_price_ticks ENABLE ROW LEVEL SECURITY;

-- Public insert policy (needed for external Tampermonkey script)
CREATE POLICY "public_insert_ticks" ON yoddhax_price_ticks 
  FOR INSERT WITH CHECK (true);

-- Public select policy for dashboard
CREATE POLICY "public_select_ticks" ON yoddhax_price_ticks 
  FOR SELECT USING (true);

-- Connection status table
CREATE TABLE yoddhax_bridge_status (
  id INTEGER PRIMARY KEY DEFAULT 1,
  is_connected BOOLEAN DEFAULT false,
  last_ping TIMESTAMPTZ,
  active_asset TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Insert default row
INSERT INTO yoddhax_bridge_status (id, is_connected, active_asset) 
VALUES (1, false, 'EUR/USD');

-- Enable RLS
ALTER TABLE yoddhax_bridge_status ENABLE ROW LEVEL SECURITY;

-- Public policies for bridge status
CREATE POLICY "public_select_status" ON yoddhax_bridge_status 
  FOR SELECT USING (true);

CREATE POLICY "public_update_status" ON yoddhax_bridge_status 
  FOR UPDATE USING (true);

-- Trading signals placeholder table
CREATE TABLE yoddhax_signals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  asset TEXT NOT NULL,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('CALL', 'PUT', 'HOLD')),
  price DECIMAL(18,6) NOT NULL,
  confidence DECIMAL(3,2) DEFAULT 0.00,
  pattern_detected TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE yoddhax_signals ENABLE ROW LEVEL SECURITY;

-- Public policies
CREATE POLICY "public_select_signals" ON yoddhax_signals 
  FOR SELECT USING (true);

CREATE POLICY "public_insert_signals" ON yoddhax_signals 
  FOR INSERT WITH CHECK (true);

-- Enable real-time for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE yoddhax_price_ticks;
ALTER PUBLICATION supabase_realtime ADD TABLE yoddhax_bridge_status;
ALTER PUBLICATION supabase_realtime ADD TABLE yoddhax_signals;