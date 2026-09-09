import { useCallback, useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { createWorker } from "tesseract.js";
import { Loader2, AlertTriangle, TrendingUp, TrendingDown, Shield, Zap, Activity, Layers, Image as ImageIcon, Cpu } from "lucide-react";

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

type AutoPattern = {
  key: string;
  length: number;
  green: number;
  red: number;
  neutral: number;
  wins: number;
  losses: number;
  occurrences: number;
  confidence: number;
  bestOutcome: Signal;
};

type Brain = {
  memories: Memory[];
  trades: Array<{ pattern: string; result: Outcome; price: number }>;
  zigzag: Array<{ price: number; type: "HIGH" | "LOW"; occurrences: number }>;
  structure: Array<{ label: Structure; y: number; candleId: number }>;
  autoPatterns: AutoPattern[];
  extractedRules: ExtractedRule[];
  winRate: number;
};

type Indicators = { rsi14: number | null };

type ZigZagPoint = {
  index: number;
  y: number;
  type: "HIGH" | "LOW";
  candleId: number;
  label: Structure;
};

type SNRLevel = {
  y: number;
  type: "SUPPORT" | "RESISTANCE";
  touches: number;
  price: number | null;
  label: string;
  isRound: boolean;
  isMajor: boolean;
  behavior: "NONE" | "BOUNCE" | "BREAK";
  strength: number;
};

type PatternFlags = {
  sequential7: { detected: boolean; prediction: Signal; confidence: number };
  breakdown: { detected: boolean; level: string };
  wickRejection: { detected: boolean; direction: "CALL" | "PUT"; count: number };
  confluence: { score: number; points: string[] };
  trap: { detected: boolean; type: string; direction: "CALL" | "PUT" };
  autoPrediction: { prediction: Signal; confidence: number; matched: string };
  extractedRule: { detected: boolean; rule: string; direction: "CALL" | "PUT"; confidence: number };
};

// A single logic's contribution to the combined CALL/PUT score
type ScoreContribution = {
  logic: string;
  direction: "CALL" | "PUT";
  weight: number;
  detail: string;
};

// Identifies a participating rule for outcome learning
type ParticipatingRule = {
  type: "MEMORY" | "AUTO_PATTERN" | "EXTRACTED_RULE";
  id: string;
  key?: string;
  direction: "CALL" | "PUT";
};

// Image-extracted pattern with exact visual metrics
type ExtractedRule = {
  id: string;
  name: string;
  bodyPct: number;
  upperWickPct: number;
  lowerWickPct: number;
  colorFlow: string;
  levelBehavior: "SR_REJECTION" | "FAKE_BREAKOUT" | "EXHAUSTION_SWEEP" | "NONE";
  direction: "CALL" | "PUT";
  trustWeight: number;
  occurrences: number;
  wins: number;
  losses: number;
  source: "IMAGE" | "LIVE_VARIANT";
  createdAt: number;
};

// Metrics extracted from an uploaded chart image
type ImageMetrics = {
  candleCount: number;
  avgBodyPct: number;
  avgUpperWickPct: number;
  avgLowerWickPct: number;
  colorFlow: string;
  levelBehavior: string;
  extractedCandles: Array<{ bodyPct: number; upperWickPct: number; lowerWickPct: number; color: Color }>;
};

// ============================================
// CONSTANTS — OTC Optimized
// ============================================

const DB = "TRADER_YODHA_X_AI";
const STORE = "TRADER_YODHA_X_AI_BRAIN";
const KEY = "TRADER_YODHA_X_AI_BRAIN_STATE";
const MAX_CANDLES = 120;

const ZIGZAG_DEVIATION = 5;
const ZIGZAG_DEPTH = 1;
const ZIGZAG_BACKSTEP = 3;

const WICK_REJECTION_RATIO = 1.5;
const WICK_REJECTION_COUNT = 3;
const BREAKDOWN_TOLERANCE_PX = 3;
const CONFLUENCE_PROXIMITY_PX = 8;
const TRAP_WICK_MULTIPLIER = 2.5;
const REVERSE_LOSS_STREAK = 2;

const SNR_CLUSTER_PROXIMITY_PX = 8;
const SNR_MAX_LEVELS = 8;
const SNR_MIN_TOUCHES = 2;
const AUTO_PATTERN_MIN_LENGTH = 2;
const AUTO_PATTERN_MAX_LENGTH = 4;
const AUTO_PATTERN_MIN_OCCURRENCES = 2;

const ANALYSIS_INTERVAL_MS = 800;

// Combined confidence threshold — signal fires only when the dominant side
// exceeds this percentage of the total weighted evidence
const SIGNAL_THRESHOLD = 58;
// Minimum total weighted evidence required before any signal is considered
const MIN_TOTAL_EVIDENCE = 4;

const token = (c: Candle) => `${c.color[0]}-${c.shape}`;
const roundNumber = (p: number) => /(?:000|500)$/.test(p.toFixed(5));
const priceText = (p: number | null) => (p == null ? "—" : p.toFixed(5));
const card = "bg-[#0f172a] rounded-xl p-5 border border-slate-800";

// Richer micro-sequence token for auto pattern learning — encodes color, body size, and wick dominance
function microToken(c: Candle): string {
  const sizeCat = c.body > 25 ? "LG" : c.body > 10 ? "MD" : "SM";
  const wickCat = c.upperRatio > 1.5 ? "UW" : c.lowerRatio > 1.5 ? "LW" : "NW";
  return `${c.color[0]}-${sizeCat}-${wickCat}`;
}

// ============================================
// INDICATORS — RSI14 only
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

  for (let i = depth; i < candles.length - depth; i++) {
    let isHigh = true;
    for (let j = i - depth; j <= i + depth; j++) {
      if (j === i) continue;
      if (candles[j].top < candles[i].top) { isHigh = false; break; }
    }
    if (isHigh) rawPivots.push({ index: i, y: candles[i].top, type: "HIGH" });

    let isLow = true;
    for (let j = i - depth; j <= i + depth; j++) {
      if (j === i) continue;
      if (candles[j].bottom > candles[i].bottom) { isLow = false; break; }
    }
    if (isLow) rawPivots.push({ index: i, y: candles[i].bottom, type: "LOW" });
  }

  rawPivots.sort((a, b) => a.index - b.index);

  const confirmed: RawPivot[] = [];
  for (const pivot of rawPivots) {
    const last = confirmed[confirmed.length - 1];
    if (!last) { confirmed.push(pivot); continue; }
    if (pivot.type === last.type) {
      if (pivot.type === "HIGH" && pivot.y < last.y) confirmed[confirmed.length - 1] = pivot;
      else if (pivot.type === "LOW" && pivot.y > last.y) confirmed[confirmed.length - 1] = pivot;
      continue;
    }
    if (Math.abs(pivot.y - last.y) < deviation) continue;
    const lastSameType = [...confirmed].reverse().find((p) => p.type === pivot.type);
    if (lastSameType && pivot.index - lastSameType.index < backstep) continue;
    confirmed.push(pivot);
  }

  const result: ZigZagPoint[] = [];
  let prevHigh: RawPivot | null = null;
  let prevLow: RawPivot | null = null;

  for (const pivot of confirmed) {
    let label: Structure;
    if (pivot.type === "HIGH") {
      label = !prevHigh || pivot.y < prevHigh.y ? "HH" : "LH";
      prevHigh = pivot;
    } else {
      label = !prevLow || pivot.y < prevLow.y ? "HL" : "LL";
      prevLow = pivot;
    }
    result.push({ index: pivot.index, y: pivot.y, type: pivot.type, candleId: candles[pivot.index].id, label });
  }

  return result;
}

// ============================================
// AUTO LEVEL DETECTION SYSTEM
// Automatically detects Support/Resistance from swing highs/lows,
// classifies major vs minor by touch count, detects psychological round-number
// levels, and checks break/bounce behavior against the latest candle.
// ============================================

