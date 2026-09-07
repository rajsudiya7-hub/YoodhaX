import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { createWorker } from "tesseract.js";
import { Loader2, AlertTriangle, TrendingUp, TrendingDown, Shield, Zap, Activity } from "lucide-react";

// ============================================
// TYPES
// ============================================

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
  memories: Memory[];
  trades: Array<{ pattern: string; result: Outcome; price: number }>;
  zigzag: Array<{ price: number; type: "HIGH" | "LOW"; occurrences: number }>;
  structure: Array<{ label: Structure; y: number; candleId: number }>;
  winRate: number;
};

// EMA9 and SMA20 removed — RSI14 only
type Indicators = { rsi14: number | null };

type ZigZagPoint = {
  index: number;
  y: number;
  type: "HIGH" | "LOW";
  candleId: number;
  label: Structure;
};

type PatternFlags = {
  sequential7: { detected: boolean; prediction: Signal; confidence: number };
  breakdown: { detected: boolean; level: string };
  wickRejection: { detected: boolean; direction: "CALL" | "PUT"; count: number };
  confluence: { score: number; points: string[] };
  trap: { detected: boolean; type: string; direction: "CALL" | "PUT" };
};

// ============================================
// CONSTANTS — OTC Optimized
// ============================================

const DB = "TRADER_YODHA_X_AI";
const STORE = "TRADER_YODHA_X_AI_BRAIN";
const KEY = "TRADER_YODHA_X_AI_BRAIN_STATE";
const MAX_CANDLES = 120;

// Full ZigZag Engine parameters
const ZIGZAG_DEVIATION = 5;
const ZIGZAG_DEPTH = 1;
const ZIGZAG_BACKSTEP = 3;

// OTC micro-trend thresholds
const WICK_REJECTION_RATIO = 1.5;
const WICK_REJECTION_COUNT = 3;
const BREAKDOWN_TOLERANCE_PX = 3;
const CONFLUENCE_PROXIMITY_PX = 8;
const TRAP_WICK_MULTIPLIER = 2.5;
const REVERSE_LOSS_STREAK = 2;

const token = (c: Candle) => `${c.color[0]}-${c.shape}`;
const roundNumber = (p: number) => /(?:000|500)$/.test(p.toFixed(5));
const priceText = (p: number | null) => (p == null ? "—" : p.toFixed(5));
const card = "bg-[#0f172a] rounded-xl p-5 border border-slate-800";

// ============================================
// INDICATORS — RSI14 only (EMA9/SMA20 removed)
// ============================================

function getIndicators(values: number[]): Indicators {
  if (!values.length) return { rsi14: null };
  const recent = values.slice(-15);
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < recent.length; i++) {
    const delta = recent[i] - recent[i - 1];
    if (delta >= 0) gain += delta;
    else loss += Math.abs(delta);
  }
  const rsi14 =
    recent.length === 15
      ? loss === 0
        ? 100
        : 100 - 100 / (1 + gain / loss)
      : null;
  return { rsi14 };
}

// ============================================
// FULL ZIGZAG ENGINE (Deviation=5, Depth=1, Backstep=3)
// ============================================

function calculateZigZag(
  candles: Candle[],
  deviation: number,
  depth: number,
  backstep: number,
): ZigZagPoint[] {
  if (candles.length < depth * 2 + 1) return [];

  type RawPivot = { index: number; y: number; type: "HIGH" | "LOW" };
  const rawPivots: RawPivot[] = [];

  // Step 1: Find potential pivots using depth
  // HIGH pivot: candle.top is the lowest y (highest price) within depth bars on each side
  // LOW pivot: candle.bottom is the highest y (lowest price) within depth bars on each side
  for (let i = depth; i < candles.length - depth; i++) {
    let isHigh = true;
    for (let j = i - depth; j <= i + depth; j++) {
      if (j === i) continue;
      if (candles[j].top < candles[i].top) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) rawPivots.push({ index: i, y: candles[i].top, type: "HIGH" });

    let isLow = true;
    for (let j = i - depth; j <= i + depth; j++) {
      if (j === i) continue;
      if (candles[j].bottom > candles[i].bottom) {
        isLow = false;
        break;
      }
    }
    if (isLow) rawPivots.push({ index: i, y: candles[i].bottom, type: "LOW" });
  }

  rawPivots.sort((a, b) => a.index - b.index);

  // Step 2: Apply deviation filter, backstep, and alternation
  const confirmed: RawPivot[] = [];
  for (const pivot of rawPivots) {
    const last = confirmed[confirmed.length - 1];

    if (!last) {
      confirmed.push(pivot);
      continue;
    }

    if (pivot.type === last.type) {
      // Same type — replace if more extreme (do not add new)
      if (pivot.type === "HIGH" && pivot.y < last.y) {
        confirmed[confirmed.length - 1] = pivot;
      } else if (pivot.type === "LOW" && pivot.y > last.y) {
        confirmed[confirmed.length - 1] = pivot;
      }
      continue;
    }

    // Different type — check deviation (minimum pixel movement from last pivot)
    if (Math.abs(pivot.y - last.y) < deviation) continue;

    // Check backstep (minimum bars from last same-type pivot)
    const lastSameType = [...confirmed].reverse().find((p) => p.type === pivot.type);
    if (lastSameType && pivot.index - lastSameType.index < backstep) continue;

    confirmed.push(pivot);
  }

  // Step 3: Label structure (HH / HL / LH / LL)
  const result: ZigZagPoint[] = [];
  let prevHigh: RawPivot | null = null;
  let prevLow: RawPivot | null = null;

  for (const pivot of confirmed) {
    let label: Structure;
    if (pivot.type === "HIGH") {
      // y < prevY means higher price → HH; y > prevY means lower price → LH
      label = !prevHigh || pivot.y < prevHigh.y ? "HH" : "LH";
      prevHigh = pivot;
    } else {
      // y < prevY means higher price → HL; y > prevY means lower price → LL
      label = !prevLow || pivot.y < prevLow.y ? "HL" : "LL";
      prevLow = pivot;
    }
    result.push({
      index: pivot.index,
      y: pivot.y,
      type: pivot.type,
      candleId: candles[pivot.index].id,
      label,
    });
  }

  return result;
}

// ============================================
// ADVANCED OTC PATTERN DETECTORS
// ============================================

