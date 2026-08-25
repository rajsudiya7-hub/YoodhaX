import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, Accept, Origin, X-Requested-With, Access-Control-Request-Method, Access-Control-Request-Headers",
  "Access-Control-Max-Age": "86400",
  "Access-Control-Allow-Credentials": "true",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Timeframe configurations (in seconds)
const TIMEFRAMES: Record<string, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
};

interface PriceTickRequest {
  asset: string;
  price: number;
  timestamp?: number | string;
  timeframe?: string;
}

interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
  open_time: Date;
  close_time: Date;
  ticks: number[];
}

// Candlestick pattern detection
function detectPatterns(candles: OHLC[]): { name: string; type: string }[] {
  if (candles.length < 2) return [];

  const patterns: { name: string; type: string }[] = [];
  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  const body = Math.abs(current.close - current.open);
  const upperWick = current.high - Math.max(current.open, current.close);
  const lowerWick = Math.min(current.open, current.close) - current.low;
  const range = current.high - current.low || 1;

  const prevBody = Math.abs(prev.close - prev.open);
  const prevType = prev.close >= prev.open ? "GREEN" : "RED";
  const currType = current.close >= current.open ? "GREEN" : "RED";

  // Single candle patterns
  // DOJI
  if (body / range < 0.1) {
    patterns.push({ name: "DOJI", type: "NEUTRAL" });
  }

  // HAMMER
  if (lowerWick >= body * 2 && upperWick < body * 0.5 && currType === "GREEN") {
    patterns.push({ name: "HAMMER", type: "BULLISH" });
  }

  // SHOOTING STAR
  if (upperWick >= body * 2 && lowerWick < body * 0.5 && currType === "RED") {
    patterns.push({ name: "SHOOTING STAR", type: "BEARISH" });
  }

  // MARUBOZU
  if (body / range > 0.9) {
    patterns.push({
      name: currType === "GREEN" ? "BULLISH MARUBOZU" : "BEARISH MARUBOZU",
      type: currType === "GREEN" ? "BULLISH" : "BEARISH"
    });
  }

  // Two candle patterns
  if (candles.length >= 2) {
    // BULLISH ENGULFING
    if (prevType === "RED" && currType === "GREEN" &&
        current.open < prev.close && current.close > prev.open) {
      patterns.push({ name: "BULLISH ENGULFING", type: "BULLISH" });
    }

    // BEARISH ENGULFING
    if (prevType === "GREEN" && currType === "RED" &&
        current.open > prev.close && current.close < prev.open) {
      patterns.push({ name: "BEARISH ENGULFING", type: "BEARISH" });
    }

    // PIERCING LINE
    if (prevType === "RED" && currType === "GREEN" &&
        current.open < prev.low &&
        current.close > (prev.open + prev.close) / 2) {
      patterns.push({ name: "PIERCING LINE", type: "BULLISH" });
    }

    // DARK CLOUD COVER
    if (prevType === "GREEN" && currType === "RED" &&
        current.open > prev.high &&
        current.close < (prev.open + prev.close) / 2) {
      patterns.push({ name: "DARK CLOUD COVER", type: "BEARISH" });
    }
  }

  // Three candle patterns
  if (candles.length >= 3) {
    const prev2 = candles[candles.length - 3];
    const prev2Type = prev2.close >= prev2.open ? "GREEN" : "RED";

    // MORNING STAR
    if (prev2Type === "RED" && prevBody < prev2.open * 0.01 && currType === "GREEN") {
      patterns.push({ name: "MORNING STAR", type: "BULLISH" });
    }

    // EVENING STAR
    if (prev2Type === "GREEN" && prevBody < prev2.open * 0.01 && currType === "RED") {
      patterns.push({ name: "EVENING STAR", type: "BEARISH" });
    }

    // THREE WHITE SOLDIERS
    if (prev2Type === "GREEN" && prevType === "GREEN" && currType === "GREEN" &&
        prev.open > prev2.open && current.open > prev.open &&
        prev.close > prev2.close && current.close > prev.close) {
      patterns.push({ name: "THREE WHITE SOLDIERS", type: "BULLISH" });
    }

    // THREE BLACK CROWS
    if (prev2Type === "RED" && prevType === "RED" && currType === "RED" &&
        prev.open < prev2.open && current.open < prev.open &&
        prev.close < prev2.close && current.close < prev.close) {
      patterns.push({ name: "THREE BLACK CROWS", type: "BEARISH" });
    }
  }

  return patterns;
}