function calculateSNRLevels(
  zigzag: ZigZagPoint[],
  candles: Candle[],
  prices: number[],
): SNRLevel[] {
  const levels: SNRLevel[] = [];
  const latest = candles.at(-1);

  // --- Cluster HIGH pivots → resistance levels ---
  const highClusters: { y: number; touches: number; candleIds: number[] }[] = [];
  for (const p of zigzag.filter((z) => z.type === "HIGH")) {
    const cluster = highClusters.find((c) => Math.abs(c.y - p.y) < SNR_CLUSTER_PROXIMITY_PX);
    if (cluster) {
      cluster.y = (cluster.y * cluster.touches + p.y) / (cluster.touches + 1);
      cluster.touches++;
      cluster.candleIds.push(p.candleId);
    } else {
      highClusters.push({ y: p.y, touches: 1, candleIds: [p.candleId] });
    }
  }

  // --- Cluster LOW pivots → support levels ---
  const lowClusters: { y: number; touches: number; candleIds: number[] }[] = [];
  for (const p of zigzag.filter((z) => z.type === "LOW")) {
    const cluster = lowClusters.find((c) => Math.abs(c.y - p.y) < SNR_CLUSTER_PROXIMITY_PX);
    if (cluster) {
      cluster.y = (cluster.y * cluster.touches + p.y) / (cluster.touches + 1);
      cluster.touches++;
      cluster.candleIds.push(p.candleId);
    } else {
      lowClusters.push({ y: p.y, touches: 1, candleIds: [p.candleId] });
    }
  }

  // Helper: detect break vs bounce behavior
  const detectBehavior = (levelY: number, type: "SUPPORT" | "RESISTANCE"): "NONE" | "BOUNCE" | "BREAK" => {
    if (!latest) return "NONE";
    if (type === "RESISTANCE") {
      // Break: candle closed above resistance
      if (latest.bodyTop < levelY - BREAKDOWN_TOLERANCE_PX && latest.closeY < levelY) return "BOUNCE";
      if (latest.closeY < levelY && latest.top > levelY) return "BOUNCE"; // wick rejection
      if (latest.closeY > levelY + BREAKDOWN_TOLERANCE_PX) return "BREAK";
    } else {
      // Break: candle closed below support
      if (latest.bodyBottom > levelY + BREAKDOWN_TOLERANCE_PX && latest.closeY > levelY) return "BOUNCE";
      if (latest.closeY > levelY && latest.bottom < levelY) return "BOUNCE"; // wick rejection
      if (latest.closeY < levelY - BREAKDOWN_TOLERANCE_PX) return "BREAK";
    }
    return "NONE";
  };

  // Build resistance levels — only levels with SNR_MIN_TOUCHES or more distinct touches
  for (const c of highClusters) {
    if (c.touches < SNR_MIN_TOUCHES) continue;
    const isMajor = c.touches >= 3;
    const behavior = detectBehavior(Math.round(c.y), "RESISTANCE");
    levels.push({
      y: Math.round(c.y),
      type: "RESISTANCE",
      touches: c.touches,
      price: null,
      label: `${isMajor ? "Major " : ""}R (${c.touches}x)`,
      isRound: false,
      isMajor,
      behavior,
      strength: Math.min(c.touches * 20, 100),
    });
  }

  // Build support levels — only levels with SNR_MIN_TOUCHES or more distinct touches
  for (const c of lowClusters) {
    if (c.touches < SNR_MIN_TOUCHES) continue;
    const isMajor = c.touches >= 3;
    const behavior = detectBehavior(Math.round(c.y), "SUPPORT");
    levels.push({
      y: Math.round(c.y),
      type: "SUPPORT",
      touches: c.touches,
      price: null,
      label: `${isMajor ? "Major " : ""}S (${c.touches}x)`,
      isRound: false,
      isMajor,
      behavior,
      strength: Math.min(c.touches * 20, 100),
    });
  }

  // --- Round number psychological levels — only major .000 and .500 within visible chart ---
  if (prices.length >= 2 && candles.length >= 2) {
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;
    if (priceRange > 0) {
      const minTop = Math.min(...candles.map((c) => c.top));
      const maxBottom = Math.max(...candles.map((c) => c.bottom));
      const yRange = maxBottom - minTop;
      if (yRange > 0) {
        const pricePerPixel = priceRange / yRange;
        const currentPrice = prices[prices.length - 1];
        const latestCandle = candles[candles.length - 1];

        // Only major psychological levels: .000 and .500
        const roundTargets = new Set<number>();
        for (const interval of [0.001, 0.0005]) {
          const base = Math.round(currentPrice / interval) * interval;
          for (const offset of [-interval, 0, interval]) {
            const target = Math.round((base + offset) * 1e6) / 1e6;
            if (target > 0 && /(?:000|500)$/.test(target.toFixed(5))) roundTargets.add(target);
          }
        }

        for (const target of roundTargets) {
          const y = Math.round(latestCandle.closeY - (target - currentPrice) / pricePerPixel);
          // Only draw if within the visible chart area
          if (y < 0 || y > yRange + minTop) continue;
          if (levels.some((l) => Math.abs(l.y - y) < SNR_CLUSTER_PROXIMITY_PX)) continue;

          // Count actual candle touches at this level
          let touchCount = 0;
          for (const c of candles) {
            if (Math.abs(c.top - y) < SNR_CLUSTER_PROXIMITY_PX || Math.abs(c.bottom - y) < SNR_CLUSTER_PROXIMITY_PX) touchCount++;
          }
          if (touchCount < 1) continue; // skip if no candle is near this round number

          const behavior = detectBehavior(y, target > currentPrice ? "RESISTANCE" : "SUPPORT");
          const isMajor = true; // .000 and .500 are always major
          levels.push({
            y,
            type: target > currentPrice ? "RESISTANCE" : "SUPPORT",
            touches: touchCount,
            price: target,
            label: `Round ${target.toFixed(5)} (${touchCount}x)`,
            isRound: true,
            isMajor,
            behavior,
            strength: Math.min(touchCount * 20, 100),
          });
        }
      }
    }
  }

  // Sort by strength (touches × type weight) and return top levels
  // Major levels always rank above minor; round numbers rank by touch count
  return levels
    .sort((a, b) => {
      if (a.isMajor !== b.isMajor) return a.isMajor ? -1 : 1;
      return b.touches - a.touches;
    })
    .slice(0, SNR_MAX_LEVELS);
}

// ============================================
// HUMAN-BRAIN AUTO PATTERN GENERATOR & SEQUENCE LEARNER
// Tracks micro-sequences (size, wick, color) and learns what follows
// ============================================

function autoLearn(candles: Candle[], brain: Brain): void {
  for (let len = AUTO_PATTERN_MIN_LENGTH; len <= AUTO_PATTERN_MAX_LENGTH; len++) {
    if (candles.length < len + 1) continue;
    const seq = candles.slice(-(len + 1));
    const key = seq.slice(0, len).map(microToken).join(">");
    const outcome = seq[len];
    let pattern = brain.autoPatterns.find((p) => p.key === key);
    if (!pattern) {
      pattern = { key, length: len, green: 0, red: 0, neutral: 0, wins: 0, losses: 0, occurrences: 0, confidence: 0, bestOutcome: "WAIT" };
      brain.autoPatterns.push(pattern);
    }
    pattern.occurrences++;
    if (outcome.color === "GREEN") pattern.green++;
    else if (outcome.color === "RED") pattern.red++;
    else pattern.neutral++;
    pattern.confidence = pattern.occurrences > 0
      ? (Math.max(pattern.green, pattern.red) / pattern.occurrences) * 100
      : 0;
    pattern.bestOutcome = pattern.green > pattern.red ? "CALL" : pattern.red > pattern.green ? "PUT" : "WAIT";
  }
}

function getAutoPrediction(candles: Candle[], brain: Brain): { prediction: Signal; confidence: number; matched: string } {
  if (candles.length < 3) return { prediction: "WAIT", confidence: 0, matched: "" };
  for (let len = Math.min(AUTO_PATTERN_MAX_LENGTH, candles.length - 1); len >= AUTO_PATTERN_MIN_LENGTH; len--) {
    const seq = candles.slice(-len);
    const key = seq.map(microToken).join(">");
    const pattern = brain.autoPatterns.find((p) => p.key === key && p.occurrences >= AUTO_PATTERN_MIN_OCCURRENCES);
    if (pattern && pattern.bestOutcome !== "WAIT" && pattern.confidence >= 55) {
      return { prediction: pattern.bestOutcome, confidence: pattern.confidence, matched: `${len}-candle micro (${pattern.occurrences}x)` };
    }
  }
  return { prediction: "WAIT", confidence: 0, matched: "" };
}

// ============================================
// ADVANCED OTC PATTERN DETECTORS
// ============================================

function detectSequential7(candles: Candle[], brain: Brain): { detected: boolean; prediction: Signal; confidence: number } {
  if (candles.length < 7) return { detected: false, prediction: "WAIT", confidence: 0 };
  const seq = candles.slice(-7);
  if (seq[0].color !== "RED" || seq[1].color !== "GREEN") return { detected: false, prediction: "WAIT", confidence: 0 };
  const key = seq.slice(0, 6).map(token).join(">");
  const memory = brain.memories.find((m) => m.key === key);
  if (memory && memory.occurrences >= 2) {
    const prediction: Signal = memory.green > memory.red ? "CALL" : memory.red > memory.green ? "PUT" : "WAIT";
    return { detected: true, prediction, confidence: memory.confidence };
  }
  const greens = seq.filter((c) => c.color === "GREEN").length;
  const reds = seq.filter((c) => c.color === "RED").length;
  if (greens > reds) return { detected: true, prediction: "CALL", confidence: 55 };
  if (reds > greens) return { detected: true, prediction: "PUT", confidence: 55 };
  return { detected: true, prediction: "WAIT", confidence: 0 };
}

function detectBreakdown(candles: Candle[], zigzag: ZigZagPoint[]): { detected: boolean; level: string } {
  if (candles.length < 2) return { detected: false, level: "" };
  const last2 = candles.slice(-2);
  if (last2[0].color !== "RED" || last2[1].color !== "RED") return { detected: false, level: "" };
  const lastLow = [...zigzag].reverse().find((p) => p.type === "LOW");
  if (!lastLow) return { detected: false, level: "" };
  if (last2[1].bottom > lastLow.y + BREAKDOWN_TOLERANCE_PX) return { detected: true, level: `Support broken @ pivot #${lastLow.candleId}` };
  return { detected: false, level: "" };
}

function detectWickRejection(candles: Candle[]): { detected: boolean; direction: "CALL" | "PUT"; count: number } {
  if (candles.length < WICK_REJECTION_COUNT) return { detected: false, direction: "CALL", count: 0 };
  const last3 = candles.slice(-WICK_REJECTION_COUNT);
  const allUpperReject = last3.every((c) => c.upperRatio > WICK_REJECTION_RATIO && c.upper > c.body * WICK_REJECTION_RATIO);
  if (allUpperReject) return { detected: true, direction: "PUT", count: WICK_REJECTION_COUNT };
  const allLowerReject = last3.every((c) => c.lowerRatio > WICK_REJECTION_RATIO && c.lower > c.body * WICK_REJECTION_RATIO);
  if (allLowerReject) return { detected: true, direction: "CALL", count: WICK_REJECTION_COUNT };
  return { detected: false, direction: "CALL", count: 0 };
}

function detectConfluence(candles: Candle[], zigzag: ZigZagPoint[], price: number | null, isRound: boolean, brain: Brain): { score: number; points: string[] } {
  const latest = candles.at(-1);
  if (!latest) return { score: 0, points: [] };
  let score = 0;
  const points: string[] = [];
  if (isRound && price) { score++; points.push("Round Number SNR"); }
  const nearHigh = zigzag.some((p) => p.type === "HIGH" && Math.abs(p.y - latest.top) < CONFLUENCE_PROXIMITY_PX);
  const nearLow = zigzag.some((p) => p.type === "LOW" && Math.abs(p.y - latest.bottom) < CONFLUENCE_PROXIMITY_PX);
  if (nearHigh || nearLow) { score++; points.push("ZigZag Swing Level"); }
  if (price) {
    const nearSNR = brain.zigzag.some((z) => Math.abs(z.price - price) < 0.0003);
    if (nearSNR) { score++; points.push("Historical SNR"); }
  }
  if (zigzag.length >= 2) {
    const lastPivot = zigzag[zigzag.length - 1];
    const sameLevel = zigzag.filter((p) => p.type === lastPivot.type && Math.abs(p.y - lastPivot.y) < 10);
    if (sameLevel.length >= 2) { score++; points.push("Multi-touch Level"); }
  }
  return { score, points };
}

// ============================================
// HUMAN-BRAIN OTC TRAP DETECTION
// ============================================

