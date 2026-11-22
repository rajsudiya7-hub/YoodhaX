import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ============================================
// TRADER YODDHA X - MARKET DATA API (backend)
// Real data only. Provider: Twelve Data.
// API key lives in edge function secrets; never in frontend code.
// ============================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWELVE_DATA_API_KEY = Deno.env.get("TWELVE_DATA_API_KEY") ?? "";
const PROVIDER_NAME = "Twelve Data";

// Supported symbols: Forex majors + Gold.
const SYMBOLS: Record<string, { providerSymbol: string; label: string }> = {
  EURUSD: { providerSymbol: "EUR/USD", label: "EUR/USD - Euro / US Dollar" },
  GBPUSD: { providerSymbol: "GBP/USD", label: "GBP/USD - British Pound / US Dollar" },
  USDJPY: { providerSymbol: "USD/JPY", label: "USD/JPY - US Dollar / Japanese Yen" },
  AUDUSD: { providerSymbol: "AUD/USD", label: "AUD/USD - Australian Dollar / US Dollar" },
  USDCAD: { providerSymbol: "USD/CAD", label: "USD/CAD - US Dollar / Canadian Dollar" },
  USDCHF: { providerSymbol: "USD/CHF", label: "USD/CHF - US Dollar / Swiss Franc" },
  NZDUSD: { providerSymbol: "NZD/USD", label: "NZD/USD - New Zealand Dollar / US Dollar" },
  XAUUSD: { providerSymbol: "XAU/USD", label: "XAU/USD - Gold / US Dollar" },
};

const CANDLE_CACHE_TTL_MS = 25_000;
const PRICE_CACHE_TTL_MS = 8_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errResponse(message: string, status = 500): Response {
  return json({ error: message }, status);
}

// ---------- Supabase cache (durable, shared across function instances) ----------

interface CacheRow {
  payload: unknown;
  fetchedAt: number;
}

async function cacheGet(key: string): Promise<CacheRow | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/market_data_cache?cache_key=eq.${encodeURIComponent(key)}&select=payload,fetched_at`,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return { payload: rows[0].payload, fetchedAt: new Date(rows[0].fetched_at + "Z").getTime() };
}

async function cacheSet(
  key: string,
  payload: unknown,
  symbol: string,
  timeframe: string
): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/market_data_cache?cache_key=eq.${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      cache_key: key,
      payload,
      symbol,
      timeframe,
      provider: PROVIDER_NAME,
      fetched_at: new Date().toISOString(),
    }),
  });
}

async function readLastProcessed(): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/market_engine_state?id=eq.1&select=last_processed_candle`,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0]?.last_processed_candle ?? null;
}

async function writeLastProcessed(value: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/market_engine_state?id=eq.1`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ last_processed_candle: value, updated_at: new Date().toISOString() }),
  });
}

// ---------- Twelve Data provider ----------

export interface ProviderCandle {
  time: number; // unix seconds (candle open time)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchCandlesFromProvider(
  providerSymbol: string,
  limit: number
): Promise<ProviderCandle[]> {
  if (!TWELVE_DATA_API_KEY) {
    throw new Error("DATA_CONNECTION_ERROR: market data provider key is not configured on the backend");
  }
  const url =
    `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(providerSymbol)}` +
    `&interval=1min&outputsize=${Math.min(5000, limit)}&apikey=${TWELVE_DATA_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`DATA_CONNECTION_ERROR: provider HTTP ${res.status}`);
  }
  const data = await res.json();

  if (data.status === "error" || data.message) {
    throw new Error(`DATA_CONNECTION_ERROR: ${data.message ?? "provider rejected the request"}`);
  }
  const values = data.values;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("DATA_CONNECTION_ERROR: provider returned no candles");
  }

  // Twelve Data datetimes are UTC by default for time_series; normalize to unix seconds.
  return values.map((v: Record<string, string>) => ({
    time: Math.floor(new Date(v.datetime.replace(" ", "T") + "Z").getTime() / 1000),
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
    volume: v.volume !== undefined ? parseInt(v.volume, 10) || 0 : 0,
  }));
}