// Calculate Fibonacci levels
function calculateFibonacci(candles: OHLC[]): { level: number; value: number; nearest: string } {
  if (candles.length < 5) {
    return { level: 0.5, value: 0, nearest: "" };
  }

  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);

  const high = Math.max(...highs);
  const low = Math.min(...lows);
  const range = high - low || 1;
  const current = candles[candles.length - 1].close;

  const levels = [
    { name: "0%", level: 0, value: low },
    { name: "23.6%", level: 0.236, value: low + range * 0.236 },
    { name: "38.2%", level: 0.382, value: low + range * 0.382 },
    { name: "50%", level: 0.5, value: low + range * 0.5 },
    { name: "61.8%", level: 0.618, value: low + range * 0.618 },
    { name: "78.6%", level: 0.786, value: low + range * 0.786 },
    { name: "100%", level: 1, value: high },
  ];

  let nearest = levels[0];
  let minDist = Math.abs(current - levels[0].value);

  for (const level of levels) {
    const dist = Math.abs(current - level.value);
    if (dist < minDist) {
      minDist = dist;
      nearest = level;
    }
  }

  return {
    level: nearest.level,
    value: nearest.value,
    nearest: nearest.name
  };
}

// Generate trading signal
async function generateSignal(
  asset: string,
  candles: OHLC[],
  currentPrice: number,
  timeframe: number
): Promise<void> {
  if (candles.length < 5) return;

  const patterns = detectPatterns(candles);
  const fibonacci = calculateFibonacci(candles);

  if (patterns.length === 0) return;

  // Find strongest pattern
  const bullishPatterns = patterns.filter(p => p.type === "BULLISH");
  const bearishPatterns = patterns.filter(p => p.type === "BEARISH");

  let signalType = "HOLD";
  let confidence = 0;
  let topPattern = patterns[0];

  if (bullishPatterns.length > bearishPatterns.length) {
    signalType = "CALL";
    confidence = 0.7 + bullishPatterns.length * 0.05;
    topPattern = bullishPatterns[0];
  } else if (bearishPatterns.length > bullishPatterns.length) {
    signalType = "PUT";
    confidence = 0.7 + bearishPatterns.length * 0.05;
    topPattern = bearishPatterns[0];
  }

  if (signalType === "HOLD" || confidence < 0.7) return;

  // Build technical reason
  const technicalReasons: string[] = [];
  technicalReasons.push(`${topPattern.name} pattern detected`);

  if (fibonacci.nearest && Math.abs(currentPrice - fibonacci.value) / currentPrice < 0.01) {
    technicalReasons.push(`Fibonacci ${fibonacci.nearest} breakout`);
    confidence = Math.min(confidence + 0.1, 0.95);
  }

  // Store signal
  await supabase.from("yoddhax_signals").insert({
    asset,
    signal_type: signalType,
    price: currentPrice,
    confidence: Math.min(confidence, 0.95),
    technical_reason: technicalReasons.join(" + "),
    patterns_detected: patterns.map(p => p.name),
    fibonacci_level: fibonacci.nearest || null,
    timeframe,
  });
}

