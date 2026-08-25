import { createClient } from "@supabase/supabase-js";

// Direct Supabase credentials for live market data
const SUPABASE_URL = "https://g0ncmis4xr2i-3yvmkdi.supabase.co";
const SUPABASE_KEY = "sb_publishable_G0NcMis4XR2I-3yvmkDiwg_vM9qm07b";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Live candle data interface
export interface LiveCandle {
  id: string;
  asset: string;
  timeframe: number;
  candle_type: "GREEN" | "RED";
  open_price: number;
  close_price: number;
  high_price: number;
  low_price: number;
  volume: number;
  candle_start: number;
  candle_end: number;
  created_at: string;
  updated_at: string;
}

// Fetch latest live candle for an asset and timeframe
export async function fetchLiveCandle(asset: string, timeframeMinutes: number): Promise<LiveCandle | null> {
  try {
    const { data, error } = await supabase
      .from("market_live_data")
      .select("*")
      .eq("asset", asset)
      .eq("timeframe", timeframeMinutes)
      .order("candle_start", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error fetching live candle:", error);
      return null;
    }

    return data as LiveCandle | null;
  } catch (err) {
    console.error("Exception fetching live candle:", err);
    return null;
  }
}

// Fetch last N candles for backtesting
export async function fetchLiveCandles(asset: string, timeframeMinutes: number, limit: number = 100): Promise<LiveCandle[]> {
  try {
    const { data, error } = await supabase
      .from("market_live_data")
      .select("*")
      .eq("asset", asset)
      .eq("timeframe", timeframeMinutes)
      .order("candle_start", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching live candles:", error);
      return [];
    }

    return (data as LiveCandle[]) || [];
  } catch (err) {
    console.error("Exception fetching live candles:", err);
    return [];
  }
}

// Subscribe to real-time candle updates
export function subscribeToLiveCandles(
  asset: string,
  timeframeMinutes: number,
  onNewCandle: (candle: LiveCandle) => void
) {
  const channel = supabase
    .channel(`live-candles-${asset}-${timeframeMinutes}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "market_live_data",
        filter: `asset=eq.${asset}`,
      },
      (payload) => {
        const candle = payload.new as LiveCandle;
        if (candle.timeframe === timeframeMinutes) {
          onNewCandle(candle);
        }
      }
    )
    .subscribe();

  return channel;
}

// Store signal history
export async function storeSignalHistory(signal: {
  user_id?: string;
  asset: string;
  timeframe: number;
  signal_type: "CALL" | "PUT";
  price_target: number;
  confidence: number;
  market_type: "real" | "otc";
  generated_at: number;
}): Promise<boolean> {
  try {
    const { error } = await supabase.from("signals_history").insert({
      user_id: signal.user_id || null,
      asset: signal.asset,
      timeframe: signal.timeframe,
      signal_type: signal.signal_type,
      price_target: signal.price_target,
      confidence: signal.confidence,
      market_type: signal.market_type,
      generated_at: new Date(signal.generated_at).toISOString(),
    });

    if (error) {
      console.error("Error storing signal:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Exception storing signal:", err);
    return false;
  }
}