// (a) 7-candle sequential outcome prediction (after 1 Red + 1 Green)
function detectSequential7(
  candles: Candle[],
  brain: Brain,
): { detected: boolean; prediction: Signal; confidence: number } {
  if (candles.length < 7) return { detected: false, prediction: "WAIT", confidence: 0 };
  const seq = candles.slice(-7);
  // Trigger: first candle RED, second candle GREEN
  if (seq[0].color !== "RED" || seq[1].color !== "GREEN") {
    return { detected: false, prediction: "WAIT", confidence: 0 };
  }
  // Look up 6-candle key in memory (first 6 candles → predict 7th)
  const key = seq.slice(0, 6).map(token).join(">");
  const memory = brain.memories.find((m) => m.key === key);
  if (memory && memory.occurrences >= 2) {
    const prediction: Signal =
      memory.green > memory.red ? "CALL" : memory.red > memory.green ? "PUT" : "WAIT";
    return { detected: true, prediction, confidence: memory.confidence };
  }
  // OTC heuristic: after R→G trigger, momentum tends to continue GREEN in OTC
  const greens = seq.filter((c) => c.color === "GREEN").length;
  const reds = seq.filter((c) => c.color === "RED").length;
  if (greens > reds) return { detected: true, prediction: "CALL", confidence: 55 };
  if (reds > greens) return { detected: true, prediction: "PUT", confidence: 55 };
  return { detected: true, prediction: "WAIT", confidence: 0 };
}

// (b) 2 consecutive Red candles breaking down key support/levels in OTC
function detectBreakdown(
  candles: Candle[],
  zigzag: ZigZagPoint[],
): { detected: boolean; level: string } {
  if (candles.length < 2) return { detected: false, level: "" };
  const last2 = candles.slice(-2);
  if (last2[0].color !== "RED" || last2[1].color !== "RED") {
    return { detected: false, level: "" };
  }
  // Find the most recent LOW pivot (support level)
  const lastLow = [...zigzag].reverse().find((p) => p.type === "LOW");
  if (!lastLow) return { detected: false, level: "" };
  // Breakdown: latest red candle's bottom goes below support (higher y = lower price)
  if (last2[1].bottom > lastLow.y + BREAKDOWN_TOLERANCE_PX) {
    return { detected: true, level: `Support broken @ pivot #${lastLow.candleId}` };
  }
  return { detected: false, level: "" };
}

// (c) 3 consecutive candles showing high wick rejection
function detectWickRejection(
  candles: Candle[],
): { detected: boolean; direction: "CALL" | "PUT"; count: number } {
  if (candles.length < WICK_REJECTION_COUNT) {
    return { detected: false, direction: "CALL", count: 0 };
  }
  const last3 = candles.slice(-WICK_REJECTION_COUNT);
  // Upper wick rejection (bearish) — all 3 candles reject higher prices
  const allUpperReject = last3.every(
    (c) => c.upperRatio > WICK_REJECTION_RATIO && c.upper > c.body * WICK_REJECTION_RATIO,
  );
  if (allUpperReject) return { detected: true, direction: "PUT", count: WICK_REJECTION_COUNT };
  // Lower wick rejection (bullish) — all 3 candles reject lower prices
  const allLowerReject = last3.every(
    (c) => c.lowerRatio > WICK_REJECTION_RATIO && c.lower > c.body * WICK_REJECTION_RATIO,
  );
  if (allLowerReject) return { detected: true, direction: "CALL", count: WICK_REJECTION_COUNT };
  return { detected: false, direction: "CALL", count: 0 };
}

// (d) Multi-level confluence (SNR, Round Numbers, ZigZag levels)
function detectConfluence(
  candles: Candle[],
  zigzag: ZigZagPoint[],
  price: number | null,
  isRound: boolean,
  brain: Brain,
): { score: number; points: string[] } {
  const latest = candles.at(-1);
  if (!latest) return { score: 0, points: [] };

  let score = 0;
  const points: string[] = [];

  // 1. Round number proximity
  if (isRound && price) {
    score++;
    points.push("Round Number SNR");
  }

  // 2. ZigZag swing level proximity (pixel-based)
  const nearHigh = zigzag.some(
    (p) => p.type === "HIGH" && Math.abs(p.y - latest.top) < CONFLUENCE_PROXIMITY_PX,
  );
  const nearLow = zigzag.some(
    (p) => p.type === "LOW" && Math.abs(p.y - latest.bottom) < CONFLUENCE_PROXIMITY_PX,
  );
  if (nearHigh || nearLow) {
    score++;
    points.push("ZigZag Swing Level");
  }

  // 3. Historical SNR from brain (price-based)
  if (price) {
    const nearSNR = brain.zigzag.some((z) => Math.abs(z.price - price) < 0.0003);
    if (nearSNR) {
      score++;
      points.push("Historical SNR");
    }
  }

  // 4. Multi-touch level (multiple ZigZag pivots at similar y)
  if (zigzag.length >= 2) {
    const lastPivot = zigzag[zigzag.length - 1];
    const sameLevel = zigzag.filter(
      (p) => p.type === lastPivot.type && Math.abs(p.y - lastPivot.y) < 10,
    );
    if (sameLevel.length >= 2) {
      score++;
      points.push("Multi-touch Level");
    }
  }

  return { score, points };
}

// ============================================
// HUMAN-BRAIN OTC TRAP DETECTION
// ============================================