// Get or create OHLC candle
async function processOHLC(
  asset: string,
  price: number,
  timestamp: Date,
  timeframeSeconds: number
): Promise<OHLC | null> {
  const candleStart = new Date(Math.floor(timestamp.getTime() / (timeframeSeconds * 1000)) * (timeframeSeconds * 1000));
  const candleEnd = new Date(candleStart.getTime() + timeframeSeconds * 1000);

  // Check if candle exists
  const { data: existingCandle, error } = await supabase
    .from("yoddhax_ohlc_candles")
    .select("*")
    .eq("asset", asset)
    .eq("timeframe", timeframeSeconds)
    .eq("candle_start", candleStart.toISOString())
    .maybeSingle();

  if (error) {
    console.error("Error fetching candle:", error);
    return null;
  }

  // Fetch price ticks for this candle
  const { data: ticks } = await supabase
    .from("yoddhax_price_ticks")
    .select("price, timestamp")
    .eq("asset", asset)
    .gte("timestamp", candleStart.toISOString())
    .lte("timestamp", candleEnd.toISOString())
    .order("timestamp", { ascending: true });

  const prices = ticks?.map(t => t.price) || [];

  if (prices.length === 0) return null;

  const open = prices[0];
  const close = prices[prices.length - 1];
  const high = Math.max(...prices);
  const low = Math.min(...prices);

  const ohlc: OHLC = {
    open,
    high,
    low,
    close,
    open_time: candleStart,
    close_time: candleEnd,
    ticks: prices,
  };

  // Upsert candle
  if (existingCandle) {
    await supabase
      .from("yoddhax_ohlc_candles")
      .update({
        high_price: high,
        low_price: low,
        close_price: close,
        candle_type: close >= open ? "GREEN" : "RED",
        tick_count: prices.length,
      })
      .eq("id", existingCandle.id);
  } else {
    await supabase
      .from("yoddhax_ohlc_candles")
      .insert({
        asset,
        timeframe: timeframeSeconds,
        open_price: open,
        high_price: high,
        low_price: low,
        close_price: close,
        candle_type: close >= open ? "GREEN" : "RED",
        candle_start: candleStart.toISOString(),
        candle_end: candleEnd.toISOString(),
        tick_count: prices.length,
      });
  }

  return ohlc;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  // Handle GET for health check
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        status: "ok",
        service: "YODDHA X Price Feed API with Technical Analysis",
        version: "2.0.0",
        features: ["OHLC Construction", "Candlestick Patterns", "Fibonacci Analysis"],
        timestamp: new Date().toISOString()
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    let body: PriceTickRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate
    if (!body.asset || typeof body.asset !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing 'asset' field" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (typeof body.price !== "number" || isNaN(body.price)) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'price' field" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const timestamp = body.timestamp
      ? new Date(body.timestamp)
      : new Date();

    const timeframeKey = body.timeframe || "1m";
    const timeframeSeconds = TIMEFRAMES[timeframeKey] || 60;

    // Insert price tick
    const { data: insertedTick, error: insertError } = await supabase
      .from("yoddhax_price_ticks")
      .insert({
        asset: body.asset.trim(),
        price: body.price,
        timestamp: timestamp.toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to store price tick", details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Process OHLC for all timeframes
    const ohlcResults: Record<string, OHLC | null> = {};

    for (const [tfName, tfSeconds] of Object.entries(TIMEFRAMES)) {
      ohlcResults[tfName] = await processOHLC(body.asset.trim(), body.price, timestamp, tfSeconds);
    }

    // Get recent candles for pattern analysis (1m timeframe)
    const { data: recentCandles } = await supabase
      .from("yoddhax_ohlc_candles")
      .select("*")
      .eq("asset", body.asset.trim())
      .eq("timeframe", timeframeSeconds)
      .order("candle_start", { ascending: false })
      .limit(10);

    // Convert to OHLC format for pattern detection
    const candleData: OHLC[] = recentCandles?.map(c => ({
      open: parseFloat(c.open_price),
      high: parseFloat(c.high_price),
      low: parseFloat(c.low_price),
      close: parseFloat(c.close_price),
      open_time: new Date(c.candle_start),
      close_time: new Date(c.candle_end),
      ticks: [],
    })).reverse() || [];

    // Generate signal if we have enough candles
    if (candleData.length >= 5) {
      await generateSignal(body.asset.trim(), candleData, body.price, timeframeSeconds);
    }

    // Update bridge status
    await supabase
      .from("yoddhax_bridge_status")
      .update({
        is_connected: true,
        last_ping: new Date().toISOString(),
        active_asset: body.asset.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    // Count created signals
    const { count: signalCount } = await supabase
      .from("yoddhax_signals")
      .select("*", { count: "exact", head: true });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Price tick received and processed",
        data: {
          id: insertedTick?.id,
          asset: body.asset.trim(),
          price: body.price,
          timestamp: timestamp.toISOString(),
        },
        ohlc: Object.fromEntries(
          Object.entries(ohlcResults)
            .filter(([_, v]) => v !== null)
            .map(([k, v]) => [k, {
              open: v?.open,
              high: v?.high,
              low: v?.low,
              close: v?.close,
              type: v?.close && v?.open ? (v.close >= v.open ? "GREEN" : "RED") : "UNKNOWN",
            }])
        ),
        total_signals: signalCount || 0,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error processing request:", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Internal server error", details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
