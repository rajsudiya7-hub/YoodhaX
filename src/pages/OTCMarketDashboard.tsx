import React, { useCallback, useEffect, useRef, useState } from "react";

type Direction = "CALL" | "PUT" | "WAIT";
type Candle = {
  time: number; // Unix seconds, candle OPEN time
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};
type MarketResponse = {
  symbol: string;
  timeframe: "1m";
  candles: Candle[];
  source: string;
};
type SignalRecord = {
  id: string;
  symbol: string;
  direction: Direction;
  confidence: number;
  entryReference: number;
  candleTime: number;
  createdAt: number;
  reason: string[];
};
type SavedState = {
  signals: SignalRecord[];
  outcomes: { signalId: string; result: "WIN" | "LOSS"; savedAt: number }[];
};

const DB_NAME = "YoddhaX_AI_Database";
const DB_VERSION = 1;
const STORE = "brain_state_store";
const NEW_KEY = "tradingview_engine_v1";
const SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD", "XAUUSD"];

function openBrainDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function loadSavedState(): Promise<SavedState> {
  const db = await openBrainDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(NEW_KEY);
    req.onsuccess = () => resolve(req.result ?? { signals: [], outcomes: [] });
    req.onerror = () => reject(req.error);
  });
}
async function saveSavedState(state: SavedState) {
  const db = await openBrainDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(state, NEW_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let result = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (const value of values.slice(period)) result = value * k + result * (1 - k);
  return result;
}
function rsi(values: number[], period = 14): number | null {
  if (values.length <= period) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change > 0) gains += change; else losses -= change;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}
function analyze(candles: Candle[]): { direction: Direction; confidence: number; reason: string[] } {
  if (candles.length < 210) return { direction: "WAIT", confidence: 0, reason: ["कम-से-कम 210 बंद 1-minute candles चाहिए"] };
  const closes = candles.map(c => c.close);
  const e20 = ema(closes, 20), e50 = ema(closes, 50), e170 = ema(closes, 170), e200 = ema(closes, 200);
  const r = rsi(closes, 14);
  if ([e20, e50, e170, e200, r].some(v => v === null)) return { direction: "WAIT", confidence: 0, reason: ["Indicator data अधूरा है"] };

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const bullishTrend = e20! > e50! && e50! > e170! && e170! > e200!;
  const bearishTrend = e20! < e50! && e50! < e170! && e170! < e200!;
  const bullishCandle = last.close > last.open && last.close > prev.close;
  const bearishCandle = last.close < last.open && last.close < prev.close;
  const reasons: string[] = [
    `EMA20 ${e20!.toFixed(5)} | EMA50 ${e50!.toFixed(5)}`,
    `EMA170 ${e170!.toFixed(5)} | EMA200 ${e200!.toFixed(5)}`,
    `RSI14 ${r!.toFixed(1)}`
  ];

  // Conservative example rules; validate with backtesting before live use.
  if (bullishTrend && bullishCandle && r! >= 50 && r! <= 68) {
    reasons.push("चारों EMA bullish क्रम में; candle confirmation मिला");
    return { direction: "CALL", confidence: 0.7, reason: reasons };
  }
  if (bearishTrend && bearishCandle && r! <= 50 && r! >= 32) {
    reasons.push("चारों EMA bearish क्रम में; candle confirmation मिला");
    return { direction: "PUT", confidence: 0.7, reason: reasons };
  }
  reasons.push("Trend, RSI और candle confirmation एक दिशा में नहीं हैं");
  return { direction: "WAIT", confidence: 0, reason: reasons };
}