function detectTraps(candles: Candle[], zigzag: ZigZagPoint[]): { detected: boolean; type: string; direction: "CALL" | "PUT" } {
  if (candles.length < 4 || zigzag.length < 2) return { detected: false, type: "", direction: "CALL" };
  const latest = candles.at(-1)!;
  const recentHighs = zigzag.filter((p) => p.type === "HIGH").slice(-2);
  const recentLows = zigzag.filter((p) => p.type === "LOW").slice(-2);

  for (const high of recentHighs) {
    if (latest.top < high.y - BREAKDOWN_TOLERANCE_PX && latest.closeY > high.y + BREAKDOWN_TOLERANCE_PX)
      return { detected: true, type: "Fake Breakout (Resistance)", direction: "PUT" };
  }
  for (const low of recentLows) {
    if (latest.bottom > low.y + BREAKDOWN_TOLERANCE_PX && latest.closeY < low.y - BREAKDOWN_TOLERANCE_PX)
      return { detected: true, type: "Fake Breakout (Support)", direction: "CALL" };
  }
  for (const high of recentHighs) {
    if (latest.top < high.y - 5 && latest.bodyTop > high.y)
      return { detected: true, type: "Liquidity Sweep (Above Resistance)", direction: "PUT" };
  }
  for (const low of recentLows) {
    if (latest.bottom > low.y + 5 && latest.bodyBottom < low.y)
      return { detected: true, type: "Liquidity Sweep (Below Support)", direction: "CALL" };
  }

  const last4 = candles.slice(-4);
  if (last4.length === 4) {
    const first3 = last4.slice(0, 3);
    const allGreen = first3.every((c) => c.color === "GREEN");
    const allRed = first3.every((c) => c.color === "RED");
    if (allGreen && latest.upper > latest.body * TRAP_WICK_MULTIPLIER)
      return { detected: true, type: "Exhaustion Wick (Bullish Trend)", direction: "PUT" };
    if (allRed && latest.lower > latest.body * TRAP_WICK_MULTIPLIER)
      return { detected: true, type: "Exhaustion Wick (Bearish Trend)", direction: "CALL" };
  }
  return { detected: false, type: "", direction: "CALL" };
}

// ============================================
// IMAGE PATTERN EXTRACTOR — Auto-Learning from chart screenshots
// Analyzes uploaded candle chart images and converts visual rules into programmatic detectors
// ============================================

// Extract candle metrics from an image's pixel data
function extractImageMetrics(data: Uint8ClampedArray, width: number, height: number): ImageMetrics {
  const found = detectCandles(data, width, height);
  if (found.length === 0) {
    return { candleCount: 0, avgBodyPct: 0, avgUpperWickPct: 0, avgLowerWickPct: 0, colorFlow: "UNKNOWN", levelBehavior: "NONE", extractedCandles: [] };
  }

  const extractedCandles = found.map((c) => {
    const total = Math.max(1, c.bottom - c.top);
    return {
      bodyPct: (c.body / total) * 100,
      upperWickPct: (c.upper / total) * 100,
      lowerWickPct: (c.lower / total) * 100,
      color: c.color,
    };
  });

  const avgBodyPct = extractedCandles.reduce((s, c) => s + c.bodyPct, 0) / extractedCandles.length;
  const avgUpperWickPct = extractedCandles.reduce((s, c) => s + c.upperWickPct, 0) / extractedCandles.length;
  const avgLowerWickPct = extractedCandles.reduce((s, c) => s + c.lowerWickPct, 0) / extractedCandles.length;

  // Build color flow string: e.g., "GREEN→GREEN→RED"
  const colorFlow = found.slice(-6).map((c) => c.color).join("→");

  // Detect level behavior from last 3 candles
  const last3 = found.slice(-3);
  let levelBehavior: ImageMetrics["levelBehavior"] = "NONE";

  // Check for S/R Rejection: long wick on latest candle touching a recent extreme
  if (last3.length >= 2) {
    const latest = last3[last3.length - 1];
    const prevHigh = Math.min(...last3.slice(0, -1).map((c) => c.top));
    const prevLow = Math.max(...last3.slice(0, -1).map((c) => c.bottom));

    // Upper wick rejection at resistance
    if (latest.upperRatio > 1.5 && latest.top < prevHigh + 5) {
      levelBehavior = "SR_REJECTION";
    }
    // Lower wick rejection at support
    if (latest.lowerRatio > 1.5 && latest.bottom > prevLow - 5) {
      levelBehavior = "SR_REJECTION";
    }
  }

  // Check for Fake Breakout: candle broke a level but closed back inside
  if (last3.length >= 3 && levelBehavior === "NONE") {
    const latest = last3[2];
    const range1 = last3[0];
    if (latest.top < range1.top - 3 && latest.closeY > range1.top) {
      levelBehavior = "FAKE_BREAKOUT";
    }
    if (latest.bottom > range1.bottom + 3 && latest.closeY < range1.bottom) {
      levelBehavior = "FAKE_BREAKOUT";
    }
  }

  // Check for Exhaustion Sweep: 3+ same-color candles then long wick reversal
  if (last3.length >= 3 && levelBehavior === "NONE") {
    const first2SameColor = last3[0].color === last3[1].color;
    const latest = last3[2];
    if (first2SameColor) {
      if (last3[0].color === "GREEN" && latest.lower > latest.body * 2) {
        levelBehavior = "EXHAUSTION_SWEEP";
      }
      if (last3[0].color === "RED" && latest.upper > latest.body * 2) {
        levelBehavior = "EXHAUSTION_SWEEP";
      }
    }
  }

  return { candleCount: found.length, avgBodyPct, avgUpperWickPct, avgLowerWickPct, colorFlow, levelBehavior, extractedCandles };
}

// Seeded default rules extracted from common OTC chart patterns (high trust baseline)
const SEED_RULES: ExtractedRule[] = [
  {
    id: "seed-engulfing-red",
    name: "Engulfing Red after Greens",
    bodyPct: 65, upperWickPct: 10, lowerWickPct: 10,
    colorFlow: "GREEN→GREEN→RED",
    levelBehavior: "NONE",
    direction: "PUT",
    trustWeight: 70,
    occurrences: 0, wins: 0, losses: 0,
    source: "IMAGE",
    createdAt: 0,
  },
  {
    id: "seed-engulfing-green",
    name: "Engulfing Green after Reds",
    bodyPct: 65, upperWickPct: 10, lowerWickPct: 10,
    colorFlow: "RED→RED→GREEN",
    levelBehavior: "NONE",
    direction: "CALL",
    trustWeight: 70,
    occurrences: 0, wins: 0, losses: 0,
    source: "IMAGE",
    createdAt: 0,
  },
  {
    id: "seed-sr-rejection-bull",
    name: "Support Rejection (Lower Wick)",
    bodyPct: 35, upperWickPct: 15, lowerWickPct: 50,
    colorFlow: "RED→RED→GREEN",
    levelBehavior: "SR_REJECTION",
    direction: "CALL",
    trustWeight: 75,
    occurrences: 0, wins: 0, losses: 0,
    source: "IMAGE",
    createdAt: 0,
  },
  {
    id: "seed-sr-rejection-bear",
    name: "Resistance Rejection (Upper Wick)",
    bodyPct: 35, upperWickPct: 50, lowerWickPct: 15,
    colorFlow: "GREEN→GREEN→RED",
    levelBehavior: "SR_REJECTION",
    direction: "PUT",
    trustWeight: 75,
    occurrences: 0, wins: 0, losses: 0,
    source: "IMAGE",
    createdAt: 0,
  },
  {
    id: "seed-fake-breakout-up",
    name: "Fake Breakout above Resistance",
    bodyPct: 50, upperWickPct: 25, lowerWickPct: 10,
    colorFlow: "GREEN→RED→RED",
    levelBehavior: "FAKE_BREAKOUT",
    direction: "PUT",
    trustWeight: 72,
    occurrences: 0, wins: 0, losses: 0,
    source: "IMAGE",
    createdAt: 0,
  },
  {
    id: "seed-fake-breakout-down",
    name: "Fake Breakout below Support",
    bodyPct: 50, upperWickPct: 10, lowerWickPct: 25,
    colorFlow: "RED→GREEN→GREEN",
    levelBehavior: "FAKE_BREAKOUT",
    direction: "CALL",
    trustWeight: 72,
    occurrences: 0, wins: 0, losses: 0,
    source: "IMAGE",
    createdAt: 0,
  },
  {
    id: "seed-exhaustion-bull",
    name: "Exhaustion Sweep (Bullish Reversal)",
    bodyPct: 30, upperWickPct: 15, lowerWickPct: 55,
    colorFlow: "RED→RED→GREEN",
    levelBehavior: "EXHAUSTION_SWEEP",
    direction: "CALL",
    trustWeight: 68,
    occurrences: 0, wins: 0, losses: 0,
    source: "IMAGE",
    createdAt: 0,
  },
  {
    id: "seed-exhaustion-bear",
    name: "Exhaustion Sweep (Bearish Reversal)",
    bodyPct: 30, upperWickPct: 55, lowerWickPct: 15,
    colorFlow: "GREEN→GREEN→RED",
    levelBehavior: "EXHAUSTION_SWEEP",
    direction: "PUT",
    trustWeight: 68,
    occurrences: 0, wins: 0, losses: 0,
    source: "IMAGE",
    createdAt: 0,
  },
];

// Match live candles against extracted image rules
function detectExtractedRules(candles: Candle[], zigzag: ZigZagPoint[], rules: ExtractedRule[]): { detected: boolean; rule: string; direction: "CALL" | "PUT"; confidence: number } {
  if (candles.length < 3 || rules.length === 0) return { detected: false, rule: "", direction: "CALL", confidence: 0 };

  const last3 = candles.slice(-3);
  const latest = last3[2];
  const total = Math.max(1, latest.bottom - latest.top);
  const liveBodyPct = (latest.body / total) * 100;
  const liveUpperPct = (latest.upper / total) * 100;
  const liveLowerPct = (latest.lower / total) * 100;
  const liveColorFlow = last3.map((c) => c.color).join("→");

  let bestMatch: ExtractedRule | null = null;
  let bestScore = 0;

  for (const rule of rules) {
    let score = 0;

    // Color flow match (weighted heavily)
    if (rule.colorFlow === liveColorFlow) score += 40;
    else if (rule.colorFlow.endsWith(latest.color)) score += 15;

    // Body percentage proximity (±15% tolerance)
    const bodyDiff = Math.abs(rule.bodyPct - liveBodyPct);
    if (bodyDiff < 15) score += (15 - bodyDiff);

    // Upper wick proximity (±15% tolerance)
    const upperDiff = Math.abs(rule.upperWickPct - liveUpperPct);
    if (upperDiff < 15) score += (15 - upperDiff) * 0.5;

    // Lower wick proximity (±15% tolerance)
    const lowerDiff = Math.abs(rule.lowerWickPct - liveLowerPct);
    if (lowerDiff < 15) score += (15 - lowerDiff) * 0.5;

    // Level behavior match
    if (rule.levelBehavior !== "NONE") {
      const recentHighs = zigzag.filter((p) => p.type === "HIGH").slice(-2);
      const recentLows = zigzag.filter((p) => p.type === "LOW").slice(-2);
      if (rule.levelBehavior === "SR_REJECTION") {
        if (rule.direction === "CALL" && latest.lowerRatio > 1.5) score += 20;
        if (rule.direction === "PUT" && latest.upperRatio > 1.5) score += 20;
      }
      if (rule.levelBehavior === "FAKE_BREAKOUT") {
        for (const h of recentHighs) {
          if (latest.top < h.y - 3 && latest.closeY > h.y) { score += 20; break; }
        }
        for (const l of recentLows) {
          if (latest.bottom > l.y + 3 && latest.closeY < l.y) { score += 20; break; }
        }
      }
      if (rule.levelBehavior === "EXHAUSTION_SWEEP") {
        const first2 = last3.slice(0, 2);
        if (rule.direction === "CALL" && first2.every((c) => c.color === "RED") && latest.lower > latest.body * 2) score += 20;
        if (rule.direction === "PUT" && first2.every((c) => c.color === "GREEN") && latest.upper > latest.body * 2) score += 20;
      }
    }

    // Factor in trust weight
    score = (score * rule.trustWeight) / 100;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = rule;
    }
  }

  if (bestMatch && bestScore >= 35) {
    return { detected: true, rule: bestMatch.name, direction: bestMatch.direction, confidence: Math.min(bestScore, 95) };
  }
  return { detected: false, rule: "", direction: "CALL", confidence: 0 };
}