function detectTraps(
  candles: Candle[],
  zigzag: ZigZagPoint[],
): { detected: boolean; type: string; direction: "CALL" | "PUT" } {
  if (candles.length < 4 || zigzag.length < 2) {
    return { detected: false, type: "", direction: "CALL" };
  }
  const latest = candles.at(-1)!;
  const recentHighs = zigzag.filter((p) => p.type === "HIGH").slice(-2);
  const recentLows = zigzag.filter((p) => p.type === "LOW").slice(-2);

  // Fake Breakout above resistance:
  // Candle broke above HIGH pivot (top y < HIGH y) but closed back below (closeY > HIGH y)
  for (const high of recentHighs) {
    if (latest.top < high.y - BREAKDOWN_TOLERANCE_PX && latest.closeY > high.y + BREAKDOWN_TOLERANCE_PX) {
      return { detected: true, type: "Fake Breakout (Resistance)", direction: "PUT" };
    }
  }

  // Fake Breakout below support:
  // Candle broke below LOW pivot (bottom y > LOW y) but closed back above (closeY < LOW y)
  for (const low of recentLows) {
    if (latest.bottom > low.y + BREAKDOWN_TOLERANCE_PX && latest.closeY < low.y - BREAKDOWN_TOLERANCE_PX) {
      return { detected: true, type: "Fake Breakout (Support)", direction: "CALL" };
    }
  }

  // Liquidity Sweep: wick extends beyond key level but body stays within
  for (const high of recentHighs) {
    if (latest.top < high.y - 5 && latest.bodyTop > high.y) {
      return { detected: true, type: "Liquidity Sweep (Above Resistance)", direction: "PUT" };
    }
  }
  for (const low of recentLows) {
    if (latest.bottom > low.y + 5 && latest.bodyBottom < low.y) {
      return { detected: true, type: "Liquidity Sweep (Below Support)", direction: "CALL" };
    }
  }

  // Exhaustion Wick: after 3+ same-colored candles, a candle with very long wick in trend direction
  const last4 = candles.slice(-4);
  if (last4.length === 4) {
    const first3 = last4.slice(0, 3);
    const allGreen = first3.every((c) => c.color === "GREEN");
    const allRed = first3.every((c) => c.color === "RED");
    if (allGreen && latest.upper > latest.body * TRAP_WICK_MULTIPLIER) {
      return { detected: true, type: "Exhaustion Wick (Bullish Trend)", direction: "PUT" };
    }
    if (allRed && latest.lower > latest.body * TRAP_WICK_MULTIPLIER) {
      return { detected: true, type: "Exhaustion Wick (Bearish Trend)", direction: "CALL" };
    }
  }

  return { detected: false, type: "", direction: "CALL" };
}

// ============================================
// CANDLE DETECTION (Pixel-based, OTC optimized)
// ============================================

