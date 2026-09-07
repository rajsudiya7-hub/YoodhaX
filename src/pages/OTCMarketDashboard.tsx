import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { createWorker } from "tesseract.js";

type Color = "GREEN" | "RED" | "NEUTRAL";
type Signal = "WAIT" | "CALL" | "PUT";
type Structure = "HH" | "HL" | "LH" | "LL";
type Outcome = "WIN" | "LOSS";
type Candle = {
  id: number; x: number; width: number; top: number; bottom: number;
  bodyTop: number; bodyBottom: number; closeY: number; color: Color;
  body: number; upper: number; lower: number; upperRatio: number; lowerRatio: number;
  shape: string; timestamp: number;
};
type Memory = {
  key: string; description: string; green: number; red: number; neutral: number;
  wins: number; losses: number; confidence: number; occurrences: number;
  lossStreak: number; reverse: boolean; lastOutcomeCandleId?: number;
};
type Brain = {
  memories: Memory[]; trades: Array<{ pattern: string; result: Outcome; price: number }>;
  zigzag: Array<{ price: number; type: "HIGH" | "LOW"; occurrences: number }>;
  structure: Array<{ label: Structure; y: number; candleId: number }>;
  winRate: number;
};
type Indicators = { ema9: number | null; sma20: number | null; rsi14: number | null };
type PatternFlags = {
  sequential7: boolean;
  breakdown: boolean;
  wickRejection: "CALL" | "PUT" | null;
  confluence: number;
  trap: boolean;
};

const DB = "TRADER_YODHA_X_AI";
const STORE = "TRADER_YODHA_X_AI_BRAIN";
const KEY = "TRADER_YODHA_X_AI_BRAIN_STATE";
const MAX_CANDLES = 120;
const ZIGZAG_DEVIATION = 5;
const ZIGZAG_DEPTH = 1;
const ZIGZAG_BACKSTEP = 3;
const token = (c: Candle) => `${c.color[0]}-${c.shape}`;
const roundNumber = (p: number) => /(?:000|500)$/.test(p.toFixed(5));
const priceText = (p: number | null) => p == null ? "—" : p.toFixed(5);
const card = "bg-[#0f172a] rounded-xl p-5 border border-slate-800";

function getIndicators(values: number[]): Indicators {
  if (!values.length) return { ema9: null, sma20: null, rsi14: null };
  let ema = values[0];
  values.slice(1).forEach((value) => { ema = value * .2 + ema * .8; });
  const sma20 = values.length >= 20 ? values.slice(-20).reduce((a, b) => a + b, 0) / 20 : null;
  const recent = values.slice(-15);
  let gain = 0; let loss = 0;
  for (let i = 1; i < recent.length; i++) {
    const delta = recent[i] - recent[i - 1];
    if (delta >= 0) gain += delta; else loss += Math.abs(delta);
  }
  const rsi14 = recent.length === 15 ? loss === 0 ? 100 : 100 - 100 / (1 + gain / loss) : null;
  return { ema9: values.length > 1 ? ema : null, sma20, rsi14 };
}