async function getCandles(symbol: string, signal?: AbortSignal): Promise<MarketResponse> {
  // This endpoint must be implemented on your server and connected to a licensed data provider.
  const response = await fetch(
    `/api/market/candles?symbol=${encodeURIComponent(symbol)}&timeframe=1m&limit=250`,
    { cache: "no-store", signal, headers: { Accept: "application/json" } }
  );
  if (!response.ok) throw new Error(`Market API error: HTTP ${response.status}`);
  const data = await response.json() as MarketResponse;
  if (data.timeframe !== "1m" || !Array.isArray(data.candles)) throw new Error("API response format गलत है");
  const sorted = [...data.candles].sort((a, b) => a.time - b.time);
  for (const c of sorted) {
    if (![c.time, c.open, c.high, c.low, c.close].every(Number.isFinite) ||
        c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close)) {
      throw new Error("Market API ने invalid OHLC candle भेजी है");
    }
  }
  // Exclude a still-forming candle. Only closed candles are analyzed.
  const nowSec = Math.floor(Date.now() / 1000);
  const closed = sorted.filter(c => c.time + 60 <= nowSec);
  return { ...data, candles: closed };
}

export default function YoddhaXTradingViewEngine() {
  const [symbol, setSymbol] = useState("EURUSD");
  const [status, setStatus] = useState("डेटा कनेक्शन की प्रतीक्षा में");
  const [running, setRunning] = useState(false);
  const [signal, setSignal] = useState<SignalRecord | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(60 - new Date().getSeconds());
  const [saved, setSaved] = useState<SavedState>({ signals: [], outcomes: [] });
  const [lastSource, setLastSource] = useState("—");
  const [lastCandleTime, setLastCandleTime] = useState<number | null>(null);
  const busy = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastProcessedCandle = useRef<string>("");

  useEffect(() => {
    loadSavedState().then(setSaved).catch(() => setStatus("Browser memory load नहीं हो सकी"));
    return () => abortRef.current?.abort();
  }, []);

  const runOneCycle = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setStatus(`${symbol}: बंद 1-minute candle का डेटा लिया जा रहा है…`);
      const data = await getCandles(symbol, controller.signal);
      if (data.candles.length < 210) throw new Error(`केवल ${data.candles.length} बंद candles मिलीं; 210 आवश्यक हैं`);
      const latest = data.candles[data.candles.length - 1];
      const key = `${symbol}:${latest.time}`;
      setLastSource(data.source || "licensed market-data provider");
      setLastCandleTime(latest.time);
      if (lastProcessedCandle.current === key) {
        setStatus("इस candle का analysis पहले ही हो चुका है; अगली candle का इंतज़ार है");
        return;
      }
      const result = analyze(data.candles);
      const record: SignalRecord = {
        id: key,
        symbol,
        direction: result.direction,
        confidence: result.confidence,
        entryReference: latest.close,
        candleTime: latest.time,
        createdAt: Date.now(),
        reason: result.reason
      };
      lastProcessedCandle.current = key;
      setSignal(record);
      const next: SavedState = { ...saved, signals: [record, ...saved.signals].slice(0, 500) };
      setSaved(next);
      await saveSavedState(next);
      setStatus(result.direction === "WAIT"
        ? "Analysis पूरा: अभी मजबूत setup नहीं, इसलिए WAIT"
        : `Analysis पूरा: अगले 1-minute candle के लिए ${result.direction}`);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setStatus(error instanceof Error ? error.message : "Unknown market-data error");
        setSignal(null);
      }
    } finally {
      busy.current = false;
    }
  }, [symbol, saved]);

  useEffect(() => {
    if (!running) return;
    let interval: ReturnType<typeof setInterval>;
    const tick = () => {
      const now = new Date();
      const remaining = 60 - now.getSeconds();
      setSecondsLeft(remaining === 60 ? 0 : remaining);
      // Run shortly after the minute boundary, when the prior candle is closed.
      if (now.getSeconds() === 2 && now.getMilliseconds() < 1000) void runOneCycle();
    };
    tick();
    interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [running, runOneCycle]);

  const saveOutcome = async (result: "WIN" | "LOSS") => {
    if (!signal || signal.direction === "WAIT") return;
    const next: SavedState = {
      ...saved,
      outcomes: [{ signalId: signal.id, result, savedAt: Date.now() }, ...saved.outcomes].slice(0, 1000)
    };
    setSaved(next);
    await saveSavedState(next);
    setStatus(`${result} outcome इस signal के साथ record हुआ`);
  };

  const wins = saved.outcomes.filter(x => x.result === "WIN").length;
  const losses = saved.outcomes.filter(x => x.result === "LOSS").length;
  const winRate = wins + losses ? (wins / (wins + losses)) * 100 : 0;

  return (
    <main className="min-h-screen bg-[#050b18] text-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <h1 className="text-2xl font-black tracking-wide text-cyan-300">TRADER YODHA X</h1>
            <p className="text-sm text-slate-400">1-Minute Market Data Analysis Engine</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs ${running ? "bg-emerald-900 text-emerald-300" : "bg-slate-800 text-slate-300"}`}>
            {running ? "AUTO ANALYSIS ON" : "PAUSED"}
          </span>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 md:col-span-2">
            <label className="mb-2 block text-sm text-slate-400">Forex / Gold Symbol</label>
            <div className="flex flex-wrap gap-3">
              <select value={symbol} onChange={e => { setSymbol(e.target.value); lastProcessedCandle.current = ""; setSignal(null); }}
                className="min-w-48 rounded-lg border border-slate-700 bg-slate-950 px-4 py-3">
                {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button onClick={() => setRunning(v => !v)}
                className={`rounded-lg px-5 py-3 font-bold ${running ? "bg-red-600" : "bg-emerald-600"}`}>
                {running ? "Stop Auto Analysis" : "Start Auto Analysis"}
              </button>
              <button onClick={() => void runOneCycle()} disabled={busy.current}
                className="rounded-lg bg-cyan-700 px-5 py-3 font-bold disabled:opacity-50">Analyze Latest Closed Candle</button>
            </div>
            <p className="mt-4 text-sm text-slate-400">अगला minute boundary: {secondsLeft}s के आसपास। Analysis केवल बंद candle पर होगा।</p>
            <p className="mt-2 break-words text-xs text-slate-500">Status: {status}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs uppercase tracking-wider text-slate-400">Saved outcomes</p>
            <p className="mt-2 text-3xl font-bold">{winRate.toFixed(1)}%</p>
            <p className="text-sm text-slate-400">{wins} WIN / {losses} LOSS</p>
            <p className="mt-3 text-xs text-slate-500">ये manually दर्ज किए गए परिणाम हैं; verified broker outcomes नहीं।</p>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 md:col-span-2">
            <p className="text-xs uppercase tracking-wider text-slate-400">Next 1-minute direction</p>
            <div className={`my-4 text-center text-5xl font-black ${signal?.direction === "CALL" ? "text-emerald-400" : signal?.direction === "PUT" ? "text-red-400" : "text-amber-300"}`}>
              {signal?.direction ?? "WAIT"}
            </div>
            <div className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
              <p>Symbol: <b>{signal?.symbol ?? symbol}</b></p>
              <p>Reference close: <b>{signal?.entryReference ?? "—"}</b></p>
              <p>Confidence: <b>{signal ? `${Math.round(signal.confidence * 100)}%` : "—"}</b></p>
              <p>Data source: <b>{lastSource}</b></p>
              <p>Last closed candle: <b>{lastCandleTime ? new Date(lastCandleTime * 1000).toLocaleString() : "—"}</b></p>
            </div>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-400">
              {(signal?.reason ?? ["अभी कोई नया analysis नहीं हुआ"]).map((r, i) => <li key={i}>{r}</li>)}
            </ul>
            {signal && signal.direction !== "WAIT" && (
              <div className="mt-5 flex gap-3">
                <button onClick={() => void saveOutcome("WIN")} className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold">Record WIN</button>
                <button onClick={() => void saveOutcome("LOSS")} className="rounded-lg bg-red-700 px-4 py-2 font-semibold">Record LOSS</button>
              </div>
            )}
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="font-bold text-cyan-300">Strategy rules</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-400">
              <li>EMA 20 / 50 / 170 / 200</li>
              <li>RSI 14</li>
              <li>Closed-candle confirmation</li>
              <li>CALL / PUT / WAIT</li>
              <li>एक candle पर एक ही analysis</li>
            </ul>
            <p className="mt-4 text-xs text-amber-300">पहले demo/paper trading और backtesting करें। यह strategy लाभ की गारंटी नहीं देती।</p>
          </div>
        </section>
      </div>
    </main>
  );
}