function detectCandles(data: Uint8ClampedArray, width: number, height: number): Candle[] {
  const columns = new Uint16Array(width);
  const green = new Uint16Array(width);
  const red = new Uint16Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // OTC charts typically use brighter green/red — tuned thresholds
      const isGreen = data[i + 1] > data[i] + 35 && data[i + 1] > data[i + 2] + 25 && data[i + 1] > 80;
      const isRed = data[i] > data[i + 1] + 35 && data[i] > data[i + 2] + 25 && data[i] > 80;
      if (isGreen || isRed) {
        columns[x]++;
        if (isGreen) green[x]++;
        else red[x]++;
      }
    }
  }
  const groups: Array<[number, number]> = [];
  const threshold = Math.max(2, Math.floor(height * 0.015));
  let start = -1;
  for (let x = 0; x <= width; x++) {
    const on = x < width && columns[x] >= threshold;
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      if (x - start >= 2 && x - start < width * 0.2) groups.push([start, x - 1]);
      start = -1;
    }
  }
  return groups
    .map(([left, right]): Candle => {
      let top = height;
      let bottom = 0;
      let g = 0;
      let r = 0;
      for (let x = left; x <= right; x++) {
        for (let y = 0; y < height; y++) {
          const i = (y * width + x) * 4;
          const isGreen = data[i + 1] > data[i] + 35 && data[i + 1] > data[i + 2] + 25 && data[i + 1] > 80;
          const isRed = data[i] > data[i + 1] + 35 && data[i] > data[i + 2] + 25 && data[i] > 80;
          if (isGreen || isRed) {
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
            if (isGreen) g++;
            else r++;
          }
        }
      }
      const color: Color = g > r * 1.15 ? "GREEN" : r > g * 1.15 ? "RED" : "NEUTRAL";
      const bodyTop = top + Math.max(1, Math.floor((bottom - top) * 0.18));
      const bodyBottom = bottom - Math.max(1, Math.floor((bottom - top) * 0.18));
      const body = Math.max(1, bodyBottom - bodyTop);
      const upper = Math.max(0, bodyTop - top);
      const lower = Math.max(0, bottom - bodyBottom);
      const ratio = body / Math.max(1, bottom - top);
      const shape =
        color === "NEUTRAL"
          ? "INDECISION"
          : ratio < 0.12
            ? "DOJI"
            : lower > body * 1.5 && lower > upper
              ? "LOWER_REJECTION"
              : upper > body * 1.5 && upper > lower
                ? "UPPER_REJECTION"
                : ratio >= 0.7
                  ? color === "GREEN"
                    ? "BULL_STRONG"
                    : "BEAR_STRONG"
                  : color === "GREEN"
                    ? "SMALL_BULL"
                    : "SMALL_BEAR";
      return {
        id: 0,
        x: left,
        width: right - left + 1,
        top,
        bottom,
        bodyTop,
        bodyBottom,
        closeY: color === "RED" ? bodyBottom : bodyTop,
        color,
        body,
        upper,
        lower,
        upperRatio: upper / body,
        lowerRatio: lower / body,
        shape,
        timestamp: Date.now(),
      };
    })
    .filter((candle) => candle.color !== "NEUTRAL");
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function OTCMarketDashboard() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [signal, setSignal] = useState<Signal>("WAIT");
  const [status, setStatus] = useState("TRADER_YODHA_X_AI OTC Engine Ready. Connect Quotex / ExpertOption OTC screen.");
  const [ocrText, setOcrText] = useState("Searching...");
  const [round, setRound] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [reversed, setReversed] = useState(false);
  const [analysis, setAnalysis] = useState<{
    candles: Candle[];
    price: number;
    confidence: number;
    sequence: string[];
    indicators: Indicators;
    structure: Structure | null;
    patterns: PatternFlags;
    reversed: boolean;
    reasons: string[];
  } | null>(null);
  const [stats, setStats] = useState({
    candles: 0,
    memories: 0,
    trades: 0,
    zigzag: 0,
    structure: 0,
    winRate: 0,
  });
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
  const zigzagRef = useRef<ZigZagPoint[]>([]);
  const lastSignalMinute = useRef(-1);
  const brain = useRef<Brain>({
    memories: [],
    trades: [],
    zigzag: [],
    structure: [],
    winRate: 0,
  });

  const updateStats = useCallback(() => {
    setStats({
      candles: candles.current.length,
      memories: brain.current.memories.length,
      trades: brain.current.trades.length,
      zigzag: zigzagRef.current.length,
      structure: brain.current.structure.length,
      winRate: brain.current.winRate,
    });
  }, []);

  const openDb = useCallback(
    () =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
    [],
  );

  const saveBrain = useCallback(async () => {
    try {
      const db = await openDb();
      db.transaction(STORE, "readwrite").objectStore(STORE).put(brain.current, KEY);
      updateStats();
    } catch (error) {
      console.error("[TRADER_YODHA_X_AI] IndexedDB save failed", error);
    }
  }, [openDb, updateStats]);

  // Load brain from IndexedDB on mount
  useEffect(() => {
    void openDb()
      .then((db) => {
        const request = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
        request.onsuccess = () => {
          if (!request.result) return;
          brain.current = {
            ...brain.current,
            ...request.result,
            memories: request.result.memories ?? [],
            trades: request.result.trades ?? [],
            zigzag: request.result.zigzag ?? [],
            structure: request.result.structure ?? [],
          };
          updateStats();
          setStatus(`TRADER_YODHA_X_AI memory loaded: ${brain.current.trades.length} trade memories.`);
        };
      })
      .catch((error) => console.error("[TRADER_YODHA_X_AI] IndexedDB load failed", error));
  }, [openDb, updateStats]);

  // Initialize OCR worker
  useEffect(() => {
    let cancelled = false;
    void createWorker("eng")
      .then((worker) => {
        if (cancelled) void worker.terminate();
        else workerRef.current = worker;
      })
      .catch((error) => console.error("[TRADER_YODHA_X_AI] OCR init failed", error));
    return () => {
      cancelled = true;
      if (workerRef.current) void workerRef.current.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  const scaledRoi = useCallback(() => {
    const video = videoRef.current;
    const box = containerRef.current;
    if (!video || !box) return roi;
    const sx = (video.videoWidth || box.clientWidth) / (box.clientWidth || 1);
    const sy = (video.videoHeight || box.clientHeight) / (box.clientHeight || 1);
    return {
      x: Math.max(0, Math.floor(roi.x * sx)),
      y: Math.max(0, Math.floor(roi.y * sy)),
      width: Math.max(1, Math.floor(roi.width * sx)),
      height: Math.max(1, Math.floor(roi.height * sy)),
    };
  }, [roi]);

  // Pattern learning — updates memory with green/red/neutral outcomes
  const learn = useCallback(() => {
    if (candles.current.length <= 5) return;
    const group = candles.current.slice(-6);
    const previous = group.slice(0, 5);
    const next = group[5];
    const key = previous.map(token).join(">");
    let memory = brain.current.memories.find((item) => item.key === key);
    if (!memory) {
      memory = {
        key,
        description: previous.map(token).join(" → "),
        green: 0,
        red: 0,
        neutral: 0,
        wins: 0,
        losses: 0,
        confidence: 0,
        occurrences: 0,
        lossStreak: 0,
        reverse: false,
      };
      brain.current.memories.push(memory);
    }
    memory.occurrences++;
    if (next.color === "GREEN") memory.green++;
    else if (next.color === "RED") memory.red++;
    else memory.neutral++;
    memory.confidence =
      (Math.max(memory.green, memory.red) / (memory.green + memory.red + memory.neutral)) * 100;
  }, []);

  // Read price via OCR from the chart
  const readPrice = useCallback(
    async (context: CanvasRenderingContext2D): Promise<number | null> => {
      const worker = workerRef.current;
      const target = ocrCanvasRef.current;
      if (!worker || !target || Date.now() - lastOcr.current < 1500) return prices.current.at(-1) ?? null;
      const box = scaledRoi();
      target.width = box.width;
      target.height = box.height;
      const targetContext = target.getContext("2d");
      if (!targetContext) return null;
      targetContext.drawImage(context.canvas, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
      lastOcr.current = Date.now();
      try {
        const result = await worker.recognize(target);
        const values = result.data.text.match(/\d+\.\d{2,5}/g)?.map(Number).filter((v: number) => v > 0) ?? [];
        const price = values.at(-1);
        if (price) {
          prices.current = [...prices.current, price].slice(-MAX_CANDLES);
          const isRound = roundNumber(price);
          setOcrText(`${price.toFixed(5)}${isRound ? " [ROUND SNR]" : ""}`);
          setRound(isRound);
          return price;
        }
      } catch {
        // Keep last observed price when OCR fails mid-chart-update
      }
      return prices.current.at(-1) ?? null;
    },
    [scaledRoi],
  );

  // Paint overlay: candles, IDs, ZigZag lines, and HH/HL/LH/LL labels
  const paint = useCallback(
    (found: Candle[], zigzag: ZigZagPoint[]) => {
      const canvas = overlayRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;
      canvas.width = video.videoWidth || canvas.clientWidth;
      canvas.height = video.videoHeight || canvas.clientHeight;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      const box = scaledRoi();
      context.save();
      context.translate(box.x, box.y);

      // Draw candle outlines and IDs (preserves existing candle ID numbering)
      found.forEach((candle) => {
        context.strokeStyle = candle.color === "GREEN" ? "#84cc16" : "#f43f5e";
        context.fillStyle = context.strokeStyle;
        context.lineWidth = 1.5;
        context.strokeRect(candle.x, candle.bodyTop, candle.width, Math.max(2, candle.body));
        context.beginPath();
        context.moveTo(candle.x + candle.width / 2, candle.top);
        context.lineTo(candle.x + candle.width / 2, candle.bottom);
        context.stroke();
        context.font = "bold 10px monospace";
        context.fillText(String(candle.id), candle.x, Math.max(10, candle.top - 3));
      });

      // Draw ZigZag lines connecting pivots
      if (zigzag.length >= 2) {
        context.strokeStyle = "#fbbf24";
        context.lineWidth = 2;
        context.setLineDash([]);
        context.beginPath();
        let started = false;
        zigzag.forEach((point) => {
          const candle = found.find((c) => c.id === point.candleId);
          if (!candle) return;
          const x = candle.x + candle.width / 2;
          const y = point.y;
          if (!started) {
            context.moveTo(x, y);
            started = true;
          } else {
            context.lineTo(x, y);
          }
        });
        context.stroke();

        // Draw pivot dots
        zigzag.forEach((point) => {
          const candle = found.find((c) => c.id === point.candleId);
          if (!candle) return;
          const x = candle.x + candle.width / 2;
          context.fillStyle = point.type === "HIGH" ? "#34d399" : "#fb7185";
          context.beginPath();
          context.arc(x, point.y, 3, 0, Math.PI * 2);
          context.fill();
        });
      }

      // Draw HH / HL / LH / LL labels at ZigZag pivots
      zigzag.slice(-8).forEach((point) => {
        const candle = found.find((c) => c.id === point.candleId);
        if (!candle) return;
        context.fillStyle = point.label === "HH" || point.label === "HL" ? "#34d399" : "#fb7185";
        context.font = "bold 11px monospace";
        const labelY = point.type === "HIGH" ? point.y - 8 : point.y + 16;
        context.fillText(point.label, candle.x, labelY);
      });

      context.restore();
    },
    [scaledRoi],
  );

  // Analyze a single frame: detect candles, calculate ZigZag, learn, paint
  const analyzeFrame = useCallback(async () => {
    if (busy.current || !videoRef.current || !canvasRef.current) return;
    busy.current = true;
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 800;
      canvas.height = video.videoHeight || 450;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const box = scaledRoi();
      const found = detectCandles(
        context.getImageData(box.x, box.y, box.width, box.height).data,
        box.width,
        box.height,
      );

      // Update candle list preserving IDs (does NOT alter candle ID numbering)
      found.forEach((candle) => {
        const existing = candles.current.find((item) => Math.abs(item.x - candle.x) < 8);
        if (existing) Object.assign(existing, { ...candle, id: existing.id });
        else candles.current.push({ ...candle, id: nextId.current++ });
      });
      candles.current = candles.current.slice(-MAX_CANDLES);

      // Calculate ZigZag from all current candles
      const zigzagPoints = calculateZigZag(candles.current, ZIGZAG_DEVIATION, ZIGZAG_DEPTH, ZIGZAG_BACKSTEP);
      zigzagRef.current = zigzagPoints;

      // Update brain structure from ZigZag
      brain.current.structure = zigzagPoints.map((p) => ({
        label: p.label,
        y: p.y,
        candleId: p.candleId,
      }));
      brain.current.structure = brain.current.structure.slice(-30);

      const latest = candles.current.at(-1);
      if (latest) {
        const signature = `${latest.color}|${latest.x}|${latest.top}|${latest.bottom}`;
        if (signature !== lastSignature.current) {
          lastSignature.current = signature;
          learn();
          void saveBrain();
          updateStats();
        }
      }

      // Update brain zigzag (SNR) from price + latest ZigZag pivot
      void readPrice(context).then((price) => {
        if (price && zigzagPoints.length > 0) {
          const lastPivot = zigzagPoints[zigzagPoints.length - 1];
          const type = lastPivot.type;
          const existing = brain.current.zigzag.find(
            (item) => item.type === type && Math.abs(item.price - price) < 0.0003,
          );
          if (existing) existing.occurrences++;
          else brain.current.zigzag.push({ price, type, occurrences: 1 });
          brain.current.zigzag = brain.current.zigzag.slice(-30);
        }
      });

      paint(
        found.map((item) => candles.current.find((c) => c.x === item.x) ?? item),
        zigzagPoints,
      );
    } finally {
      busy.current = false;
    }
  }, [learn, paint, readPrice, saveBrain, scaledRoi, updateStats]);

  const connect = async () => {
    try {
      const next = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      setStream(next);
      setActive(true);
      setStatus("TRADER_YODHA_X_AI connected to OTC chart. Reading live candles.");
      next.getVideoTracks()[0]?.addEventListener("ended", () => {
        setActive(false);
        setStream(null);
      });
    } catch {
      setStatus("Screen capture was cancelled. No market data was fabricated.");
    }
  };

  const disconnect = () => {
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
    setActive(false);
    setSignal("WAIT");
    pending.current = null;
  };

  // Continuous frame analysis every 800ms while active
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => void analyzeFrame(), 800);
    return () => window.clearInterval(timer);
  }, [active, analyzeFrame]);

  // ============================================
  // DEEP 46S OTC ANALYSIS (runs at 46s or manually)
  // ============================================

  const runAnalysis = async () => {
    if (scanning) return;
    setScanning(true);
    setStatus("DEEP 46S OTC ANALYSIS IN PROGRESS — scanning multiple frames...");
    try {
      // Capture multiple frames for deeper OTC analysis
      for (let i = 0; i < 3; i++) {
        await analyzeFrame();
        if (i < 2) await new Promise((r) => setTimeout(r, 400));
      }

      const recent = candles.current.slice(-5);
      const allCandles = candles.current;
      const price = prices.current.at(-1);

      if (recent.length < 3 || !price) {
        setSignal("WAIT");
        setStatus("Waiting for at least 3 detected candles and a readable live OTC price.");
        return;
      }

      const latest = recent.at(-1)!;
      const technical = getIndicators(prices.current);
      const zigzagPoints = zigzagRef.current;

      // Memory lookup for 5-candle pattern
      const memory =
        recent.length === 5
          ? brain.current.memories.find((item) => item.key === recent.map(token).join(">")) ?? null
          : null;

      // Structure from last ZigZag point
      const structure = zigzagPoints.at(-1)?.label ?? null;

      // Run all OTC pattern detectors
      const patterns: PatternFlags = {
        sequential7: detectSequential7(allCandles, brain.current),
        breakdown: detectBreakdown(allCandles, zigzagPoints),
        wickRejection: detectWickRejection(allCandles),
        confluence: detectConfluence(allCandles, zigzagPoints, price, round, brain.current),
        trap: detectTraps(allCandles, zigzagPoints),
      };

      // Aggregate evidence
      let call = 0;
      let put = 0;
      const reasons: string[] = [latest.shape];

      // Wick analysis
      if (latest.lowerRatio > WICK_REJECTION_RATIO) {
        call += 2;
        reasons.push("lower-wick rejection");
      }
      if (latest.upperRatio > WICK_REJECTION_RATIO) {
        put += 2;
        reasons.push("upper-wick rejection");
      }

      // RSI14
      if (technical.rsi14 != null) {
        if (technical.rsi14 < 35) {
          call += 2;
          reasons.push(`RSI14 oversold ${technical.rsi14.toFixed(1)}`);
        }
        if (technical.rsi14 > 65) {
          put += 2;
          reasons.push(`RSI14 overbought ${technical.rsi14.toFixed(1)}`);
        }
      }

      // ZigZag structure
      if (structure === "HH" || structure === "HL") {
        call++;
        reasons.push(`structure ${structure}`);
      }
      if (structure === "LH" || structure === "LL") {
        put++;
        reasons.push(`structure ${structure}`);
      }

      // Pattern: 7-candle sequential
      if (patterns.sequential7.detected && patterns.sequential7.prediction !== "WAIT") {
        if (patterns.sequential7.prediction === "CALL") {
          call += 3;
          reasons.push(`7-candle sequential CALL (${patterns.sequential7.confidence.toFixed(0)}%)`);
        } else {
          put += 3;
          reasons.push(`7-candle sequential PUT (${patterns.sequential7.confidence.toFixed(0)}%)`);
        }
      }

      // Pattern: 2-red breakdown
      if (patterns.breakdown.detected) {
        put += 3;
        reasons.push(`2-red breakdown: ${patterns.breakdown.level}`);
      }

      // Pattern: 3-candle wick rejection
      if (patterns.wickRejection.detected) {
        if (patterns.wickRejection.direction === "CALL") {
          call += 3;
          reasons.push("3-candle lower wick rejection");
        } else {
          put += 3;
          reasons.push("3-candle upper wick rejection");
        }
      }

      // Pattern: Multi-level confluence
      if (patterns.confluence.score >= 2) {
        const nearLow = zigzagPoints.some(
          (p) => p.type === "LOW" && Math.abs(p.y - latest.bottom) < CONFLUENCE_PROXIMITY_PX,
        );
        const nearHigh = zigzagPoints.some(
          (p) => p.type === "HIGH" && Math.abs(p.y - latest.top) < CONFLUENCE_PROXIMITY_PX,
        );
        if (nearLow) {
          call += patterns.confluence.score;
          reasons.push(`confluence (${patterns.confluence.points.join(" + ")})`);
        } else if (nearHigh) {
          put += patterns.confluence.score;
          reasons.push(`confluence (${patterns.confluence.points.join(" + ")})`);
        }
      }

      // Trap detection
      if (patterns.trap.detected) {
        if (patterns.trap.direction === "CALL") {
          call += 4;
          reasons.push(`TRAP: ${patterns.trap.type} → CALL`);
        } else {
          put += 4;
          reasons.push(`TRAP: ${patterns.trap.type} → PUT`);
        }
      }

      // Memory-based bias
      if (memory) {
        if (memory.green > memory.red) {
          call++;
          reasons.push(`memory ${memory.confidence.toFixed(1)}%`);
        }
        if (memory.red > memory.green) {
          put++;
          reasons.push(`memory ${memory.confidence.toFixed(1)}%`);
        }
      }

      // Determine final signal
      const total = call + put;
      let nextSignal: Signal =
        total < 3 || Math.abs(call - put) < 0.5 ? "WAIT" : call > put ? "CALL" : "PUT";
      const confidence = total ? (Math.max(call, put) / total) * 100 : 0;
      let signalReversed = false;

      // ============================================
      // REVERSE TRADING LOGIC
      // If pattern key has lossStreak >= 2 or reverse flag, flip the signal
      // ============================================
      if (memory && (memory.lossStreak >= REVERSE_LOSS_STREAK || memory.reverse) && nextSignal !== "WAIT") {
        nextSignal = nextSignal === "CALL" ? "PUT" : "CALL";
        signalReversed = true;
        reasons.push("** REVERSE LOGIC ACTIVATED ** (pattern loss streak detected — signal flipped)");
      }

      setAnalysis({
        candles: recent,
        price,
        confidence,
        sequence: recent.map(token),
        indicators: technical,
        structure,
        patterns,
        reversed: signalReversed,
        reasons,
      });
      setReversed(signalReversed);
      pending.current = nextSignal === "WAIT" ? null : nextSignal;

      const trapText = patterns.trap.detected ? ` | TRAP: ${patterns.trap.type}` : "";
      const reverseText = signalReversed ? " | REVERSED" : "";
      setStatus(
        `Deep 46S OTC analysis complete: ${nextSignal} | ${confidence.toFixed(1)}% evidence | price ${price.toFixed(5)}${trapText}${reverseText}`,
      );
    } finally {
      setScanning(false);
    }
  };

  // ============================================
  // STRICT 00s–05s ENTRY TIMING
  // Deep analysis at 46s sets pending.current
  // Visible UI signal switches at 00s–05s of the new candle
  // ============================================
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = new Date();
      const seconds = now.getSeconds();
      const ms = now.getMilliseconds();
      setCountdown(Math.ceil(60 - seconds - ms / 1000));

      // Switch signal strictly between 00s and 05s of the new candle
      if (
        seconds >= 0 &&
        seconds <= 5 &&
        pending.current &&
        lastSignalMinute.current !== now.getMinutes()
      ) {
        lastSignalMinute.current = now.getMinutes();
        setSignal(pending.current);
        setStatus(`TRADER_YODHA_X_AI signal active: ${pending.current} — entered at 0${seconds}s of new candle.`);
        pending.current = null;
      }

      // Auto-trigger deep analysis at 46s
      if (active && seconds === 46) {
        void runAnalysis();
      }
    }, 200);
    return () => window.clearInterval(timer);
  });

  // Log trade outcome and update memory with loss streak / reverse tracking
  const logOutcome = (result: Outcome) => {
    if (!analysis || signal === "WAIT") return;
    const key = analysis.sequence.join(">");
    const memory = brain.current.memories.find((item) => item.key === key);
    if (memory) {
      if (result === "WIN") {
        memory.wins++;
        memory.lossStreak = 0;
        memory.reverse = false;
      } else {
        memory.losses++;
        memory.lossStreak++;
        if (memory.lossStreak >= REVERSE_LOSS_STREAK) {
          memory.reverse = true;
        }
      }
    }
    brain.current.trades.push({
      pattern: analysis.sequence.join(" → "),
      result,
      price: analysis.price,
    });
    brain.current.winRate =
      (brain.current.trades.filter((t) => t.result === "WIN").length / brain.current.trades.length) * 100;
    void saveBrain();
    setSignal("WAIT");
    setReversed(false);
    setStatus(`Outcome logged [${result}]. TRADER_YODHA_X_AI OTC memory updated — loss streaks tracked.`);
  };

  // ROI drag and resize handlers
  const mouseDown = (event: MouseEvent) => {
    if (locked || !containerRef.current) return;
    event.stopPropagation();
    const box = containerRef.current.getBoundingClientRect();
    setMoving(true);
    setDrag({ x: event.clientX - box.left - roi.x, y: event.clientY - box.top - roi.y });
  };
  const resizeDown = (event: MouseEvent) => {
    if (locked) return;
    event.stopPropagation();
    setResizing(true);
    setDrag({ x: event.clientX, y: event.clientY });
  };
  const mouseMove = (event: MouseEvent) => {
    if (locked || !containerRef.current || (!moving && !resizing)) return;
    const box = containerRef.current.getBoundingClientRect();
    if (moving) {
      setRoi((old) => ({
        ...old,
        x: Math.max(0, Math.min(box.width - old.width, event.clientX - box.left - drag.x)),
        y: Math.max(0, Math.min(box.height - old.height, event.clientY - box.top - drag.y)),
      }));
    } else {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      setDrag({ x: event.clientX, y: event.clientY });
      setRoi((old) => ({
        ...old,
        width: Math.max(180, Math.min(box.width - old.x, old.width + dx)),
        height: Math.max(120, Math.min(box.height - old.y, old.height + dy)),
      }));
    }
  };

  const latest = analysis?.candles.at(-1);
  const entryWindow = countdown <= 5 || countdown >= 55;

  return (
    <div
      className="min-h-screen bg-[#040814] text-slate-100 font-sans"
      onMouseMove={mouseMove}
      onMouseUp={() => {
        setMoving(false);
        setResizing(false);
      }}
    >
      {/* HEADER */}
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-cyan-400 tracking-wider">TRADER YODHA X AI</h1>
            <p className="text-slate-500 text-sm">
              OTC Market Engine — ZigZag + Trap Detection + Reverse Logic + 00s–05s Entry
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right mr-2">
              <div className="text-xs text-slate-500">AI Brain</div>
              <div className="text-sm font-mono text-emerald-400">
                {stats.candles} Candles | {stats.memories} Patterns
              </div>
              <div className="text-xs font-mono text-slate-400">
                {stats.trades} Trades | WR: {stats.winRate.toFixed(1)}%
              </div>
            </div>
            {!active ? (
              <button
                onClick={() => void connect()}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg"
              >
                Connect OTC Screen
              </button>
            ) : (
              <button
                onClick={disconnect}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT COLUMN */}
          <div className="space-y-4">
            {/* SCAN CONTROL — with spinner */}
            <div className={card}>
              <button
                onClick={() => void runAnalysis()}
                disabled={!active || scanning}
                className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 ${
                  !active || scanning
                    ? "bg-slate-700 text-slate-500"
                    : "bg-cyan-600 hover:bg-cyan-500 text-white"
                }`}
              >
                {scanning && <Loader2 className="w-6 h-6 animate-spin" />}
                {scanning ? "DEEP 46S OTC ANALYSIS RUNNING..." : "FORCE MANUAL 46S SCAN"}
              </button>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-slate-500">Next Candle Entry:</span>
                <span
                  className={`font-mono text-xl ${entryWindow ? "text-emerald-400 font-bold animate-pulse" : "text-amber-400"}`}
                >
                  {countdown}s {entryWindow && "— ENTRY WINDOW"}
                </span>
              </div>
            </div>

            {/* OCR TELEMETRY */}
            <div className={card}>
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wider font-mono">
                OCR Telemetry
              </h3>
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-500">Price:</span>
                <span className={round ? "text-emerald-400 font-bold" : "text-cyan-400 font-bold"}>
                  {ocrText}
                </span>
              </div>
              <div className="flex justify-between text-xs font-mono mt-2">
                <span className="text-slate-500">Data source:</span>
                <span>Live OTC screen</span>
              </div>
            </div>

            {/* CANDLE BRAIN — updated, no EMA9/SMA20 */}
            <div className={card}>
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wider font-mono">
                Candle Brain
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                {[
                  ["Candles", stats.candles, "text-cyan-400"],
                  ["Patterns", stats.memories, "text-amber-400"],
                  ["ZigZag Points", stats.zigzag, "text-yellow-400"],
                  ["HH/HL/LH/LL", stats.structure, "text-sky-400"],
                ].map(([label, value, color]) => (
                  <div key={String(label)} className="bg-[#020617] p-3 rounded">
                    <div className="text-slate-500">{label}</div>
                    <div className={`${color} text-lg font-bold`}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* PATTERN DETECTION — NEW */}
            {analysis && (
              <div className={card}>
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wider font-mono">
                  OTC Pattern Detection
                </h3>
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    {analysis.patterns.sequential7.detected ? (
                      <TrendingUp
                        className={`w-4 h-4 ${analysis.patterns.sequential7.prediction === "CALL" ? "text-emerald-400" : "text-red-400"}`}
                      />
                    ) : (
                      <span className="w-4 h-4 inline-block" />
                    )}
                    <span className="text-slate-400">7-Candle Sequential:</span>
                    <span
                      className={
                        analysis.patterns.sequential7.detected
                          ? analysis.patterns.sequential7.prediction === "CALL"
                            ? "text-emerald-400 font-bold"
                            : analysis.patterns.sequential7.prediction === "PUT"
                              ? "text-red-400 font-bold"
                              : "text-slate-400"
                          : "text-slate-600"
                      }
                    >
                      {analysis.patterns.sequential7.detected
                        ? `${analysis.patterns.sequential7.prediction} (${analysis.patterns.sequential7.confidence.toFixed(0)}%)`
                        : "Not triggered"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`w-4 h-4 inline-block rounded-full ${
                        analysis.patterns.breakdown.detected ? "bg-red-500" : "bg-slate-700"
                      }`}
                    />
                    <span className="text-slate-400">2-Red Breakdown:</span>
                    <span
                      className={
                        analysis.patterns.breakdown.detected ? "text-red-400 font-bold" : "text-slate-600"
                      }
                    >
                      {analysis.patterns.breakdown.detected ? analysis.patterns.breakdown.level : "None"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {analysis.patterns.wickRejection.detected ? (
                      <TrendingDown
                        className={`w-4 h-4 ${analysis.patterns.wickRejection.direction === "PUT" ? "text-red-400" : "text-emerald-400"}`}
                      />
                    ) : (
                      <span className="w-4 h-4 inline-block" />
                    )}
                    <span className="text-slate-400">3-Wick Rejection:</span>
                    <span
                      className={
                        analysis.patterns.wickRejection.detected
                          ? analysis.patterns.wickRejection.direction === "CALL"
                            ? "text-emerald-400 font-bold"
                            : "text-red-400 font-bold"
                          : "text-slate-600"
                      }
                    >
                      {analysis.patterns.wickRejection.detected
                        ? `${analysis.patterns.wickRejection.direction} (${analysis.patterns.wickRejection.count} candles)`
                        : "None"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Zap
                      className={`w-4 h-4 ${analysis.patterns.confluence.score >= 2 ? "text-yellow-400" : "text-slate-600"}`}
                    />
                    <span className="text-slate-400">Confluence:</span>
                    <span
                      className={
                        analysis.patterns.confluence.score >= 2
                          ? "text-yellow-400 font-bold"
                          : "text-slate-600"
                      }
                    >
                      {analysis.patterns.confluence.score >= 2
                        ? `${analysis.patterns.confluence.score}x — ${analysis.patterns.confluence.points.join(" + ")}`
                        : `${analysis.patterns.confluence.score}x`}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {analysis.patterns.trap.detected ? (
                      <AlertTriangle className="w-4 h-4 text-orange-400 animate-pulse" />
                    ) : (
                      <Shield className="w-4 h-4 text-slate-600" />
                    )}
                    <span className="text-slate-400">Trap Detection:</span>
                    <span
                      className={
                        analysis.patterns.trap.detected
                          ? "text-orange-400 font-bold"
                          : "text-slate-600"
                      }
                    >
                      {analysis.patterns.trap.detected
                        ? `${analysis.patterns.trap.type} → ${analysis.patterns.trap.direction}`
                        : "No trap"}
                    </span>
                  </div>

                  {analysis.reversed && (
                    <div className="mt-2 px-2 py-1.5 bg-orange-900/40 border border-orange-500/50 rounded text-orange-400 font-bold text-center">
                      REVERSE LOGIC ACTIVATED — Signal Flipped
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* LIVE ANALYSIS — updated, no EMA9/SMA20 */}
            {analysis && (
              <div className={card}>
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wider font-mono">
                  Live Analysis
                </h3>
                <div className="text-xs text-slate-300 space-y-2 font-mono">
                  <div>
                    Latest: #{latest?.id} {latest?.shape}
                  </div>
                  <div>
                    Price: {priceText(analysis.price)} {round ? "ROUND SNR" : ""}
                  </div>
                  <div>Structure: {analysis.structure ?? "Awaiting pivot"}</div>
                  <div>
                    Sequence: <span className="text-cyan-300 break-all">{analysis.sequence.join(" → ")}</span>
                  </div>
                  <div>
                    Evidence: <span className="text-emerald-400">{analysis.confidence.toFixed(1)}%</span>
                  </div>
                  <div>
                    RSI14: {analysis.indicators.rsi14 == null ? "—" : analysis.indicators.rsi14.toFixed(1)}
                  </div>
                  <div className="text-slate-400">{analysis.reasons.join(" • ")}</div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN — 2/3 width */}
          <div className="lg:col-span-2 space-y-4">
            {/* CHART + CANDLE VISION */}
            <div className={card}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-400">
                  OTC CHART + CANDLE VISION + ZIGZAG OVERLAY
                </span>
                {active && (
                  <button
                    onClick={() => setLocked((value) => !value)}
                    className="px-3 py-1 rounded text-xs font-bold text-cyan-400 bg-cyan-900/60"
                  >
                    {locked ? "ROI Locked" : "Drag / Resize ROI"}
                  </button>
                )}
              </div>
              <div
                ref={containerRef}
                className="bg-[#020617] rounded-lg aspect-video flex items-center justify-center overflow-hidden border border-slate-900 relative select-none"
              >
                {active ? (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-contain pointer-events-none"
                    />
                    <canvas
                      ref={overlayRef}
                      className="absolute inset-0 pointer-events-none w-full h-full z-10"
                    />
                    <div
                      onMouseDown={mouseDown}
                      style={{
                        left: roi.x,
                        top: roi.y,
                        width: roi.width,
                        height: roi.height,
                      }}
                      className={`absolute border-2 ${locked ? "border-amber-400" : "border-cyan-400 cursor-move"} p-1 z-20`}
                    >
                      <div className="text-[10px] font-mono text-cyan-300 bg-slate-950/80 px-1">
                        AI CANDLE TARGET
                      </div>
                      {!locked && (
                        <div
                          onMouseDown={resizeDown}
                          className="w-3.5 h-3.5 bg-cyan-400 absolute bottom-0 right-0 cursor-se-resize"
                        />
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-center">
                    <p className="text-slate-500">Connect OTC chart screen to start TRADER_YODHA_X_AI.</p>
                    <p className="text-xs text-slate-600 mt-2">
                      The AI reads visible candles and prices — optimized for Quotex / ExpertOption OTC markets.
                    </p>
                  </div>
                )}
              </div>
              <canvas ref={canvasRef} className="hidden" />
              <canvas ref={ocrCanvasRef} className="hidden" />
              <div className="mt-3 px-4 py-2 bg-[#020617] rounded-lg border-l-4 border-cyan-500 flex items-center gap-2">
                {scanning && <Loader2 className="w-4 h-4 animate-spin text-cyan-400 flex-shrink-0" />}
                <p className="text-xs text-slate-400">
                  <strong className="text-cyan-400">Status:</strong> {status}
                </p>
              </div>
            </div>

            {/* SIGNAL ENGINE */}
            <div className={`${card} p-6`}>
              <div className="flex items-center justify-between mb-4">
                <span className="px-3 py-1 bg-amber-900/50 text-amber-300 text-xs font-bold rounded">
                  TRADER YODHA X — OTC SIGNAL ENGINE
                </span>
                <span className="text-xs text-slate-500 font-mono flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  00s–05s Entry Window
                </span>
              </div>
              <div className="text-center py-8">
                <div
                  className={`inline-block px-14 py-6 rounded-2xl text-6xl font-black tracking-widest border-4 ${
                    signal === "CALL"
                      ? "bg-emerald-500/10 border-emerald-400 text-emerald-400"
                      : signal === "PUT"
                        ? "bg-red-500/10 border-red-400 text-red-400"
                        : "bg-slate-800 border-slate-700 text-slate-600"
                  }`}
                >
                  {signal}
                </div>
                {reversed && signal !== "WAIT" && (
                  <div className="mt-3 text-orange-400 text-sm font-bold animate-pulse">
                    Signal Reversed via Loss-Streak Logic
                  </div>
                )}
              </div>
              {signal !== "WAIT" && (
                <div className="border-t border-slate-800 pt-4">
                  <p className="text-xs text-slate-400 text-center mb-3">
                    Log outcome to train the live OTC brain:
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => logOutcome("WIN")}
                      className="py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-500"
                    >
                      WIN
                    </button>
                    <button
                      onClick={() => logOutcome("LOSS")}
                      className="py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-500"
                    >
                      LOSS
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