function detectCandles(data: Uint8ClampedArray, width: number, height: number): Candle[] {
  const columns = new Uint16Array(width);
  const green = new Uint16Array(width);
  const red = new Uint16Array(width);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const isGreen = data[i + 1] > data[i] + 35 && data[i + 1] > data[i + 2] + 25 && data[i + 1] > 80;
    const isRed = data[i] > data[i + 1] + 35 && data[i] > data[i + 2] + 25 && data[i] > 80;
    if (isGreen || isRed) { columns[x]++; if (isGreen) green[x]++; else red[x]++; }
  }
  const groups: Array<[number, number]> = [];
  const threshold = Math.max(2, Math.floor(height * .015));
  let start = -1;
  for (let x = 0; x <= width; x++) {
    const on = x < width && columns[x] >= threshold;
    if (on && start < 0) start = x;
    if (!on && start >= 0) { if (x - start >= 2 && x - start < width * .2) groups.push([start, x - 1]); start = -1; }
  }
  return groups.map(([left, right]) => {
    let top = height; let bottom = 0; let g = 0; let r = 0;
    for (let x = left; x <= right; x++) for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4;
      const isGreen = data[i + 1] > data[i] + 35 && data[i + 1] > data[i + 2] + 25 && data[i + 1] > 80;
      const isRed = data[i] > data[i + 1] + 35 && data[i] > data[i + 2] + 25 && data[i] > 80;
      if (isGreen || isRed) { top = Math.min(top, y); bottom = Math.max(bottom, y); if (isGreen) g++; else r++; }
    }
    const color: Color = g > r * 1.15 ? "GREEN" : r > g * 1.15 ? "RED" : "NEUTRAL";
    const bodyTop = top + Math.max(1, Math.floor((bottom - top) * .18));
    const bodyBottom = bottom - Math.max(1, Math.floor((bottom - top) * .18));
    const body = Math.max(1, bodyBottom - bodyTop);
    const upper = Math.max(0, bodyTop - top);
    const lower = Math.max(0, bottom - bodyBottom);
    const ratio = body / Math.max(1, bottom - top);
    const shape = color === "NEUTRAL" ? "INDECISION" : ratio < .12 ? "DOJI" :
      lower > body * 1.5 && lower > upper ? "LOWER_REJECTION" :
        upper > body * 1.5 && upper > lower ? "UPPER_REJECTION" :
          ratio >= .7 ? color === "GREEN" ? "BULL_STRONG" : "BEAR_STRONG" :
            color === "GREEN" ? "SMALL_BULL" : "SMALL_BEAR";
    return {
      id: 0, x: left, width: right - left + 1, top, bottom, bodyTop, bodyBottom,
      closeY: color === "RED" ? bodyBottom : bodyTop, color, body, upper, lower,
      upperRatio: upper / body, lowerRatio: lower / body, shape, timestamp: Date.now(),
    };
  }).filter((candle) => candle.color !== "NEUTRAL");
}