async function fetchPriceFromProvider(
  providerSymbol: string
): Promise<{ price: number; timestamp: number }> {
  if (!TWELVE_DATA_API_KEY) {
    throw new Error("DATA_CONNECTION_ERROR: market data provider key is not configured on the backend");
  }
  const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(providerSymbol)}&apikey=${TWELVE_DATA_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`DATA_CONNECTION_ERROR: provider HTTP ${res.status}`);
  const data = await res.json();
  if (data.status === "error" || !data.price) {
    throw new Error(`DATA_CONNECTION_ERROR: ${data.message ?? "no price available"}`);
  }
  return { price: parseFloat(data.price), timestamp: Date.now() };
}

// ---------- Request handling ----------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    // Path after the /functions/v1/market-api mount
    const rawPath = url.pathname;
    const idx = rawPath.indexOf("/market-api");
    const path = idx >= 0 ? rawPath.slice(idx + "/market-api".length) : rawPath;
    const route = path === "" || path === "/" ? "/" : path.replace(/\/+$/, "");

    if (req.method === "GET" && route === "/symbols") {
      const list = Object.values(SYMBOLS).map((s) => ({
        symbol: s.providerSymbol.replace("/", ""),
        label: s.label,
      }));
      return json({ provider: PROVIDER_NAME, symbols: list });
    }

    if (req.method === "GET" && route === "/candles") {
      const symbol = (url.searchParams.get("symbol") ?? "EURUSD").toUpperCase();
      const timeframe = url.searchParams.get("timeframe") ?? "1m";
      const limit = Math.max(1, Math.min(500, parseInt(url.searchParams.get("limit") ?? "250", 10) || 250));

      if (timeframe !== "1m") {
        return errResponse("Only the 1m timeframe is supported by this engine", 400);
      }
      const meta = SYMBOLS[symbol];
      if (!meta) return errResponse(`Unsupported symbol: ${symbol}`, 400);

      const cacheKey = `candles:${symbol}:1m`;
      const cached = await cacheGet(cacheKey);
      if (cached && Date.now() - cached.fetchedAt < CANDLE_CACHE_TTL_MS) {
        const candles = cached.payload as ProviderCandle[];
        return json({
          symbol,
          timeframe: "1m",
          provider: PROVIDER_NAME,
          fetchedAt: new Date(cached.fetchedAt).toISOString(),
          candles: candles.slice(-limit),
        });
      }

      const candles = await fetchCandlesFromProvider(meta.providerSymbol, Math.max(500, limit));
      await cacheSet(cacheKey, candles, symbol, "1m");
      return json({
        symbol,
        timeframe: "1m",
        provider: PROVIDER_NAME,
        fetchedAt: new Date().toISOString(),
        candles: candles.slice(-limit),
      });
    }

    if (req.method === "GET" && route === "/price") {
      const symbol = (url.searchParams.get("symbol") ?? "EURUSD").toUpperCase();
      const meta = SYMBOLS[symbol];
      if (!meta) return errResponse(`Unsupported symbol: ${symbol}`, 400);

      const cacheKey = `price:${symbol}`;
      const cached = await cacheGet(cacheKey);
      if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS) {
        return json({
          symbol,
          provider: PROVIDER_NAME,
          ...(cached.payload as { price: number; timestamp: number }),
        });
      }

      const priceData = await fetchPriceFromProvider(meta.providerSymbol);
      await cacheSet(cacheKey, priceData, symbol, "price");
      return json({ symbol, provider: PROVIDER_NAME, ...priceData });
    }

    if (req.method === "GET" && route === "/status") {
      const lastProcessed = await readLastProcessed();
      return json({
        provider: PROVIDER_NAME,
        providerConfigured: TWELVE_DATA_API_KEY.length > 0,
        lastProcessedCandle: lastProcessed,
        serverTime: new Date().toISOString(),
      });
    }

    if (req.method === "POST" && route === "/processed") {
      const body = await req.json().catch(() => null);
      const value = body?.lastProcessedCandle;
      if (typeof value !== "string" || value.length === 0) {
        return errResponse("lastProcessedCandle is required", 400);
      }
      await writeLastProcessed(value);
      return json({ success: true, lastProcessedCandle: value });
    }

    return errResponse("Not found", 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown backend error";
    if (message.startsWith("DATA_CONNECTION_ERROR")) {
      return errResponse(message, 503);
    }
    return errResponse(message, 500);
  }
});