// Generate variant rules from a matched extracted rule + live outcome
function generateVariant(rule: ExtractedRule, liveCandles: Candle[], outcome: Outcome): ExtractedRule | null {
  if (liveCandles.length < 3) return null;
  const last3 = liveCandles.slice(-3);
  const latest = last3[2];
  const total = Math.max(1, latest.bottom - latest.top);

  const variant: ExtractedRule = {
    id: `variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: `Variant: ${rule.name} → ${outcome}`,
    bodyPct: Math.round((latest.body / total) * 100),
    upperWickPct: Math.round((latest.upper / total) * 100),
    lowerWickPct: Math.round((latest.lower / total) * 100),
    colorFlow: last3.map((c) => c.color).join("→"),
    levelBehavior: rule.levelBehavior,
    direction: outcome === "WIN" ? rule.direction : rule.direction === "CALL" ? "PUT" : "CALL",
    trustWeight: outcome === "WIN" ? Math.min(rule.trustWeight + 5, 90) : Math.max(rule.trustWeight - 10, 40),
    occurrences: 1,
    wins: outcome === "WIN" ? 1 : 0,
    losses: outcome === "LOSS" ? 1 : 0,
    source: "LIVE_VARIANT",
    createdAt: Date.now(),
  };

  return variant;
}

// ============================================
// CANDLE DETECTION (Pixel-based, OTC optimized for fast micro-trends)
// ============================================

function detectCandles(data: Uint8ClampedArray, width: number, height: number): Candle[] {
  const columns = new Uint16Array(width);
  const green = new Uint16Array(width);
  const red = new Uint16Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const isGreen = data[i + 1] > data[i] + 35 && data[i + 1] > data[i + 2] + 25 && data[i + 1] > 80;
      const isRed = data[i] > data[i + 1] + 35 && data[i] > data[i + 2] + 25 && data[i] > 80;
      if (isGreen || isRed) { columns[x]++; if (isGreen) green[x]++; else red[x]++; }
    }
  }
  const groups: Array<[number, number]> = [];
  // OTC micro-trend: lower threshold to catch rapid spike candles
  const threshold = Math.max(2, Math.floor(height * 0.012));
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
      let top = height; let bottom = 0; let g = 0; let r = 0;
      for (let x = left; x <= right; x++) {
        for (let y = 0; y < height; y++) {
          const i = (y * width + x) * 4;
          const isGreen = data[i + 1] > data[i] + 35 && data[i + 1] > data[i + 2] + 25 && data[i + 1] > 80;
          const isRed = data[i] > data[i + 1] + 35 && data[i] > data[i + 2] + 25 && data[i] > 80;
          if (isGreen || isRed) { top = Math.min(top, y); bottom = Math.max(bottom, y); if (isGreen) g++; else r++; }
        }
      }
      const color: Color = g > r * 1.15 ? "GREEN" : r > g * 1.15 ? "RED" : "NEUTRAL";
      const bodyTop = top + Math.max(1, Math.floor((bottom - top) * 0.18));
      const bodyBottom = bottom - Math.max(1, Math.floor((bottom - top) * 0.18));
      const body = Math.max(1, bodyBottom - bodyTop);
      const upper = Math.max(0, bodyTop - top);
      const lower = Math.max(0, bottom - bodyBottom);
      const ratio = body / Math.max(1, bottom - top);
      const shape = color === "NEUTRAL" ? "INDECISION" : ratio < 0.12 ? "DOJI"
        : lower > body * 1.5 && lower > upper ? "LOWER_REJECTION"
        : upper > body * 1.5 && upper > lower ? "UPPER_REJECTION"
        : ratio >= 0.7 ? (color === "GREEN" ? "BULL_STRONG" : "BEAR_STRONG")
        : (color === "GREEN" ? "SMALL_BULL" : "SMALL_BEAR");
      return {
        id: 0, x: left, width: right - left + 1, top, bottom, bodyTop, bodyBottom,
        closeY: color === "RED" ? bodyBottom : bodyTop, color, body, upper, lower,
        upperRatio: upper / body, lowerRatio: lower / body, shape, timestamp: Date.now(),
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

  const [signal, setSignal] = useState<Signal>("WAIT");
  const [status, setStatus] = useState("TRADER_YODHA_X_AI OTC Engine Ready. Connect Quotex / ExpertOption OTC screen.");
  const [ocrText, setOcrText] = useState("Searching...");
  const [round, setRound] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [reversed, setReversed] = useState(false);

  const [snrLevels, setSnrLevels] = useState<SNRLevel[]>([]);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageMetrics, setImageMetrics] = useState<ImageMetrics | null>(null);
  const [extractedRulesList, setExtractedRulesList] = useState<ExtractedRule[]>([]);
  const [analysis, setAnalysis] = useState<{
    candles: Candle[]; price: number; confidence: number; sequence: string[];
    indicators: Indicators; structure: Structure | null; patterns: PatternFlags;
    reversed: boolean; reasons: string[];
    scoreBreakdown: ScoreContribution[];
    callTotal: number; putTotal: number;
  } | null>(null);
  const [stats, setStats] = useState({
    candles: 0, memories: 0, trades: 0, zigzag: 0, structure: 0, winRate: 0, autoPatterns: 0, extractedRules: 0,
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
  const snrLevelsRef = useRef<SNRLevel[]>([]);
  const lastSignalMinute = useRef(-1);

  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const lastMatchedRule = useRef<ExtractedRule | null>(null);
  const participatingRules = useRef<ParticipatingRule[]>([]);
  const brain = useRef<Brain>({
    memories: [], trades: [], zigzag: [], structure: [], autoPatterns: [], extractedRules: [...SEED_RULES], winRate: 0,
  });

  const updateStats = useCallback(() => {
    setStats({
      candles: candles.current.length,
      memories: brain.current.memories.length,
      trades: brain.current.trades.length,
      zigzag: zigzagRef.current.length,
      structure: brain.current.structure.length,
      winRate: brain.current.winRate,
      autoPatterns: brain.current.autoPatterns.length,
      extractedRules: brain.current.extractedRules.length,
    });
  }, []);

  const openDb = useCallback(() => new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }), []);

  const saveBrain = useCallback(async () => {
    try {
      const db = await openDb();
      db.transaction(STORE, "readwrite").objectStore(STORE).put(brain.current, KEY);
      updateStats();
    } catch (error) { console.error("[TRADER_YODHA_X_AI] IndexedDB save failed", error); }
  }, [openDb, updateStats]);

  useEffect(() => {
    void openDb().then((db) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      request.onsuccess = () => {
        if (!request.result) return;
        brain.current = {
          ...brain.current, ...request.result,
          memories: request.result.memories ?? [],
          trades: request.result.trades ?? [],
          zigzag: request.result.zigzag ?? [],
          structure: request.result.structure ?? [],
          autoPatterns: request.result.autoPatterns ?? [],
          extractedRules: request.result.extractedRules ?? [...SEED_RULES],
        };
        updateStats();
        setExtractedRulesList(brain.current.extractedRules);
        setStatus(`TRADER_YODHA_X_AI memory loaded: ${brain.current.trades.length} trades, ${brain.current.autoPatterns.length} auto-patterns.`);
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
    return {
      x: Math.max(0, Math.floor(roi.x * sx)), y: Math.max(0, Math.floor(roi.y * sy)),
      width: Math.max(1, Math.floor(roi.width * sx)), height: Math.max(1, Math.floor(roi.height * sy)),
    };
  }, [roi]);

  const handlePatternImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("Pattern intake needs a chart screenshot or exported image page.");
      return;
    }

    setImageUploading(true);
    setStatus(`Reading ${file.name} and measuring candle bodies, wicks, color flow, and level behavior...`);
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.decoding = "async";
      image.src = objectUrl;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("The pattern image could not be read."));
      });

      const canvas = imageCanvasRef.current;
      if (!canvas) throw new Error("Pattern intake canvas is unavailable.");
      const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.floor(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.floor(image.naturalHeight * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Pattern image pixels could not be read.");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const metrics = extractImageMetrics(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
      setImageMetrics(metrics);

      if (metrics.candleCount < 3) {
        setStatus("The image did not contain at least three readable green/red candles. Try a tighter chart crop.");
        return;
      }

      const extractedRule: ExtractedRule = {
        id: `image-${Date.now()}`,
        name: `Imported chart: ${metrics.colorFlow}`,
        bodyPct: Math.round(metrics.avgBodyPct),
        upperWickPct: Math.round(metrics.avgUpperWickPct),
        lowerWickPct: Math.round(metrics.avgLowerWickPct),
        colorFlow: metrics.colorFlow,
        levelBehavior: metrics.levelBehavior as ExtractedRule["levelBehavior"],
        direction: metrics.colorFlow.endsWith("GREEN") ? "CALL" : "PUT",
        trustWeight: 80,
        occurrences: 0,
        wins: 0,
        losses: 0,
        source: "IMAGE",
        createdAt: Date.now(),
      };

      brain.current.extractedRules = [
        ...brain.current.extractedRules.filter((rule) => rule.id !== extractedRule.id),
        extractedRule,
      ].slice(-40);
      setExtractedRulesList([...brain.current.extractedRules]);
      await saveBrain();
      setStatus(`Pattern imported: ${metrics.colorFlow} | body ${metrics.avgBodyPct.toFixed(0)}% | upper wick ${metrics.avgUpperWickPct.toFixed(0)}% | lower wick ${metrics.avgLowerWickPct.toFixed(0)}% | ${metrics.levelBehavior}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Pattern image intake failed.");
    } finally {
      URL.revokeObjectURL(objectUrl);
      setImageUploading(false);
    }
  };

  // Pattern learning — updates memory AND auto pattern matrix
  const learn = useCallback(() => {
    if (candles.current.length <= 5) return;
    const group = candles.current.slice(-6);
    const previous = group.slice(0, 5);
    const next = group[5];
    const key = previous.map(token).join(">");
    let memory = brain.current.memories.find((item) => item.key === key);
    if (!memory) {
      memory = { key, description: previous.map(token).join(" → "), green: 0, red: 0, neutral: 0, wins: 0, losses: 0, confidence: 0, occurrences: 0, lossStreak: 0, reverse: false };
      brain.current.memories.push(memory);
    }
    memory.occurrences++;
    if (next.color === "GREEN") memory.green++;
    else if (next.color === "RED") memory.red++;
    else memory.neutral++;
    memory.confidence = (Math.max(memory.green, memory.red) / (memory.green + memory.red + memory.neutral)) * 100;

    // Auto pattern generator — learns micro-sequences of 2-4 candles
    autoLearn(candles.current, brain.current);
  }, []);

  const readPrice = useCallback(async (context: CanvasRenderingContext2D): Promise<number | null> => {
    const worker = workerRef.current; const target = ocrCanvasRef.current;
    if (!worker || !target || Date.now() - lastOcr.current < 1500) return prices.current.at(-1) ?? null;
    const box = scaledRoi(); target.width = box.width; target.height = box.height;
    const targetContext = target.getContext("2d"); if (!targetContext) return null;
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
    } catch { /* keep last price */ }
    return prices.current.at(-1) ?? null;
  }, [scaledRoi]);

  // Paint overlay: candles, IDs, ZigZag lines, HH/HL/LH/LL labels, and horizontal S/R lines
  const paint = useCallback((found: Candle[], zigzag: ZigZagPoint[], snr: SNRLevel[]) => {
    const canvas = overlayRef.current; const video = videoRef.current;
    if (!canvas || !video) return;
    canvas.width = video.videoWidth || canvas.clientWidth;
    canvas.height = video.videoHeight || canvas.clientHeight;
    const context = canvas.getContext("2d"); if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const box = scaledRoi();
    context.save();
    context.translate(box.x, box.y);

    // Draw auto-detected S/R levels (behind candles)
    snr.forEach((level) => {
      const isRes = level.type === "RESISTANCE";
      const color = isRes ? (level.isMajor ? "#f87171" : "#fb923c") : (level.isMajor ? "#4ade80" : "#86efac");
      const lineW = level.isMajor ? 2.5 : 1.2;
      const dashPattern = level.isRound ? [3, 3] : level.isMajor ? [10, 4] : [5, 5];

      context.strokeStyle = color;
      context.lineWidth = lineW;
      context.setLineDash(dashPattern);
      context.beginPath();
      context.moveTo(0, level.y);
      context.lineTo(box.width, level.y);
      context.stroke();
      context.setLineDash([]);

      // Label with touch count, strength bar, and break/bounce indicator
      context.fillStyle = color;
      context.font = level.isMajor ? "bold 10px monospace" : "bold 8px monospace";
      const behaviorTag = level.behavior === "BREAK" ? " [BREAK]" : level.behavior === "BOUNCE" ? " [BOUNCE]" : "";
      const tag = level.isRound
        ? `${isRes ? "R" : "S"} ${level.price?.toFixed(5) ?? "?"} (${level.touches}x)${behaviorTag}`
        : `${isRes ? "R" : "S"} (${level.touches}x)${behaviorTag}`;
      context.fillText(tag, 4, level.y - 3);

      // Strength indicator bar (right side)
      const barWidth = Math.max(8, (level.strength / 100) * 40);
      context.fillStyle = level.isMajor ? color : `${color}80`;
      context.fillRect(box.width - barWidth - 2, level.y - 2, barWidth, 3);
    });

    // Draw candle outlines and IDs
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

    context.restore();
  }, [scaledRoi]);

  // Analyze a single frame: detect candles, ZigZag, SNR levels, learn, paint
  const analyzeFrame = useCallback(async () => {
    if (busy.current || !videoRef.current || !canvasRef.current) return;
    busy.current = true;
    try {
      const video = videoRef.current; const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 800; canvas.height = video.videoHeight || 450;
      const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const box = scaledRoi();
      const found = detectCandles(context.getImageData(box.x, box.y, box.width, box.height).data, box.width, box.height);

      found.forEach((candle) => {
        const existing = candles.current.find((item) => Math.abs(item.x - candle.x) < 8);
        if (existing) Object.assign(existing, { ...candle, id: existing.id });
        else candles.current.push({ ...candle, id: nextId.current++ });
      });
      candles.current = candles.current.slice(-MAX_CANDLES);

      const zigzagPoints = calculateZigZag(candles.current, ZIGZAG_DEVIATION, ZIGZAG_DEPTH, ZIGZAG_BACKSTEP);
      zigzagRef.current = zigzagPoints;

      brain.current.structure = zigzagPoints.map((p) => ({ label: p.label, y: p.y, candleId: p.candleId })).slice(-30);

      // Auto horizontal S/R levels
      const levels = calculateSNRLevels(zigzagPoints, candles.current, prices.current);
      snrLevelsRef.current = levels;
      setSnrLevels(levels);

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

      void readPrice(context).then((price) => {
        if (price && zigzagPoints.length > 0) {
          const lastPivot = zigzagPoints[zigzagPoints.length - 1];
          const type = lastPivot.type;
          const existing = brain.current.zigzag.find((item) => item.type === type && Math.abs(item.price - price) < 0.0003);
          if (existing) existing.occurrences++;
          else brain.current.zigzag.push({ price, type, occurrences: 1 });
          brain.current.zigzag = brain.current.zigzag.slice(-30);
        }
      });

      paint(
        found.map((item) => candles.current.find((c) => c.x === item.x) ?? item),
        zigzagPoints,
        levels,
      );
    } finally { busy.current = false; }
  }, [learn, paint, readPrice, saveBrain, scaledRoi, updateStats]);

  const connect = async () => {
    try {
      const next = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      setStream(next); setActive(true);
      setStatus("TRADER_YODHA_X_AI connected to OTC chart. Reading live candles.");
      next.getVideoTracks()[0]?.addEventListener("ended", () => { setActive(false); setStream(null); });
    } catch { setStatus("Screen capture was cancelled. No market data was fabricated."); }
  };

  const disconnect = () => {
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null); setActive(false); setSignal("WAIT"); pending.current = null;
  };

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => void analyzeFrame(), 800);
    return () => window.clearInterval(timer);
  }, [active, analyzeFrame]);

  // ============================================
  // UNIFIED COMBINED DECISION ENGINE
  // All pattern logics, indicators, and rule engines run simultaneously.
  // Each contributes a weighted score to CALL or PUT. Signal fires only when
  // the dominant side's confidence crosses SIGNAL_THRESHOLD.
  // ============================================

  const finalizeAnalysis = useCallback(() => {
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
    const memory = recent.length === 5 ? brain.current.memories.find((item) => item.key === recent.map(token).join(">")) ?? null : null;
    const structure = zigzagPoints.at(-1)?.label ?? null;
    const snr = snrLevelsRef.current;

    // Run ALL detectors simultaneously
    const patterns: PatternFlags = {
      sequential7: detectSequential7(allCandles, brain.current),
      breakdown: detectBreakdown(allCandles, zigzagPoints),
      wickRejection: detectWickRejection(allCandles),
      confluence: detectConfluence(allCandles, zigzagPoints, price, round, brain.current),
      trap: detectTraps(allCandles, zigzagPoints),
      autoPrediction: getAutoPrediction(allCandles, brain.current),
      extractedRule: detectExtractedRules(allCandles, zigzagPoints, brain.current.extractedRules),
    };

    // Reset participating rules for this analysis cycle
    participatingRules.current = [];
    const breakdown: ScoreContribution[] = [];
    let call = 0;
    let put = 0;

    // --- 1. Auto SNR Levels — break/bounce confirmation ---
    for (const level of snr) {
      const proximity = Math.abs(level.type === "SUPPORT" ? level.y - latest.bottom : level.y - latest.top);
      if (proximity > CONFLUENCE_PROXIMITY_PX * 2) continue;

      // Bounce at support → CALL signal; Bounce at resistance → PUT signal
      if (level.behavior === "BOUNCE") {
        const w = level.isMajor ? 5 : 3;
        const touchBonus = Math.min(level.touches - 1, 2);
        const totalW = w + touchBonus;
        if (level.type === "SUPPORT") {
          call += totalW;
          breakdown.push({ logic: level.isMajor ? "Major Support Bounce" : "Support Bounce", direction: "CALL", weight: totalW, detail: `${level.isRound ? level.price?.toFixed(5) : `y:${level.y}`} (${level.touches}x)` });
        } else {
          put += totalW;
          breakdown.push({ logic: level.isMajor ? "Major Resistance Bounce" : "Resistance Bounce", direction: "PUT", weight: totalW, detail: `${level.isRound ? level.price?.toFixed(5) : `y:${level.y}`} (${level.touches}x)` });
        }
      }
      // Break of resistance → CALL (continuation); Break of support → PUT (continuation)
      else if (level.behavior === "BREAK") {
        const w = level.isMajor ? 4 : 2;
        if (level.type === "RESISTANCE") {
          call += w;
          breakdown.push({ logic: level.isMajor ? "Major Resistance Break" : "Resistance Break", direction: "CALL", weight: w, detail: `${level.isRound ? level.price?.toFixed(5) : `y:${level.y}`} (${level.touches}x)` });
        } else {
          put += w;
          breakdown.push({ logic: level.isMajor ? "Major Support Break" : "Support Break", direction: "PUT", weight: w, detail: `${level.isRound ? level.price?.toFixed(5) : `y:${level.y}`} (${level.touches}x)` });
        }
      }
      // Near a level but no confirmed break/bounce — proximity confluence (lighter weight)
      else if (proximity < CONFLUENCE_PROXIMITY_PX) {
        const w = level.isMajor ? 2 : 1;
        if (level.type === "SUPPORT") {
          call += w;
          breakdown.push({ logic: level.isMajor ? "Major Support Proximity" : "Support Proximity", direction: "CALL", weight: w, detail: `${level.isRound ? level.price?.toFixed(5) : `y:${level.y}`} (${level.touches}x)` });
        } else {
          put += w;
          breakdown.push({ logic: level.isMajor ? "Major Resistance Proximity" : "Resistance Proximity", direction: "PUT", weight: w, detail: `${level.isRound ? level.price?.toFixed(5) : `y:${level.y}`} (${level.touches}x)` });
        }
      }
    }

    // --- 2. Latest candle wick rejection ---
    if (latest.lowerRatio > WICK_REJECTION_RATIO) {
      const w = 2;
      call += w;
      breakdown.push({ logic: "Lower Wick Rejection", direction: "CALL", weight: w, detail: `ratio ${latest.lowerRatio.toFixed(1)}` });
    }
    if (latest.upperRatio > WICK_REJECTION_RATIO) {
      const w = 2;
      put += w;
      breakdown.push({ logic: "Upper Wick Rejection", direction: "PUT", weight: w, detail: `ratio ${latest.upperRatio.toFixed(1)}` });
    }

    // --- 3. RSI14 ---
    if (technical.rsi14 != null) {
      if (technical.rsi14 < 35) {
        const w = 2;
        call += w;
        breakdown.push({ logic: "RSI14 Oversold", direction: "CALL", weight: w, detail: technical.rsi14.toFixed(1) });
      }
      if (technical.rsi14 > 65) {
        const w = 2;
        put += w;
        breakdown.push({ logic: "RSI14 Overbought", direction: "PUT", weight: w, detail: technical.rsi14.toFixed(1) });
      }
    }

    // --- 4. Market Structure (HH/HL/LH/LL) ---
    if (structure === "HH" || structure === "HL") {
      const w = 1;
      call += w;
      breakdown.push({ logic: "Market Structure", direction: "CALL", weight: w, detail: structure });
    }
    if (structure === "LH" || structure === "LL") {
      const w = 1;
      put += w;
      breakdown.push({ logic: "Market Structure", direction: "PUT", weight: w, detail: structure });
    }

    // --- 5. 7-Candle Sequential Pattern ---
    if (patterns.sequential7.detected && patterns.sequential7.prediction !== "WAIT") {
      const w = 3;
      if (patterns.sequential7.prediction === "CALL") { call += w; breakdown.push({ logic: "7-Candle Sequential", direction: "CALL", weight: w, detail: `${patterns.sequential7.confidence.toFixed(0)}%` }); }
      else { put += w; breakdown.push({ logic: "7-Candle Sequential", direction: "PUT", weight: w, detail: `${patterns.sequential7.confidence.toFixed(0)}%` }); }
    }

    // --- 6. 2-Red Breakdown ---
    if (patterns.breakdown.detected) {
      const w = 3;
      put += w;
      breakdown.push({ logic: "2-Red Breakdown", direction: "PUT", weight: w, detail: patterns.breakdown.level });
    }

    // --- 7. 3-Wick Rejection ---
    if (patterns.wickRejection.detected) {
      const w = 3;
      if (patterns.wickRejection.direction === "CALL") { call += w; breakdown.push({ logic: "3-Wick Rejection", direction: "CALL", weight: w, detail: `${patterns.wickRejection.count}x lower` }); }
      else { put += w; breakdown.push({ logic: "3-Wick Rejection", direction: "PUT", weight: w, detail: `${patterns.wickRejection.count}x upper` }); }
    }

    // --- 8. Confluence ---
    if (patterns.confluence.score >= 2) {
      const nearLow = zigzagPoints.some((p) => p.type === "LOW" && Math.abs(p.y - latest.bottom) < CONFLUENCE_PROXIMITY_PX);
      const nearHigh = zigzagPoints.some((p) => p.type === "HIGH" && Math.abs(p.y - latest.top) < CONFLUENCE_PROXIMITY_PX);
      const w = patterns.confluence.score;
      if (nearLow) { call += w; breakdown.push({ logic: "Confluence", direction: "CALL", weight: w, detail: patterns.confluence.points.join(" + ") }); }
      else if (nearHigh) { put += w; breakdown.push({ logic: "Confluence", direction: "PUT", weight: w, detail: patterns.confluence.points.join(" + ") }); }
    }

    // --- 9. Trap Detection ---
    if (patterns.trap.detected) {
      const w = 4;
      if (patterns.trap.direction === "CALL") { call += w; breakdown.push({ logic: "Trap Detection", direction: "CALL", weight: w, detail: patterns.trap.type }); }
      else { put += w; breakdown.push({ logic: "Trap Detection", direction: "PUT", weight: w, detail: patterns.trap.type }); }
    }

    // --- 10. Micro-Sequence Auto Pattern Learner ---
    if (patterns.autoPrediction.prediction !== "WAIT") {
      const w = 2;
      if (patterns.autoPrediction.prediction === "CALL") {
        call += w;
        breakdown.push({ logic: "Micro-Sequence", direction: "CALL", weight: w, detail: `${patterns.autoPrediction.matched} ${patterns.autoPrediction.confidence.toFixed(0)}%` });
      } else {
        put += w;
        breakdown.push({ logic: "Micro-Sequence", direction: "PUT", weight: w, detail: `${patterns.autoPrediction.matched} ${patterns.autoPrediction.confidence.toFixed(0)}%` });
      }
      // Track participating auto patterns for outcome learning
      for (let len = AUTO_PATTERN_MIN_LENGTH; len <= AUTO_PATTERN_MAX_LENGTH; len++) {
        if (allCandles.length < len) continue;
        const autoKey = allCandles.slice(-len).map(microToken).join(">");
        participatingRules.current.push({ type: "AUTO_PATTERN", id: autoKey, direction: patterns.autoPrediction.prediction as "CALL" | "PUT" });
      }
    }

    // --- 11. Image Extracted Rules (trust-weighted) ---
    if (patterns.extractedRule.detected) {
      const matchedRule = brain.current.extractedRules.find((r) => r.name === patterns.extractedRule.rule);
      if (matchedRule) {
        lastMatchedRule.current = matchedRule;
        // Weight scales with the rule's dynamic trust weight (40-95)
        const w = Math.round((patterns.extractedRule.confidence / 100) * (matchedRule.trustWeight / 100) * 5);
        if (patterns.extractedRule.direction === "CALL") { call += w; breakdown.push({ logic: "Image Rule", direction: "CALL", weight: w, detail: `${matchedRule.name} (${matchedRule.trustWeight}% trust)` }); }
        else { put += w; breakdown.push({ logic: "Image Rule", direction: "PUT", weight: w, detail: `${matchedRule.name} (${matchedRule.trustWeight}% trust)` }); }
        participatingRules.current.push({ type: "EXTRACTED_RULE", id: matchedRule.id, direction: patterns.extractedRule.direction });
      }
    }

    // --- 12. Human-Brain Memory Pattern ---
    if (memory) {
      if (memory.green > memory.red) {
        const w = 1;
        call += w;
        breakdown.push({ logic: "Memory Pattern", direction: "CALL", weight: w, detail: `${memory.confidence.toFixed(1)}% (${memory.occurrences}x)` });
      }
      if (memory.red > memory.green) {
        const w = 1;
        put += w;
        breakdown.push({ logic: "Memory Pattern", direction: "PUT", weight: w, detail: `${memory.confidence.toFixed(1)}% (${memory.occurrences}x)` });
      }
      participatingRules.current.push({ type: "MEMORY", id: memory.key, direction: memory.green > memory.red ? "CALL" : "PUT" });
    }

    // --- Combined Decision ---
    const total = call + put;
    const dominantScore = Math.max(call, put);
    const combinedConfidence = total > 0 ? (dominantScore / total) * 100 : 0;
    let nextSignal: Signal = total < MIN_TOTAL_EVIDENCE || combinedConfidence < SIGNAL_THRESHOLD ? "WAIT" : call > put ? "CALL" : "PUT";
    let signalReversed = false;

    // REVERSE TRADING LOGIC — flips signal when the matched memory has a loss streak
    if (memory && (memory.lossStreak >= REVERSE_LOSS_STREAK || memory.reverse) && nextSignal !== "WAIT") {
      nextSignal = nextSignal === "CALL" ? "PUT" : "CALL";
      signalReversed = true;
      breakdown.push({ logic: "REVERSE LOGIC", direction: nextSignal as "CALL" | "PUT", weight: 0, detail: `Loss streak ${memory.lossStreak} — signal flipped` });
    }

    // Sort breakdown by weight descending for UI display
    breakdown.sort((a, b) => b.weight - a.weight);

    setAnalysis({ candles: recent, price, confidence: combinedConfidence, sequence: recent.map(token), indicators: technical, structure, patterns, reversed: signalReversed, reasons: breakdown.map((b) => `${b.logic} ${b.direction === "CALL" ? "+" : "-"}${b.weight}`), scoreBreakdown: breakdown, callTotal: call, putTotal: put });
    setReversed(signalReversed);
    pending.current = nextSignal === "WAIT" ? null : nextSignal;

    const trapText = patterns.trap.detected ? ` | TRAP: ${patterns.trap.type}` : "";
    const reverseText = signalReversed ? " | REVERSED" : "";
    const autoText = patterns.autoPrediction.prediction !== "WAIT" ? ` | AUTO: ${patterns.autoPrediction.prediction}` : "";
    const ruleText = patterns.extractedRule.detected ? ` | IMG-RULE: ${patterns.extractedRule.rule}` : "";
    setStatus(`Real-time analysis: ${nextSignal} | ${combinedConfidence.toFixed(1)}% combined confidence (CALL ${call} vs PUT ${put}) | price ${price.toFixed(5)}${trapText}${autoText}${ruleText}${reverseText}`);
  }, [round]);

  // ============================================
  // CONTINUOUS REAL-TIME ANALYSIS LOOP
  // Runs automatically whenever the screen is connected — no button or timer trigger needed.
  // Each tick captures a frame, detects candles, auto-detects S/R levels, learns patterns,
  // and runs the full decision engine. The 00s–05s entry window still fires the pending signal.
  // ============================================
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      if (cancelled || busy.current) return;
      await analyzeFrame();
      finalizeAnalysis();
    }, ANALYSIS_INTERVAL_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, analyzeFrame, finalizeAnalysis]);

  // ============================================
  // STRICT 00s–05s ENTRY TIMING
  // ============================================
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = new Date();
      const seconds = now.getSeconds();
      const ms = now.getMilliseconds();
      setCountdown(Math.ceil(60 - seconds - ms / 1000));

      if (seconds >= 0 && seconds <= 5 && pending.current && lastSignalMinute.current !== now.getMinutes()) {
        lastSignalMinute.current = now.getMinutes();
        setSignal(pending.current);
        setStatus(`TRADER_YODHA_X_AI signal active: ${pending.current} — entered at 0${seconds}s of new candle.`);
        pending.current = null;
      }
    }, 200);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  // Log trade outcome — updates ALL participating rules simultaneously
  const logOutcome = (result: Outcome) => {
    if (!analysis || signal === "WAIT") return;

    // Update every participating rule from the unified decision
    for (const participant of participatingRules.current) {
      if (participant.type === "MEMORY") {
        const memory = brain.current.memories.find((m) => m.key === participant.id);
        if (memory) {
          if (result === "WIN") { memory.wins++; memory.lossStreak = 0; memory.reverse = false; }
          else { memory.losses++; memory.lossStreak++; if (memory.lossStreak >= REVERSE_LOSS_STREAK) memory.reverse = true; }
        }
      } else if (participant.type === "AUTO_PATTERN") {
        const ap = brain.current.autoPatterns.find((p) => p.key === participant.id);
        if (ap) { if (result === "WIN") ap.wins++; else ap.losses++; }
      } else if (participant.type === "EXTRACTED_RULE") {
        const rule = brain.current.extractedRules.find((r) => r.id === participant.id);
        if (rule) {
          rule.occurrences++;
          if (result === "WIN") { rule.wins++; rule.trustWeight = Math.min(rule.trustWeight + 2, 95); }
          else { rule.losses++; rule.trustWeight = Math.max(rule.trustWeight - 5, 40); }
          // Generate a variant from the live candle shape
          const variant = generateVariant(rule, analysis.candles, result);
          if (variant) {
            brain.current.extractedRules = [...brain.current.extractedRules, variant].slice(-40);
            setExtractedRulesList([...brain.current.extractedRules]);
          }
        }
      }
    }

    // If no memory was a participant, still update by sequence key for backward compat
    if (!participatingRules.current.some((p) => p.type === "MEMORY")) {
      const key = analysis.sequence.join(">");
      const memory = brain.current.memories.find((m) => m.key === key);
      if (memory) {
        if (result === "WIN") { memory.wins++; memory.lossStreak = 0; memory.reverse = false; }
        else { memory.losses++; memory.lossStreak++; if (memory.lossStreak >= REVERSE_LOSS_STREAK) memory.reverse = true; }
      }
    }

    // Clear participants for next cycle
    participatingRules.current = [];
    lastMatchedRule.current = null;

    brain.current.trades.push({ pattern: analysis.sequence.join(" → "), result, price: analysis.price });
    brain.current.winRate = (brain.current.trades.filter((t) => t.result === "WIN").length / brain.current.trades.length) * 100;
    void saveBrain();
    setSignal("WAIT"); setReversed(false);
    setStatus(`Outcome logged [${result}]. ALL participating rules updated simultaneously — memory, auto-patterns & image rules trust weights adjusted.`);
  };

  // ROI handlers
  const mouseDown = (event: MouseEvent) => {
    if (locked || !containerRef.current) return;
    event.stopPropagation();
    const box = containerRef.current.getBoundingClientRect();
    setMoving(true); setDrag({ x: event.clientX - box.left - roi.x, y: event.clientY - box.top - roi.y });
  };
  const resizeDown = (event: MouseEvent) => {
    if (locked) return; event.stopPropagation();
    setResizing(true); setDrag({ x: event.clientX, y: event.clientY });
  };
  const mouseMove = (event: MouseEvent) => {
    if (locked || !containerRef.current || (!moving && !resizing)) return;
    const box = containerRef.current.getBoundingClientRect();
    if (moving) {
      setRoi((old) => ({ ...old, x: Math.max(0, Math.min(box.width - old.width, event.clientX - box.left - drag.x)), y: Math.max(0, Math.min(box.height - old.height, event.clientY - box.top - drag.y)) }));
    } else {
      const dx = event.clientX - drag.x; const dy = event.clientY - drag.y;
      setDrag({ x: event.clientX, y: event.clientY });
      setRoi((old) => ({ ...old, width: Math.max(180, Math.min(box.width - old.x, old.width + dx)), height: Math.max(120, Math.min(box.height - old.y, old.height + dy)) }));
    }
  };

  const latest = analysis?.candles.at(-1);
  const entryWindow = countdown <= 5 || countdown >= 55;

  return (
    <div className="min-h-screen bg-[#040814] text-slate-100 font-sans" onMouseMove={mouseMove} onMouseUp={() => { setMoving(false); setResizing(false); }}>
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-cyan-400 tracking-wider">TRADER YODHA X AI</h1>
            <p className="text-slate-500 text-sm">OTC Market Engine — Real-Time Continuous Scan + Auto S/R + Pattern Generator + Reverse Logic</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right mr-2">
              <div className="text-xs text-slate-500">AI Brain</div>
              <div className="text-sm font-mono text-emerald-400">{stats.candles} Candles | {stats.memories} Patterns</div>
              <div className="text-xs font-mono text-slate-400">{stats.trades} Trades | WR: {stats.winRate.toFixed(1)}% | {stats.autoPatterns} Auto</div>
            </div>
            {!active ? (
              <button onClick={() => void connect()} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg">Connect OTC Screen</button>
            ) : (
              <button onClick={disconnect} className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg">Disconnect</button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT COLUMN */}
          <div className="space-y-4">
            {/* LIVE SCAN STATUS — automatic real-time indicator */}
            <div className={card}>
              <div className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 ${active ? "bg-cyan-900/40 border border-cyan-700 text-cyan-300" : "bg-slate-800 text-slate-600"}`}>
                {active && <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />}
                {active ? "Live Real-Time Scanning..." : "Scanner Idle — Connect to Start"}
              </div>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-slate-500">Next Candle Entry:</span>
                <span className={`font-mono text-xl ${entryWindow ? "text-emerald-400 font-bold animate-pulse" : "text-amber-400"}`}>
                  {countdown}s {entryWindow && "— ENTRY WINDOW"}
                </span>
              </div>
              {active && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  <span className="text-xs text-cyan-400 font-mono">Auto-analyzing every {ANALYSIS_INTERVAL_MS}ms — candles, S/R levels, patterns & signal engine</span>
                </div>
              )}
            </div>

            {/* OCR TELEMETRY */}
            <div className={card}>
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wider font-mono">OCR Telemetry</h3>
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-500">Price:</span>
                <span className={round ? "text-emerald-400 font-bold" : "text-cyan-400 font-bold"}>{ocrText}</span>
              </div>
              <div className="flex justify-between text-xs font-mono mt-2">
                <span className="text-slate-500">Data source:</span><span>Live OTC screen</span>
              </div>
            </div>

            {/* CANDLE BRAIN */}
            <div className={card}>
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wider font-mono">Candle Brain</h3>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                {[
                  ["Candles", stats.candles, "text-cyan-400"],
                  ["Patterns", stats.memories, "text-amber-400"],
                  ["ZigZag Points", stats.zigzag, "text-yellow-400"],
                  ["HH/HL/LH/LL", stats.structure, "text-sky-400"],
                  ["Auto Patterns", stats.autoPatterns, "text-fuchsia-400"],
                  ["Image Rules", stats.extractedRules, "text-cyan-300"],
                  ["S/R Levels", snrLevels.length, "text-rose-400"],
                ].map(([label, value, color]) => (
                  <div key={String(label)} className="bg-[#020617] p-3 rounded">
                    <div className="text-slate-500">{label}</div>
                    <div className={`${color} text-lg font-bold`}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* IMAGE PATTERN INTAKE — upload chart screenshots to extract visual rules */}
            <div className={card}>
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wider font-mono flex items-center gap-2">
                <ImageIcon className="w-3 h-3 text-cyan-300" />
                Image Pattern Intake
              </h3>
              <label className={`w-full py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 cursor-pointer ${imageUploading ? "bg-slate-700 text-slate-500" : "bg-cyan-900/60 hover:bg-cyan-800/60 text-cyan-300 border border-cyan-700"}`}>
                {imageUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                {imageUploading ? "Analyzing image..." : "Upload Chart Screenshot"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => void handlePatternImage(e)} disabled={imageUploading} />
              </label>
              {imageMetrics && imageMetrics.candleCount > 0 && (
                <div className="mt-3 space-y-1 text-xs font-mono">
                  <div className="flex justify-between"><span className="text-slate-500">Candles found:</span><span className="text-cyan-300">{imageMetrics.candleCount}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Avg Body:</span><span className="text-emerald-400">{imageMetrics.avgBodyPct.toFixed(0)}%</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Avg Upper Wick:</span><span className="text-amber-400">{imageMetrics.avgUpperWickPct.toFixed(0)}%</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Avg Lower Wick:</span><span className="text-amber-400">{imageMetrics.avgLowerWickPct.toFixed(0)}%</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Color Flow:</span><span className="text-cyan-300 break-all">{imageMetrics.colorFlow}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Level Behavior:</span><span className="text-orange-400">{imageMetrics.levelBehavior}</span></div>
                </div>
              )}
              {extractedRulesList.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs text-slate-500 mb-1.5 font-mono">Stored Rules ({extractedRulesList.length}):</div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {extractedRulesList.slice(-8).reverse().map((rule) => (
                      <div key={rule.id} className="flex items-center justify-between px-2 py-1.5 rounded bg-[#020617] text-xs font-mono">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${rule.direction === "CALL" ? "bg-emerald-400" : "bg-red-400"}`} />
                          <span className="text-slate-300 truncate">{rule.name}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-slate-500">{rule.source === "IMAGE" ? "IMG" : "VAR"}</span>
                          <span className="text-cyan-400">{rule.trustWeight}%</span>
                          <span className="text-slate-600">{rule.wins}W/{rule.losses}L</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* AUTO S/R LEVELS — fully automatic detection */}
            {active && snrLevels.length > 0 && (
              <div className={card}>
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wider font-mono flex items-center gap-2">
                  <Layers className="w-3 h-3 text-rose-400" />
                  Auto S/R Levels
                </h3>
                <div className="space-y-1.5 text-xs font-mono max-h-56 overflow-y-auto">
                  {snrLevels.map((level, i) => (
                    <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded bg-[#020617]">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${level.type === "RESISTANCE" ? (level.isMajor ? "bg-red-400" : "bg-orange-400") : (level.isMajor ? "bg-emerald-400" : "bg-lime-400")}`} />
                        <span className={`truncate ${level.type === "RESISTANCE" ? (level.isMajor ? "text-red-400 font-bold" : "text-orange-400") : (level.isMajor ? "text-emerald-400 font-bold" : "text-lime-400")}`}>
                          {level.isMajor ? "Major " : ""}{level.type === "RESISTANCE" ? "R" : "S"}
                          {level.isRound && " Round"}
                        </span>
                        {level.behavior !== "NONE" && (
                          <span className={`px-1 rounded text-[9px] flex-shrink-0 ${level.behavior === "BREAK" ? "bg-red-900/60 text-red-300" : "bg-emerald-900/60 text-emerald-300"}`}>
                            {level.behavior}
                          </span>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-slate-300">{level.price ? level.price.toFixed(5) : `y:${level.y}`}</span>
                        <span className="text-slate-500 ml-1.5">({level.touches}x)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PATTERN DETECTION */}
            {analysis && (
              <div className={card}>
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wider font-mono">OTC Pattern Detection</h3>
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    {analysis.patterns.sequential7.detected ? (
                      <TrendingUp className={`w-4 h-4 ${analysis.patterns.sequential7.prediction === "CALL" ? "text-emerald-400" : "text-red-400"}`} />
                    ) : <span className="w-4 h-4 inline-block" />}
                    <span className="text-slate-400">7-Candle Sequential:</span>
                    <span className={analysis.patterns.sequential7.detected ? (analysis.patterns.sequential7.prediction === "CALL" ? "text-emerald-400 font-bold" : analysis.patterns.sequential7.prediction === "PUT" ? "text-red-400 font-bold" : "text-slate-400") : "text-slate-600"}>
                      {analysis.patterns.sequential7.detected ? `${analysis.patterns.sequential7.prediction} (${analysis.patterns.sequential7.confidence.toFixed(0)}%)` : "Not triggered"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`w-4 h-4 inline-block rounded-full ${analysis.patterns.breakdown.detected ? "bg-red-500" : "bg-slate-700"}`} />
                    <span className="text-slate-400">2-Red Breakdown:</span>
                    <span className={analysis.patterns.breakdown.detected ? "text-red-400 font-bold" : "text-slate-600"}>
                      {analysis.patterns.breakdown.detected ? analysis.patterns.breakdown.level : "None"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {analysis.patterns.wickRejection.detected ? (
                      <TrendingDown className={`w-4 h-4 ${analysis.patterns.wickRejection.direction === "PUT" ? "text-red-400" : "text-emerald-400"}`} />
                    ) : <span className="w-4 h-4 inline-block" />}
                    <span className="text-slate-400">3-Wick Rejection:</span>
                    <span className={analysis.patterns.wickRejection.detected ? (analysis.patterns.wickRejection.direction === "CALL" ? "text-emerald-400 font-bold" : "text-red-400 font-bold") : "text-slate-600"}>
                      {analysis.patterns.wickRejection.detected ? `${analysis.patterns.wickRejection.direction} (${analysis.patterns.wickRejection.count}x)` : "None"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Zap className={`w-4 h-4 ${analysis.patterns.confluence.score >= 2 ? "text-yellow-400" : "text-slate-600"}`} />
                    <span className="text-slate-400">Confluence:</span>
                    <span className={analysis.patterns.confluence.score >= 2 ? "text-yellow-400 font-bold" : "text-slate-600"}>
                      {analysis.patterns.confluence.score >= 2 ? `${analysis.patterns.confluence.score}x — ${analysis.patterns.confluence.points.join(" + ")}` : `${analysis.patterns.confluence.score}x`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {analysis.patterns.trap.detected ? <AlertTriangle className="w-4 h-4 text-orange-400 animate-pulse" /> : <Shield className="w-4 h-4 text-slate-600" />}
                    <span className="text-slate-400">Trap Detection:</span>
                    <span className={analysis.patterns.trap.detected ? "text-orange-400 font-bold" : "text-slate-600"}>
                      {analysis.patterns.trap.detected ? `${analysis.patterns.trap.type} → ${analysis.patterns.trap.direction}` : "No trap"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Activity className={`w-4 h-4 ${analysis.patterns.autoPrediction.prediction !== "WAIT" ? "text-fuchsia-400" : "text-slate-600"}`} />
                    <span className="text-slate-400">Auto Pattern:</span>
                    <span className={analysis.patterns.autoPrediction.prediction !== "WAIT" ? (analysis.patterns.autoPrediction.prediction === "CALL" ? "text-emerald-400 font-bold" : "text-red-400 font-bold") : "text-slate-600"}>
                      {analysis.patterns.autoPrediction.prediction !== "WAIT" ? `${analysis.patterns.autoPrediction.prediction} (${analysis.patterns.autoPrediction.matched} ${analysis.patterns.autoPrediction.confidence.toFixed(0)}%)` : "No match"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Cpu className={`w-4 h-4 ${analysis.patterns.extractedRule.detected ? "text-cyan-300" : "text-slate-600"}`} />
                    <span className="text-slate-400">Image Rule:</span>
                    <span className={analysis.patterns.extractedRule.detected ? (analysis.patterns.extractedRule.direction === "CALL" ? "text-emerald-400 font-bold" : "text-red-400 font-bold") : "text-slate-600"}>
                      {analysis.patterns.extractedRule.detected ? `${analysis.patterns.extractedRule.rule} → ${analysis.patterns.extractedRule.direction} (${analysis.patterns.extractedRule.confidence.toFixed(0)}%)` : "No match"}
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

            {/* LIVE ANALYSIS */}
            {analysis && (
              <div className={card}>
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wider font-mono">Live Analysis</h3>
                <div className="text-xs text-slate-300 space-y-2 font-mono">
                  <div>Latest: #{latest?.id} {latest?.shape}</div>
                  <div>Price: {priceText(analysis.price)} {round ? "ROUND SNR" : ""}</div>
                  <div>Structure: {analysis.structure ?? "Awaiting pivot"}</div>
                  <div>Sequence: <span className="text-cyan-300 break-all">{analysis.sequence.join(" → ")}</span></div>
                  <div>Evidence: <span className="text-emerald-400">{analysis.confidence.toFixed(1)}%</span> <span className="text-slate-600">(CALL {analysis.callTotal} / PUT {analysis.putTotal})</span></div>
                  <div>RSI14: {analysis.indicators.rsi14 == null ? "—" : analysis.indicators.rsi14.toFixed(1)}</div>
                  <div className="text-slate-400">{analysis.reasons.join(" • ")}</div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN */}
          <div className="lg:col-span-2 space-y-4">
            <div className={card}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-400">OTC CHART + CANDLE VISION + AUTO S/R LINES</span>
                {active && <button onClick={() => setLocked((v) => !v)} className="px-3 py-1 rounded text-xs font-bold text-cyan-400 bg-cyan-900/60">{locked ? "ROI Locked" : "Drag / Resize ROI"}</button>}
              </div>
              <div ref={containerRef} className="bg-[#020617] rounded-lg aspect-video flex items-center justify-center overflow-hidden border border-slate-900 relative select-none">
                {active ? (
                  <>
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain pointer-events-none" />
                    <canvas ref={overlayRef} className="absolute inset-0 pointer-events-none w-full h-full z-10" />
                    <div onMouseDown={mouseDown} style={{ left: roi.x, top: roi.y, width: roi.width, height: roi.height }} className={`absolute border-2 ${locked ? "border-amber-400" : "border-cyan-400 cursor-move"} p-1 z-20`}>
                      <div className="text-[10px] font-mono text-cyan-300 bg-slate-950/80 px-1">AI CANDLE TARGET</div>
                      {!locked && <div onMouseDown={resizeDown} className="w-3.5 h-3.5 bg-cyan-400 absolute bottom-0 right-0 cursor-se-resize" />}
                    </div>
                  </>
                ) : (
                  <div className="text-center">
                    <p className="text-slate-500">Connect OTC chart screen to start TRADER_YODHA_X_AI.</p>
                    <p className="text-xs text-slate-600 mt-2">The AI reads visible candles and prices — optimized for Quotex / ExpertOption OTC markets.</p>
                  </div>
                )}
              </div>
              <canvas ref={canvasRef} className="hidden" />
              <canvas ref={ocrCanvasRef} className="hidden" />
              <canvas ref={imageCanvasRef} className="hidden" />
              <div className="mt-3 px-4 py-2 bg-[#020617] rounded-lg border-l-4 border-cyan-500 flex items-center gap-2">
                {active && <span className="w-3 h-3 rounded-full bg-cyan-400 animate-ping flex-shrink-0" />}
                <p className="text-xs text-slate-400"><strong className="text-cyan-400">Status:</strong> {status}</p>
              </div>
            </div>

            <div className={`${card} p-6`}>
              <div className="flex items-center justify-between mb-4">
                <span className="px-3 py-1 bg-amber-900/50 text-amber-300 text-xs font-bold rounded">TRADER YODHA X — OTC SIGNAL ENGINE</span>
                <span className="text-xs text-slate-500 font-mono flex items-center gap-1"><Activity className="w-3 h-3" />00s–05s Entry Window</span>
              </div>
              <div className="text-center py-8">
                <div className={`inline-block px-14 py-6 rounded-2xl text-6xl font-black tracking-widest border-4 ${signal === "CALL" ? "bg-emerald-500/10 border-emerald-400 text-emerald-400" : signal === "PUT" ? "bg-red-500/10 border-red-400 text-red-400" : "bg-slate-800 border-slate-700 text-slate-600"}`}>
                  {signal}
                </div>
                {reversed && signal !== "WAIT" && <div className="mt-3 text-orange-400 text-sm font-bold animate-pulse">Signal Reversed via Loss-Streak Logic</div>}
              </div>

              {/* COMBINED SCORE BREAKDOWN — shows every logic that contributed */}
              {analysis && analysis.scoreBreakdown.length > 0 && (
                <div className="border-t border-slate-800 pt-4 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">Combined Score Breakdown</span>
                    <span className="text-xs font-mono">
                      <span className="text-emerald-400">CALL {analysis.callTotal}</span>
                      <span className="text-slate-600 mx-1">vs</span>
                      <span className="text-red-400">PUT {analysis.putTotal}</span>
                    </span>
                  </div>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {analysis.scoreBreakdown.map((contrib, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-1.5 rounded bg-[#020617] text-xs font-mono">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${contrib.direction === "CALL" ? "bg-emerald-400" : "bg-red-400"}`} />
                          <span className="text-slate-300 truncate">{contrib.logic}</span>
                          <span className="text-slate-600 truncate hidden sm:inline">{contrib.detail}</span>
                        </div>
                        <span className={`flex-shrink-0 font-bold ${contrib.direction === "CALL" ? "text-emerald-400" : "text-red-400"}`}>
                          {contrib.logic === "REVERSE LOGIC" ? "FLIP" : `+${contrib.weight}`}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-center text-xs font-mono text-slate-500">
                    Combined Confidence: <span className={analysis.confidence >= SIGNAL_THRESHOLD ? "text-cyan-400 font-bold" : "text-slate-600"}>{analysis.confidence.toFixed(1)}%</span>
                    <span className="text-slate-600"> (threshold {SIGNAL_THRESHOLD}%)</span>
                  </div>
                </div>
              )}
              {signal !== "WAIT" && (
                <div className="border-t border-slate-800 pt-4">
                  <p className="text-xs text-slate-400 text-center mb-3">Log outcome to train the live OTC brain:</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => logOutcome("WIN")} className="py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-500">WIN</button>
                    <button onClick={() => logOutcome("LOSS")} className="py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-500">LOSS</button>
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