export default function OTCMarketDashboardClean() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [signal, setSignal] = useState<Signal>("WAIT");
  const [status, setStatus] = useState("TRADER_YODHA_X_AI OTC Engine Ready. Connect Quotex Screen.");
  const [ocrText, setOcrText] = useState("Searching...");
  const [round, setRound] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [analysis, setAnalysis] = useState<{ candles: Candle[]; price: number; confidence: number; sequence: string[]; indicators: Indicators; structure: Structure | null; reasons: string[] } | null>(null);
  const [stats, setStats] = useState({ candles: 0, memories: 0, trades: 0, zigzag: 0, structure: 0, winRate: 0 });
  const [roi, setRoi] = useState({ x: 100, y: 50, width: 500, height: 350 });
  const [locked, setLocked] = useState(false);
  const [moving, setMoving] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const ocrCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<any>(null);
  const busy = useRef(false);
  const lastOcr = useRef(0);
  const nextId = useRef(1);
  const candles = useRef<Candle[]>([]);
  const prices = useRef<number[]>([]);
  const lastSignature = useRef("");
  const pending = useRef<Signal | null>(null);
  const brain = useRef<Brain>({ memories: [], trades: [], zigzag: [], structure: [], winRate: 0 });

  const updateStats = useCallback(() => {
    setStats({
      candles: candles.current.length, memories: brain.current.memories.length,
      trades: brain.current.trades.length, zigzag: brain.current.zigzag.length,
      structure: brain.current.structure.length, winRate: brain.current.winRate,
    });
  }, []);
  const openDb = useCallback(() => new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }), []);
  const saveBrain = useCallback(async () => {
    try { const db = await openDb(); db.transaction(STORE, "readwrite").objectStore(STORE).put(brain.current, KEY); updateStats(); }
    catch (error) { console.error("[TRADER_YODHA_X_AI] IndexedDB save failed", error); }
  }, [openDb, updateStats]);

  useEffect(() => {
    void openDb().then((db) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      request.onsuccess = () => {
        if (!request.result) return;
        brain.current = { ...brain.current, ...request.result, memories: request.result.memories ?? [], trades: request.result.trades ?? [], zigzag: request.result.zigzag ?? [], structure: request.result.structure ?? [] };
        updateStats();
        setStatus(`TRADER_YODHA_X_AI memory loaded: ${brain.current.trades.length} trade memories.`);
      };
    }).catch((error) => console.error("[TRADER_YODHA_X_AI] IndexedDB load failed", error));
  }, [openDb, updateStats]);
  useEffect(() => {
    let cancelled = false;
    void createWorker("eng").then((worker) => { if (cancelled) void worker.terminate(); else workerRef.current = worker; })
      .catch((error) => console.error("[TRADER_YODHA_X_AI] OCR init failed", error));
    return () => { cancelled = true; if (workerRef.current) void workerRef.current.terminate(); workerRef.current = null; };
  }, []);
  useEffect(() => { if (videoRef.current && stream) videoRef.current.srcObject = stream; }, [stream]);

  const scaledRoi = useCallback(() => {
    const video = videoRef.current; const box = containerRef.current;
    if (!video || !box) return roi;
    const sx = (video.videoWidth || box.clientWidth) / (box.clientWidth || 1);
    const sy = (video.videoHeight || box.clientHeight) / (box.clientHeight || 1);
    return { x: Math.max(0, Math.floor(roi.x * sx)), y: Math.max(0, Math.floor(roi.y * sy)), width: Math.max(1, Math.floor(roi.width * sx)), height: Math.max(1, Math.floor(roi.height * sy)) };
  }, [roi]);

  const learn = useCallback(() => {
    if (candles.current.length <= 5) return;
    const group = candles.current.slice(-6); const previous = group.slice(0, 5); const next = group[5];
    const key = previous.map(token).join(">");
    let memory = brain.current.memories.find((item) => item.key === key);
    if (!memory) { memory = { key, description: previous.map(token).join(" → "), green: 0, red: 0, neutral: 0, wins: 0, losses: 0, confidence: 0, occurrences: 0 }; brain.current.memories.push(memory); }
    memory.occurrences++;
    if (next.color === "GREEN") memory.green++; else if (next.color === "RED") memory.red++; else memory.neutral++;
    memory.confidence = Math.max(memory.green, memory.red) / (memory.green + memory.red + memory.neutral) * 100;
  }, []);
  const updateStructure = useCallback(() => {
    const list = candles.current; if (list.length < 5) return;
    const pivot = list[list.length - 3]; const before = list[list.length - 5]; const after = list[list.length - 1];
    const high = pivot.closeY < before.closeY && pivot.closeY < after.closeY;
    const low = pivot.closeY > before.closeY && pivot.closeY > after.closeY;
    if ((!high && !low) || brain.current.structure.at(-1)?.candleId === pivot.id) return;
    const previous = [...brain.current.structure].reverse().find((item) => high ? item.label === "HH" || item.label === "LH" : item.label === "HL" || item.label === "LL");
    const label: Structure = high ? (!previous || pivot.closeY < previous.y ? "HH" : "LH") : (!previous || pivot.closeY < previous.y ? "HL" : "LL");
    brain.current.structure.push({ label, y: pivot.closeY, candleId: pivot.id });
    brain.current.structure = brain.current.structure.slice(-30);
    const price = prices.current.at(-1);
    if (price) {
      const type = high ? "HIGH" : "LOW";
      const existing = brain.current.zigzag.find((item) => item.type === type && Math.abs(item.price - price) < .0003);
      if (existing) existing.occurrences++; else brain.current.zigzag.push({ price, type, occurrences: 1 });
      brain.current.zigzag = brain.current.zigzag.slice(-30);
    }
  }, []);
  const readPrice = useCallback(async (context: CanvasRenderingContext2D) => {
    const worker = workerRef.current; const target = ocrCanvasRef.current;
    if (!worker || !target || Date.now() - lastOcr.current < 1500) return prices.current.at(-1) ?? null;
    const box = scaledRoi(); target.width = box.width; target.height = box.height;
    const targetContext = target.getContext("2d"); if (!targetContext) return null;
    targetContext.drawImage(context.canvas, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
    lastOcr.current = Date.now();
    try {
      const result = await worker.recognize(target);
      const values = result.data.text.match(/\d+\.\d{2,5}/g)?.map(Number).filter((value: number) => value > 0) ?? [];
      const price = values.at(-1);
      if (price) { prices.current = [...prices.current, price].slice(-120); const isRound = roundNumber(price); setOcrText(`${price.toFixed(5)}${isRound ? " [ROUND SNR]" : ""}`); setRound(isRound); return price; }
    } catch { /* Keep only the last observed price when the chart changes during OCR. */ }
    return prices.current.at(-1) ?? null;
  }, [scaledRoi]);
  const paint = useCallback((found: Candle[]) => {
    const canvas = overlayRef.current; const video = videoRef.current; if (!canvas || !video) return;
    canvas.width = video.videoWidth || canvas.clientWidth; canvas.height = video.videoHeight || canvas.clientHeight;
    const context = canvas.getContext("2d"); if (!context) return; context.clearRect(0, 0, canvas.width, canvas.height);
    const box = scaledRoi(); context.save(); context.translate(box.x, box.y);
    found.forEach((candle) => {
      context.strokeStyle = candle.color === "GREEN" ? "#84cc16" : "#f43f5e"; context.fillStyle = context.strokeStyle; context.lineWidth = 1.5;
      context.strokeRect(candle.x, candle.bodyTop, candle.width, Math.max(2, candle.body)); context.beginPath(); context.moveTo(candle.x + candle.width / 2, candle.top); context.lineTo(candle.x + candle.width / 2, candle.bottom); context.stroke();
      context.font = "bold 10px monospace"; context.fillText(String(candle.id), candle.x, Math.max(10, candle.top - 3));
    });
    brain.current.structure.slice(-6).forEach((point) => { const candle = found.find((item) => item.id === point.candleId); context.fillStyle = point.label === "HH" || point.label === "HL" ? "#34d399" : "#fb7185"; context.font = "bold 12px monospace"; context.fillText(point.label, candle?.x ?? 0, point.y - 6); });
    context.restore();
  }, [scaledRoi]);
  const analyzeFrame = useCallback(async () => {
    if (busy.current || !videoRef.current || !canvasRef.current) return; busy.current = true;
    try {
      const video = videoRef.current; const canvas = canvasRef.current; canvas.width = video.videoWidth || 800; canvas.height = video.videoHeight || 450;
      const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height); const box = scaledRoi();
      const found = detectCandles(context.getImageData(box.x, box.y, box.width, box.height).data, box.width, box.height);
      found.forEach((candle) => { const existing = candles.current.find((item) => Math.abs(item.x - candle.x) < 8); if (existing) Object.assign(existing, { ...candle, id: existing.id }); else candles.current.push({ ...candle, id: nextId.current++ }); });
      candles.current = candles.current.slice(-MAX_CANDLES);
      const latest = candles.current.at(-1);
      if (latest) { const signature = `${latest.color}|${latest.x}|${latest.top}|${latest.bottom}`; if (signature !== lastSignature.current) { lastSignature.current = signature; learn(); updateStructure(); void saveBrain(); updateStats(); } }
      paint(found.map((item) => candles.current.find((candle) => candle.x === item.x) ?? item)); await readPrice(context);
    } finally { busy.current = false; }
  }, [learn, paint, readPrice, saveBrain, scaledRoi, updateStats, updateStructure]);

  const connect = async () => {
    try {
      const next = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }); setStream(next); setActive(true);
      setStatus("TRADER_YODHA_X_AI connected to the live chart. Reading observed candles.");
      next.getVideoTracks()[0]?.addEventListener("ended", () => { setActive(false); setStream(null); });
    } catch { setStatus("Screen capture was cancelled. No market data was fabricated."); }
  };
  const disconnect = () => { stream?.getTracks().forEach((track) => track.stop()); setStream(null); setActive(false); setSignal("WAIT"); pending.current = null; };
  useEffect(() => { if (!active) return; const timer = window.setInterval(() => void analyzeFrame(), 800); return () => window.clearInterval(timer); }, [active, analyzeFrame]);

  const runAnalysis = async () => {
    if (scanning) return; setScanning(true);
    try {
      await analyzeFrame(); const recent = candles.current.slice(-5); const price = prices.current.at(-1);
      if (recent.length < 3 || !price) { setSignal("WAIT"); setStatus("Waiting for at least 3 detected candles and a readable live price."); return; }
      const latest = recent.at(-1)!; const technical = getIndicators(prices.current);
      const memory = recent.length === 5 ? brain.current.memories.find((item) => item.key === recent.map(token).join(">")) ?? null : null;
      const structure = brain.current.structure.at(-1)?.label ?? null; let call = latest.color === "GREEN" ? 1 : 0; let put = latest.color === "RED" ? 1 : 0; const reasons = [latest.shape];
      if (latest.lowerRatio > 1.5) { call += 2; reasons.push("lower-wick rejection"); } if (latest.upperRatio > 1.5) { put += 2; reasons.push("upper-wick rejection"); }
      if (technical.ema9 && technical.sma20) { if (technical.ema9 > technical.sma20) call++; else put++; reasons.push("EMA9/SMA20 trend"); }
      if (technical.rsi14 != null) { if (technical.rsi14 < 35) call++; if (technical.rsi14 > 65) put++; reasons.push(`RSI14 ${technical.rsi14.toFixed(1)}`); }
      if (structure === "HH" || structure === "HL") call++; if (structure === "LH" || structure === "LL") put++;
      if (memory) { if (memory.green > memory.red) call++; if (memory.red > memory.green) put++; reasons.push(`memory ${memory.confidence.toFixed(1)}%`); }
      const total = call + put; const nextSignal: Signal = total < 3 || Math.abs(call - put) < .5 ? "WAIT" : call > put ? "CALL" : "PUT"; const confidence = total ? Math.max(call, put) / total * 100 : 0;
      setAnalysis({ candles: recent, price, confidence, sequence: recent.map(token), indicators: technical, structure, reasons }); pending.current = nextSignal === "WAIT" ? null : nextSignal;
      setStatus(`TRADER_YODHA_X_AI analysis: ${nextSignal} | ${confidence.toFixed(1)}% evidence | live price ${price.toFixed(5)}`);
    } finally { setScanning(false); }
  };
  useEffect(() => {
    const timer = window.setInterval(() => { const now = new Date(); const seconds = now.getSeconds(); setCountdown(Math.ceil(60 - seconds - now.getMilliseconds() / 1000)); if (seconds === 0 && pending.current) { setSignal(pending.current); setStatus(`TRADER_YODHA_X_AI signal active: ${pending.current} at 00:00.`); pending.current = null; } if (active && seconds === 46) void runAnalysis(); }, 250);
    return () => window.clearInterval(timer);
  });
  const logOutcome = (result: Outcome) => {
    if (!analysis || signal === "WAIT") return;
    brain.current.trades.push({ pattern: analysis.sequence.join(" → "), result, price: analysis.price });
    brain.current.winRate = brain.current.trades.filter((trade) => trade.result === "WIN").length / brain.current.trades.length * 100;
    void saveBrain(); setSignal("WAIT"); setStatus(`Outcome logged [${result}]. TRADER_YODHA_X_AI memory updated.`);
  };
  const mouseDown = (event: MouseEvent) => { if (locked || !containerRef.current) return; event.stopPropagation(); const box = containerRef.current.getBoundingClientRect(); setMoving(true); setDrag({ x: event.clientX - box.left - roi.x, y: event.clientY - box.top - roi.y }); };
  const resizeDown = (event: MouseEvent) => { if (locked) return; event.stopPropagation(); setResizing(true); setDrag({ x: event.clientX, y: event.clientY }); };
  const mouseMove = (event: MouseEvent) => {
    if (locked || !containerRef.current || (!moving && !resizing)) return; const box = containerRef.current.getBoundingClientRect();
    if (moving) setRoi((old) => ({ ...old, x: Math.max(0, Math.min(box.width - old.width, event.clientX - box.left - drag.x)), y: Math.max(0, Math.min(box.height - old.height, event.clientY - box.top - drag.y)) }));
    else { const dx = event.clientX - drag.x; const dy = event.clientY - drag.y; setDrag({ x: event.clientX, y: event.clientY }); setRoi((old) => ({ ...old, width: Math.max(180, Math.min(box.width - old.x, old.width + dx)), height: Math.max(120, Math.min(box.height - old.y, old.height + dy)) })); }
  };
  const latest = analysis?.candles.at(-1);
  return <div className="min-h-screen bg-[#040814] text-slate-100 font-sans" onMouseMove={mouseMove} onMouseUp={() => { setMoving(false); setResizing(false); }}>
    <header className="border-b border-slate-800 px-6 py-4"><div className="max-w-7xl mx-auto flex items-center justify-between gap-4"><div><h1 className="text-2xl font-bold text-cyan-400 tracking-wider">TRADER YODHA X AI</h1><p className="text-slate-500 text-sm">Candle Vision + Technical Indicators + Structure Memory + 1-Minute Engine</p></div><div className="flex items-center gap-3"><div className="text-right mr-2"><div className="text-xs text-slate-500">AI Brain</div><div className="text-sm font-mono text-emerald-400">{stats.candles} Candles | {stats.memories} Patterns</div><div className="text-xs font-mono text-slate-400">{stats.trades} Trades | WR: {stats.winRate.toFixed(1)}%</div></div>{!active ? <button onClick={() => void connect()} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg">Connect Chart Screen</button> : <button onClick={disconnect} className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg">Disconnect</button>}</div></div></header>
    <main className="max-w-7xl mx-auto px-6 py-6"><div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><div className="space-y-4">
      <div className={card}><button onClick={() => void runAnalysis()} disabled={!active || scanning} className={`w-full py-4 rounded-xl font-bold text-lg ${!active || scanning ? "bg-slate-700 text-slate-500" : "bg-cyan-600 hover:bg-cyan-500 text-white"}`}>{scanning ? "Analyzing Live Candles..." : "FORCE MANUAL 46S SCAN"}</button><div className="mt-4 flex items-center justify-between text-sm"><span className="text-slate-500">Next Candle Entry:</span><span className="font-mono text-xl text-amber-400">{countdown}s</span></div></div>
      <div className={card}><h3 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wider font-mono">OCR Telemetry</h3><div className="flex justify-between text-xs font-mono"><span className="text-slate-500">Price:</span><span className={round ? "text-emerald-400 font-bold" : "text-cyan-400 font-bold"}>{ocrText}</span></div><div className="flex justify-between text-xs font-mono mt-2"><span className="text-slate-500">Data source:</span><span>Live screen only</span></div></div>
      <div className={card}><h3 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wider font-mono">Candle Brain</h3><div className="grid grid-cols-2 gap-2 text-xs font-mono">{[["Candles", stats.candles, "text-cyan-400"], ["Patterns", stats.memories, "text-purple-400"], ["ZigZag", stats.zigzag, "text-amber-400"], ["HH/HL/LH/LL", stats.structure, "text-sky-400"]].map(([label, value, color]) => <div key={String(label)} className="bg-[#020617] p-3 rounded"><div className="text-slate-500">{label}</div><div className={`${color} text-lg font-bold`}>{value}</div></div>)}</div></div>
      {analysis && <div className={card}><h3 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wider font-mono">Live Analysis</h3><div className="text-xs text-slate-300 space-y-2 font-mono"><div>Latest: #{latest?.id} {latest?.shape}</div><div>Price: {priceText(analysis.price)} {round ? "ROUND SNR" : ""}</div><div>Structure: {analysis.structure ?? "Awaiting pivot"}</div><div>Sequence: <span className="text-cyan-300 break-all">{analysis.sequence.join(" → ")}</span></div><div>Evidence: <span className="text-emerald-400">{analysis.confidence.toFixed(1)}%</span></div><div>EMA9 / SMA20: {priceText(analysis.indicators.ema9)} / {priceText(analysis.indicators.sma20)}</div><div>RSI14: {analysis.indicators.rsi14 == null ? "—" : analysis.indicators.rsi14.toFixed(1)}</div><div className="text-slate-400">{analysis.reasons.join(" • ")}</div></div></div>}
    </div><div className="lg:col-span-2 space-y-4">
      <div className={card}><div className="flex items-center justify-between mb-3"><span className="text-xs font-bold text-slate-400">CHART + CANDLE VISION</span>{active && <button onClick={() => setLocked((value) => !value)} className="px-3 py-1 rounded text-xs font-bold text-cyan-400 bg-cyan-900/60">{locked ? "ROI Locked" : "Drag / Resize ROI"}</button>}</div><div ref={containerRef} className="bg-[#020617] rounded-lg aspect-video flex items-center justify-center overflow-hidden border border-slate-900 relative select-none">{active ? <><video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain pointer-events-none" /><canvas ref={overlayRef} className="absolute inset-0 pointer-events-none w-full h-full z-10" /><div onMouseDown={mouseDown} style={{ left: roi.x, top: roi.y, width: roi.width, height: roi.height }} className={`absolute border-2 ${locked ? "border-amber-400" : "border-cyan-400 cursor-move"} p-1 z-20`}><div className="text-[10px] font-mono text-cyan-300 bg-slate-950/80 px-1">AI CANDLE TARGET</div>{!locked && <div onMouseDown={resizeDown} className="w-3.5 h-3.5 bg-cyan-400 absolute bottom-0 right-0 cursor-se-resize" />}</div></> : <div className="text-center"><p className="text-slate-500">Connect chart screen to start TRADER_YODHA_X_AI.</p><p className="text-xs text-slate-600 mt-2">The AI reads visible candles and prices; it does not invent unavailable data.</p></div>}</div><canvas ref={canvasRef} className="hidden" /><canvas ref={ocrCanvasRef} className="hidden" /><div className="mt-3 px-4 py-2 bg-[#020617] rounded-lg border-l-4 border-cyan-500"><p className="text-xs text-slate-400"><strong className="text-cyan-400">Status:</strong> {status}</p></div></div>
      <div className={`${card} p-6`}><div className="flex items-center justify-between mb-4"><span className="px-3 py-1 bg-purple-900/50 text-purple-300 text-xs font-bold rounded">TRADER YODHA X SIGNAL ENGINE</span><span className="text-xs text-slate-500 font-mono">1-Min Candle Transition</span></div><div className="text-center py-8"><div className={`inline-block px-14 py-6 rounded-2xl text-6xl font-black tracking-widest border-4 ${signal === "CALL" ? "bg-emerald-500/10 border-emerald-400 text-emerald-400" : signal === "PUT" ? "bg-red-500/10 border-red-400 text-red-400" : "bg-slate-800 border-slate-700 text-slate-600"}`}>{signal}</div></div>{signal !== "WAIT" && <div className="border-t border-slate-800 pt-4"><p className="text-xs text-slate-400 text-center mb-3">Log outcome to train the live brain:</p><div className="grid grid-cols-2 gap-3"><button onClick={() => logOutcome("WIN")} className="py-3 bg-emerald-600 text-white font-bold rounded-lg">WIN</button><button onClick={() => logOutcome("LOSS")} className="py-3 bg-red-600 text-white font-bold rounded-lg">LOSS</button></div></div>}</div>
    </div></div></main>
  </div>;
}