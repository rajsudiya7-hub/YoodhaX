import React, { useState, useEffect, useRef, useCallback } from 'react';

// ============================================================
// YODDHA X FUSION ENGINE v5 â€” MARKET STRUCTURE FUSION
// Existing logic preserved + Self-Learning Pattern Discovery
// ============================================================

type CandleColor = 'GREEN' | 'RED' | 'NEUTRAL';
type Direction = 'UP' | 'DOWN' | 'NEUTRAL';
type TradeSignal = 'WAIT' | 'CALL' | 'PUT';

interface DynamicPattern {
  dnaHash: string;
  sequenceStr: string;
  winCount: number;
  lossCount: number;
  winRate: number;
  lastDetected: number;
}

interface PatternDiscovery {
  id: string;
  dnaHash: string;
  sequence: string;
  context: string;
  direction: Direction;
  occurrences: number;
  upCount: number;
  downCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  confidence: number;
  avgBodyRatio: number;
  avgTopWickRatio: number;
  avgBottomWickRatio: number;
  levelHits: number;
  breakoutRetestHits: number;
  failedCount: number;
  createdAt: number;
  lastSeen: number;
  lastOutcome?: 'WIN' | 'LOSS';
}

interface PatternObservation {
  dnaHash: string;
  sequence: string;
  direction: Direction;
  context: string;
  createdAt: number;
  priceLevel: number;
  bodyRatio: number;
  topWickRatio: number;
  bottomWickRatio: number;
  nearLevel: boolean;
  breakoutRetest: boolean;
}

interface PatternMemory {
  id: string;
  pattern: string;
  sequenceLength: number;
  priceLevel: number;
  priceRange: string;
  bodySize: number;
  topWickSize: number;
  bottomWickSize: number;
  result: 'WIN' | 'LOSS';
  timestamp: number;
  timeSync?: number;
  minuteMarker: number;
  confidence: number;
  streakCount?: number;
  dnaHash?: string;
  discoveryId?: string;
}

interface MagicNumber {
  priceLevel: number;
  priceRange: string;
  direction: 'GREEN_TO_RED' | 'RED_TO_GREEN';
  occurrences: number;
  successRate: number;
  lastSeen: number;
}

interface TimeAlgorithm {
  minuteMarker: number;
  secondMarker: number;
  direction: Direction;
  frequency: number;
  successRate: number;
  lastOccurrences: number[];
}

interface ZigZagLevel {
  price: number;
  type: 'HIGH' | 'LOW';
  occurrences: number;
  timestamp: number;
}

// Visual market-structure level built directly from candle geometry on the
// shared chart screen. Y is screen-space: smaller Y = higher market level.
interface MarketStructureLevel {
  screenY: number;
  screenX: number;
  swingType: 'HIGH' | 'LOW';
  structure: 'HH' | 'HL' | 'LH' | 'LL';
  occurrences: number;
  strength: number;
  timestamp: number;
}

interface VisualCandlePoint {
  x: number;
  color: 'GREEN' | 'RED';
  highY: number;
  lowY: number;
  bodyTop: number;
  bodyBottom: number;
}

interface TechnicalIndicatorState {
  sma5Trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  smma10Trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  keltnerBand: 'UPPER_BREAK' | 'LOWER_BREAK' | 'INSIDE';
  volumeBias: 'HIGH_GREEN' | 'HIGH_RED' | 'NORMAL';
}

interface LevelContext {
  nearestLevel: number | null;
  levelType: 'SUPPORT' | 'RESISTANCE' | 'NONE';
  distance: number;
  nearLevel: boolean;
  breakout: boolean;
  retest: boolean;
  rejection: boolean;
  confirmation: boolean;
}

interface CandleFeature {
  color: CandleColor;
  body: number;
  range: number;
  topWick: number;
  bottomWick: number;
  bodyRatio: number;
  topWickRatio: number;
  bottomWickRatio: number;
  strength: number;
}

interface LiveAnalysis {
  pattern: string;
  sequence: string[];
  dominantColor: CandleColor;
  strength: number;
  priceLevel: number;
  bodySize: number;
  topWick: number;
  bottomWick: number;
  detectedMagicNumbers: MagicNumber[];
  matchedZigZag: ZigZagLevel | null;
  indicators: TechnicalIndicatorState;
  ocrPrice: number;
  timestampSecond: number;
  currentMinute: number;
  timeSyncData: TimeAlgorithm | null;
  streakCount: number;
  streakColor: 'GREEN' | 'RED' | 'NONE';
  isTrapDetected: boolean;
  dnaHash: string;
  discoveryId: string | null;
  discoveryWinRate: number | null;
  levelContext: LevelContext;
  patternFeatures: PatternObservation;
  marketStructure: MarketStructureLevel | null;
  structureBias: Direction;
}

interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BrainState {
  patterns: PatternMemory[];
  dynamicPatterns: DynamicPattern[];
  discoveries: PatternDiscovery[];
  magicNumbers: MagicNumber[];
  timeAlgorithms: TimeAlgorithm[];
  zigzagLevels: ZigZagLevel[];
  marketStructures: MarketStructureLevel[];
  totalTrades: number;
  winRate: number;
  lastUpdated: number;
}

const DB_NAME = 'YoddhaX_AI_Database';
const DB_VERSION = 4;
const STORE_NAME = 'brain_state_store';

const MAX_CANDLES = 80;
const MIN_PATTERN_OCCURRENCES = 5;
const MAX_DISCOVERIES = 1500;
const MAX_MARKET_STRUCTURES = 300;
const MARKET_LEVEL_TOLERANCE_PX = 8;
const MIN_SWING_DISTANCE_PX = 5;

const initialBrain = (): BrainState => ({
  patterns: [],
  dynamicPatterns: [],
  discoveries: [],
  magicNumbers: [],
  timeAlgorithms: [],
  zigzagLevels: [],
  marketStructures: [],
  totalTrades: 0,
  winRate: 0,
  lastUpdated: Date.now()
});

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const safeRatio = (a: number, b: number) => (b > 0 ? a / b : 0);

const round = (value: number, decimals = 4) =>
  Number(value.toFixed(decimals));

export default function HumanAIFusionEngine() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isStreamActive, setIsStreamActive] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [aiSignal, setAiSignal] = useState<TradeSignal>('WAIT');
  const [statusMessage, setStatusMessage] = useState(
    'YoddhaX Engine Ready. Self-Learning Pattern Discovery initialized.'
  );
  const [brainStats, setBrainStats] = useState({
    patterns: 0,
    dynamicPatterns: 0,
    discoveries: 0,
    magicNumbers: 0,
    timeSyncs: 0,
    zigzag: 0,
    winRate: 0
  });
  const [currentAnalysis, setCurrentAnalysis] = useState<LiveAnalysis | null>(null);
  const [timeUntilCandle, setTimeUntilCandle] = useState(60);

  const [cropBox, setCropBox] = useState<CropRegion>({
    x: 10,
    y: 10,
    width: 80,
    height: 80
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const brainRef = useRef<BrainState>(initialBrain());
  const pendingSignalRef = useRef<{
    signal: 'CALL' | 'PUT';
    analysis: LiveAnalysis;
  } | null>(null);

  const continuousLearningRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPriceRef = useRef(0);
  const lastColorRef = useRef<CandleColor>('NEUTRAL');
  const priceHistoryRef = useRef<{ price: number; time: number }[]>([]);
  const candleFeaturesRef = useRef<CandleFeature[]>([]);
  const smmaPreviousRef = useRef<number | null>(null);
  const lastVisualStructureSignatureRef = useRef('');

  // ------------------------------------------------------------
  // Brain persistence
  // ------------------------------------------------------------

  const updateBrainStats = useCallback(() => {
    const brain = brainRef.current;
    setBrainStats({
      patterns: brain.patterns.length,
      dynamicPatterns: brain.dynamicPatterns.length,
      discoveries: brain.discoveries.length,
      magicNumbers: brain.magicNumbers.length,
      timeSyncs: brain.timeAlgorithms.length,
      zigzag: brain.zigzagLevels.length,
      marketStructure: brain.marketStructures.length,
      winRate: brain.winRate
    });
  }, []);

  const initIndexedDB = useCallback((): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available.'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = (event) =>
        resolve((event.target as IDBOpenDBRequest).result);

      request.onerror = () =>
        reject(request.error || new Error('IndexedDB open failed.'));
    });
  }, []);

  const saveBrainToDB = useCallback(async () => {
    try {
      const db = await initIndexedDB();
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      brainRef.current.lastUpdated = Date.now();
      store.put(brainRef.current, 'main_brain_state');

      transaction.oncomplete = () => {
        db.close();
      };

      updateBrainStats();
    } catch (err) {
      console.error('IndexedDB Save Failure:', err);
    }
  }, [initIndexedDB, updateBrainStats]);

  const loadBrainFromDB = useCallback(async () => {
    try {
      const db = await initIndexedDB();
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get('main_brain_state');

      request.onsuccess = () => {
        const saved = request.result as Partial<BrainState> | undefined;

        if (saved) {
          brainRef.current = {
            ...initialBrain(),
            ...saved,
            patterns: saved.patterns || [],
            dynamicPatterns: saved.dynamicPatterns || [],
            discoveries: saved.discoveries || [],
            magicNumbers: saved.magicNumbers || [],
            timeAlgorithms: saved.timeAlgorithms || [],
            zigzagLevels: saved.zigzagLevels || [],
            marketStructures: saved.marketStructures || []
          };

          updateBrainStats();

          setStatusMessage(
            `Brain Active: ${brainRef.current.discoveries.length} discovered patterns + ` +
            `${brainRef.current.dynamicPatterns.length} DNA patterns loaded.`
          );
        }

        db.close();
      };

      request.onerror = () => db.close();
    } catch (err) {
      console.error('IndexedDB Load Failure:', err);
    }
  }, [initIndexedDB, updateBrainStats]);

  useEffect(() => {
    void loadBrainFromDB();
  }, [loadBrainFromDB]);

  // ------------------------------------------------------------
  // Existing Dynamic DNA logic
  // ------------------------------------------------------------

  const generatePatternDNA = (
    sequence: string,
    avgBody: number,
    avgTopWick: number,
    avgBotWick: number
  ) => {
    const bodyRatio = avgBody > 0 ? (avgTopWick / avgBody).toFixed(1) : '0';
    const wickRatio = avgBody > 0 ? (avgBotWick / avgBody).toFixed(1) : '0';

    return `DNA_${sequence}_B${Math.round(avgBody)}_TW${bodyRatio}_BW${wickRatio}`;
  };

  const processDynamicPatternLearning = useCallback(
    (dnaHash: string, sequenceStr: string, outcome: 'WIN' | 'LOSS') => {
      const brain = brainRef.current;
      let dynPattern = brain.dynamicPatterns.find(
        (dp) => dp.dnaHash === dnaHash
      );

      if (!dynPattern) {
        dynPattern = {
          dnaHash,
          sequenceStr,
          winCount: outcome === 'WIN' ? 1 : 0,
          lossCount: outcome === 'LOSS' ? 1 : 0,
          winRate: outcome === 'WIN' ? 100 : 0,
          lastDetected: Date.now()
        };
        brain.dynamicPatterns.push(dynPattern);
      } else {
        if (outcome === 'WIN') dynPattern.winCount++;
        else dynPattern.lossCount++;

        const total = dynPattern.winCount + dynPattern.lossCount;
        dynPattern.winRate = total > 0
          ? (dynPattern.winCount / total) * 100
          : 0;
        dynPattern.lastDetected = Date.now();
      }
    },
    []
  );

  // ------------------------------------------------------------
  // Price / level helpers
  // ------------------------------------------------------------

  const getPriceRange = (price: number) => {
    const base = Math.floor(price * 1000);
    return `${(base / 1000).toFixed(3)}-${((base + 1) / 1000).toFixed(3)}`;
  };

  const processZigZagLogic = useCallback((currentPrice: number) => {
    const history = priceHistoryRef.current;
    history.push({ price: currentPrice, time: Date.now() });

    if (history.length > 250) history.shift();
    if (history.length < 10) return;

    const recent = history.slice(-50);
    const prices = recent.map((h) => h.price);
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const last = recent[recent.length - 1].price;

    let detectedPeak: 'HIGH' | 'LOW' | null = null;
    let peakPrice = 0;

    const range = maxPrice - minPrice;
    const threshold = Math.max(0.00005, range * 0.12);

    if (last === maxPrice && range >= threshold) {
      detectedPeak = 'HIGH';
      peakPrice = maxPrice;
    } else if (last === minPrice && range >= threshold) {
      detectedPeak = 'LOW';
      peakPrice = minPrice;
    }

    if (!detectedPeak) return;

    const brain = brainRef.current;
    const tolerance = Math.max(0.00005, range * 0.08);

    const existing = brain.zigzagLevels.find(
      (zl) => Math.abs(zl.price - peakPrice) <= tolerance
    );

    if (existing) {
      existing.occurrences++;
      existing.timestamp = Date.now();
    } else {
      brain.zigzagLevels.push({
        price: peakPrice,
        type: detectedPeak,
        occurrences: 1,
        timestamp: Date.now()
      });
    }

    if (brain.zigzagLevels.length > 500) {
      brain.zigzagLevels.sort((a, b) => b.occurrences - a.occurrences);
      brain.zigzagLevels = brain.zigzagLevels.slice(0, 400);
    }
  }, []);

  // ============================================================
  // NEW: VISUAL MARKET-STRUCTURE ENGINE
  // Builds HH / HL / LH / LL directly from the candle positions
  // visible on the shared screen. It does not require a real price.
  // ============================================================
  const processVisualMarketStructure = useCallback(
    (points: VisualCandlePoint[]) => {
      if (points.length < 3) return;

      const brain = brainRef.current;
      const ordered = [...points].sort((a, b) => a.x - b.x);
      const pivots: { swingType: 'HIGH' | 'LOW'; y: number; x: number }[] = [];

      for (let i = 1; i < ordered.length - 1; i++) {
        const prev = ordered[i - 1];
        const cur = ordered[i];
        const next = ordered[i + 1];

        const isHigh =
          cur.highY <= prev.highY &&
          cur.highY <= next.highY &&
          Math.abs(cur.highY - prev.highY) >= 0;
        const isLow =
          cur.lowY >= prev.lowY &&
          cur.lowY >= next.lowY &&
          Math.abs(cur.lowY - prev.lowY) >= 0;

        if (isHigh) pivots.push({ swingType: 'HIGH', y: cur.highY, x: cur.x });
        if (isLow) pivots.push({ swingType: 'LOW', y: cur.lowY, x: cur.x });
      }

      for (const pivot of pivots) {
        const previousSameType = [...brain.marketStructures]
          .filter((m) => m.swingType === pivot.swingType)
          .sort((a, b) => b.timestamp - a.timestamp)[0];

        let structure: MarketStructureLevel['structure'];
        if (!previousSameType) {
          structure = pivot.swingType === 'HIGH' ? 'HH' : 'LL';
        } else if (pivot.swingType === 'HIGH') {
          // Screen Y smaller = higher market price.
          structure = pivot.y < previousSameType.screenY ? 'HH' : 'LH';
        } else {
          // Screen Y larger = lower market price.
          structure = pivot.y > previousSameType.screenY ? 'LL' : 'HL';
        }

        const existing = brain.marketStructures.find(
          (m) =>
            m.swingType === pivot.swingType &&
            Math.abs(m.screenY - pivot.y) <= MARKET_LEVEL_TOLERANCE_PX
        );

        if (existing) {
          existing.occurrences++;
          existing.strength = clamp(
            existing.strength + 0.02,
            0,
            1
          );
          existing.timestamp = Date.now();
          existing.structure = structure;
          existing.screenX = pivot.x;
        } else {
          brain.marketStructures.push({
            screenY: pivot.y,
            screenX: pivot.x,
            swingType: pivot.swingType,
            structure,
            occurrences: 1,
            strength: 0.55,
            timestamp: Date.now()
          });
        }
      }

      // Keep only useful recent/strong levels.
      if (brain.marketStructures.length > MAX_MARKET_STRUCTURES) {
        brain.marketStructures.sort(
          (a, b) =>
            (b.occurrences * b.strength) -
            (a.occurrences * a.strength)
        );
        brain.marketStructures = brain.marketStructures.slice(
          0,
          MAX_MARKET_STRUCTURES
        );
      }
    },
    []
  );

  const getMarketStructureSnapshot = useCallback(() => {
    const structures = brainRef.current.marketStructures;
    if (!structures.length) {
      return {
        level: null as MarketStructureLevel | null,
        bias: 'NEUTRAL' as Direction
      };
    }

    const recent = [...structures]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20);

    let bullish = 0;
    let bearish = 0;
    for (const item of recent) {
      const weight = Math.max(1, item.occurrences) * item.strength;
      if (item.structure === 'HH' || item.structure === 'HL') bullish += weight;
      if (item.structure === 'LH' || item.structure === 'LL') bearish += weight;
    }

    const bias =
      bullish > bearish * 1.15
        ? 'UP'
        : bearish > bullish * 1.15
          ? 'DOWN'
          : 'NEUTRAL';

    return { level: recent[0] || null, bias };
  }, []);

  const detectMagicNumber = useCallback(
    (
      currentPrice: number,
      currentColor: CandleColor,
      lastPrice: number,
      lastColor: CandleColor
    ) => {
      if (
        currentColor === 'NEUTRAL' ||
        lastColor === 'NEUTRAL' ||
        currentColor === lastColor ||
        lastPrice <= 0
      ) {
        return;
      }

      const priceRange = getPriceRange(currentPrice);
      const direction =
        lastColor === 'GREEN'
          ? 'GREEN_TO_RED'
          : 'RED_TO_GREEN';

      const existing = brainRef.current.magicNumbers.find(
        (mn) =>
          Math.abs(mn.priceLevel - currentPrice) < 0.0005 &&
          mn.priceRange === priceRange
      );

      if (existing) {
        existing.occurrences++;
        existing.lastSeen = Date.now();
      } else {
        brainRef.current.magicNumbers.push({
          priceLevel: currentPrice,
          priceRange,
          direction,
          occurrences: 1,
          successRate: 0.5,
          lastSeen: Date.now()
        });
      }
    },
    []
  );

  const trackTimeAlgorithm = useCallback(
    (
      currentMinute: number,
      currentSecond: number,
      color: CandleColor
    ) => {
      const brain = brainRef.current;
      const direction: Direction =
        color === 'GREEN'
          ? 'UP'
          : color === 'RED'
            ? 'DOWN'
            : 'NEUTRAL';

      let timeAlgo = brain.timeAlgorithms.find(
        (ta) =>
          ta.secondMarker === currentSecond &&
          ta.minuteMarker === currentMinute
      );

      if (!timeAlgo) {
        timeAlgo = {
          minuteMarker: currentMinute,
          secondMarker: currentSecond,
          direction,
          frequency: 1,
          successRate: 0.5,
          lastOccurrences: [Date.now()]
        };

        brain.timeAlgorithms.push(timeAlgo);
      } else {
        timeAlgo.frequency++;
        timeAlgo.lastOccurrences.push(Date.now());

        if (timeAlgo.lastOccurrences.length > 10) {
          timeAlgo.lastOccurrences.shift();
        }

        if (direction !== 'NEUTRAL') {
          timeAlgo.direction = direction;
        }
      }

      if (currentSecond % 15 === 0) {
        void saveBrainToDB();
      }
    },
    [saveBrainToDB]
  );

  // ------------------------------------------------------------
  // Existing vision price estimators
  // ------------------------------------------------------------

  const extractOCRPriceData = (frameData: Uint8ClampedArray): number => {
    let digitPixelSum = 0;

    const startX = Math.floor((cropBox.x / 100) * 800);
    const endX = Math.floor(((cropBox.x + cropBox.width) / 100) * 800);
    const startY = Math.floor((cropBox.y / 100) * 400);
    const endY = Math.floor(((cropBox.y + cropBox.height) / 100) * 400);

    for (let y = startY; y < endY; y += 2) {
      for (let x = startX; x < endX; x += 2) {
        const i = (y * 800 + x) * 4;
        const r = frameData[i];
        const g = frameData[i + 1];
        const b = frameData[i + 2];

        if (r > 200 && g > 200 && b > 200) {
          digitPixelSum++;
        }
      }
    }

    // Fallback visual estimator. Replace with real OCR/OHLC later.
    const detectedBase = 1.12000;
    return parseFloat(
      (detectedBase + digitPixelSum / 50000).toFixed(5)
    );
  };

  const extractPriceLevel = (frameData: Uint8ClampedArray): number => {
    let pricePixels = 0;

    const startX = Math.floor((cropBox.x / 100) * 800);
    const endX = Math.floor(((cropBox.x + cropBox.width) / 100) * 800);
    const startY = Math.floor((cropBox.y / 100) * 400);
    const endY = Math.floor(((cropBox.y + cropBox.height) / 100) * 400);

    for (let y = startY; y < endY; y += 2) {
      for (let x = startX; x < endX; x += 2) {
        const i = (y * 800 + x) * 4;
        const brightness =
          (frameData[i] + frameData[i + 1] + frameData[i + 2]) / 3;

        if (brightness > 150) pricePixels++;
      }
    }

    // IMPORTANT:
    // This is only a visual fallback estimator, NOT actual broker OHLC.
    const basePrice = 1.85000;
    const priceOffset = (pricePixels / 10000) * 0.10000;

    return parseFloat(
      (basePrice + priceOffset).toFixed(5)
    );
  };

  // ------------------------------------------------------------
  // Existing indicators
  // ------------------------------------------------------------

  const calculateInternalIndicators = useCallback(
    (currentPrice: number): TechnicalIndicatorState => {
      const history = priceHistoryRef.current;

      if (history.length < 10) {
        return {
          sma5Trend: 'NEUTRAL',
          smma10Trend: 'NEUTRAL',
          keltnerBand: 'INSIDE',
          volumeBias: 'NORMAL'
        };
      }

      const prices = history.map((h) => h.price);
      const last5 = prices.slice(-5);
      const sma5 =
        last5.reduce((a, b) => a + b, 0) / last5.length;

      const sma5Trend =
        currentPrice > sma5
          ? 'BULLISH'
          : currentPrice < sma5
            ? 'BEARISH'
            : 'NEUTRAL';

      const period = 10;
      const last10 = prices.slice(-period);

      let smma10 =
        smmaPreviousRef.current === null
          ? last10.reduce((a, b) => a + b, 0) / last10.length
          : (smmaPreviousRef.current * (period - 1) + currentPrice) /
            period;

      smmaPreviousRef.current = smma10;

      const smma10Trend =
        currentPrice > smma10
          ? 'BULLISH'
          : currentPrice < smma10
            ? 'BEARISH'
            : 'NEUTRAL';

      const emaPeriod = Math.min(20, prices.length);
      const k = 2 / (emaPeriod + 1);
      let ema20 = prices[0];

      for (let i = 1; i < prices.length; i++) {
        ema20 = prices[i] * k + ema20 * (1 - k);
      }

      let totalRange = 0;
      for (
        let i = 1;
        i < Math.min(10, prices.length);
        i++
      ) {
        totalRange += Math.abs(
          prices[prices.length - i] -
          prices[prices.length - i - 1]
        );
      }

      const atr10 =
        totalRange / Math.max(1, Math.min(9, prices.length - 1)) ||
        0.0008;

      const upperBand = ema20 + 2 * atr10;
      const lowerBand = ema20 - 2 * atr10;

      let keltnerBand: TechnicalIndicatorState['keltnerBand'] = 'INSIDE';

      if (currentPrice > upperBand) {
        keltnerBand = 'UPPER_BREAK';
      } else if (currentPrice < lowerBand) {
        keltnerBand = 'LOWER_BREAK';
      }

      const recentMoves = prices.slice(-6);
      let greenTickSum = 0;
      let redTickSum = 0;

      for (let i = 1; i < recentMoves.length; i++) {
        const diff = recentMoves[i] - recentMoves[i - 1];

        if (diff > 0) greenTickSum += diff;
        else redTickSum += Math.abs(diff);
      }

      let volumeBias: TechnicalIndicatorState['volumeBias'] = 'NORMAL';

      if (greenTickSum > redTickSum * 1.3) {
        volumeBias = 'HIGH_GREEN';
      } else if (redTickSum > greenTickSum * 1.3) {
        volumeBias = 'HIGH_RED';
      }

      return {
        sma5Trend,
        smma10Trend,
        keltnerBand,
        volumeBias
      };
    },
    []
  );

  // ------------------------------------------------------------
  // Existing pixel candle detector
  // ------------------------------------------------------------

  const analyzePixelDistribution = (frameData: Uint8ClampedArray) => {
    let greenPixels = 0;
    let redPixels = 0;

    const candleRegions: {
      x: number;
      color: 'GREEN' | 'RED';
    }[] = [];
    const visualCandles: VisualCandlePoint[] = [];

    const cropXStart = Math.floor((cropBox.x / 100) * 800);
    const cropXEnd = Math.floor(
      ((cropBox.x + cropBox.width) / 100) * 800
    );

    const cropYStart = Math.floor((cropBox.y / 100) * 400);
    const cropYEnd = Math.floor(
      ((cropBox.y + cropBox.height) / 100) * 400
    );

    let globalYMin = cropYEnd;
    let globalYMax = cropYStart;

    let bodyTopCoord = cropYEnd;
    let bodyBottomCoord = cropYStart;

    const rangeX = Math.max(1, cropXEnd - cropXStart);
    const chunkSize = Math.max(1, Math.floor(rangeX / 20));

    for (let chunk = 0; chunk < 20; chunk++) {
      let chunkGreen = 0;
      let chunkRed = 0;

      const cStartX = cropXStart + chunk * chunkSize;
      const cEndX = Math.min(
        cropXEnd,
        cStartX + chunkSize
      );

      for (let x = cStartX; x < cEndX; x++) {
        for (let y = cropYStart; y < cropYEnd; y++) {
          const i = (y * 800 + x) * 4;

          const r = frameData[i];
          const g = frameData[i + 1];
          const b = frameData[i + 2];

          const isGreen =
            g > r + 30 &&
            g > b + 30;

          const isRed =
            r > g + 30 &&
            r > b + 30;

          if (isGreen || isRed) {
            globalYMin = Math.min(globalYMin, y);
            globalYMax = Math.max(globalYMax, y);

            if (isGreen) chunkGreen++;
            if (isRed) chunkRed++;
          }
        }
      }

      if (chunkGreen > 20 || chunkRed > 20) {
        const color = chunkGreen > chunkRed ? 'GREEN' : 'RED';
        candleRegions.push({ x: chunk, color });

        // Capture each candle's own vertical geometry. This is what lets the
        // market-structure engine build HH/HL/LH/LL from the chart itself.
        let candleYMin = cropYEnd;
        let candleYMax = cropYStart;
        for (let x = cStartX; x < cEndX; x += 2) {
          for (let y = cropYStart; y < cropYEnd; y += 2) {
            const i = (y * 800 + x) * 4;
            const r = frameData[i];
            const g = frameData[i + 1];
            const b = frameData[i + 2];
            const isGreen = g > r + 30 && g > b + 30;
            const isRed = r > g + 30 && r > b + 30;
            if (isGreen || isRed) {
              candleYMin = Math.min(candleYMin, y);
              candleYMax = Math.max(candleYMax, y);
            }
          }
        }

        visualCandles.push({
          x: chunk,
          color,
          highY: candleYMin,
          lowY: candleYMax,
          bodyTop: candleYMin,
          bodyBottom: candleYMax
        });

        if (chunk >= 18) {
          bodyTopCoord = globalYMin + 5;
          bodyBottomCoord = globalYMax - 5;
        }
      }

      greenPixels += chunkGreen;
      redPixels += chunkRed;
    }

    const actualBodySize = Math.max(
      0,
      bodyBottomCoord - bodyTopCoord
    );

    const actualTopWickSize = Math.max(
      0,
      bodyTopCoord - globalYMin
    );

    const actualBottomWickSize = Math.max(
      0,
      globalYMax - bodyBottomCoord
    );

    return {
      greenPixels,
      redPixels,
      candleRegions,
      actualBodySize,
      actualTopWickSize,
      actualBottomWickSize,
      visualCandles
    };
  };

  // ============================================================
  // NEW: SELF-LEARNING PATTERN DISCOVERY ENGINE
  // ============================================================

  const buildFeature = (
    color: CandleColor,
    body: number,
    topWick: number,
    bottomWick: number
  ): CandleFeature => {
    const range = Math.max(
      1,
      body + topWick + bottomWick
    );

    const bodyRatio = safeRatio(body, range);
    const topWickRatio = safeRatio(topWick, range);
    const bottomWickRatio = safeRatio(bottomWick, range);

    const directionFactor =
      color === 'GREEN'
        ? 1
        : color === 'RED'
          ? -1
          : 0;

    const strength = clamp(
      bodyRatio * 0.7 +
      Math.max(topWickRatio, bottomWickRatio) * 0.15 +
      Math.abs(directionFactor) * 0.15,
      0,
      1
    );

    return {
      color,
      body,
      range,
      topWick,
      bottomWick,
      bodyRatio,
      topWickRatio,
      bottomWickRatio,
      strength
    };
  };

  const quantize = (value: number, buckets: number[]) => {
    let index = 0;

    for (let i = 0; i < buckets.length; i++) {
      if (value >= buckets[i]) index = i + 1;
    }

    return index;
  };

  const featureSignature = (feature: CandleFeature) => {
    const bodyBucket = quantize(
      feature.bodyRatio,
      [0.15, 0.35, 0.55, 0.75]
    );

    const topBucket = quantize(
      feature.topWickRatio,
      [0.10, 0.25, 0.40, 0.60]
    );

    const bottomBucket = quantize(
      feature.bottomWickRatio,
      [0.10, 0.25, 0.40, 0.60]
    );

    const strengthBucket = quantize(
      feature.strength,
      [0.25, 0.50, 0.75]
    );

    return `${bodyBucket}${topBucket}${bottomBucket}${strengthBucket}`;
  };

  const buildSequenceFromFeatures = (
    features: CandleFeature[]
  ) => {
    return features
      .slice(-12)
      .map((f) =>
        f.color === 'GREEN'
          ? 'G'
          : f.color === 'RED'
            ? 'R'
            : 'N'
      )
      .join('');
  };

  const getRecentFeatures = (length = 5) =>
    candleFeaturesRef.current.slice(-length);

  const classifyLevelContext = useCallback(
    (currentPrice: number): LevelContext => {
      const brain = brainRef.current;

      let nearest: ZigZagLevel | null = null;
      let nearestDistance = Infinity;

      for (const level of brain.zigzagLevels) {
        const distance = Math.abs(level.price - currentPrice);

        if (distance < nearestDistance) {
          nearest = level;
          nearestDistance = distance;
        }
      }

      const history = priceHistoryRef.current;
      const prices = history.map((p) => p.price);

      const recentHigh =
        prices.length > 5
          ? Math.max(...prices.slice(-20))
          : currentPrice;

      const recentLow =
        prices.length > 5
          ? Math.min(...prices.slice(-20))
          : currentPrice;

      const dynamicRange =
        Math.max(0.0001, recentHigh - recentLow);

      const tolerance = Math.max(
        0.00015,
        dynamicRange * 0.10
      );

      let nearestLevel = nearest?.price ?? null;
      let levelType: LevelContext['levelType'] =
        nearest?.type === 'HIGH'
          ? 'RESISTANCE'
          : nearest?.type === 'LOW'
            ? 'SUPPORT'
            : 'NONE';

      if (!nearest || nearestDistance > tolerance) {
        if (
          Math.abs(currentPrice - recentHigh) <= tolerance
        ) {
          nearestLevel = recentHigh;
          levelType = 'RESISTANCE';
          nearestDistance =
            Math.abs(currentPrice - recentHigh);
        } else if (
          Math.abs(currentPrice - recentLow) <= tolerance
        ) {
          nearestLevel = recentLow;
          levelType = 'SUPPORT';
          nearestDistance =
            Math.abs(currentPrice - recentLow);
        } else {
          nearestLevel = null;
          levelType = 'NONE';
          nearestDistance = Infinity;
        }
      }

      const nearLevel =
        nearestLevel !== null &&
        nearestDistance <= tolerance;

      if (history.length < 8) {
        return {
          nearestLevel,
          levelType,
          distance:
            Number.isFinite(nearestDistance)
              ? nearestDistance
              : 0,
          nearLevel,
          breakout: false,
          retest: false,
          rejection: false,
          confirmation: false
        };
      }

      const previous = history
        .slice(-12, -1)
        .map((p) => p.price);

      const previousHigh = Math.max(...previous);
      const previousLow = Math.min(...previous);

      const breakout =
        (levelType === 'RESISTANCE' &&
          currentPrice > previousHigh) ||
        (levelType === 'SUPPORT' &&
          currentPrice < previousLow);

      // Retest = price has recently crossed/approached a known level
      // and is currently back close to that level.
      const hadLevelVisit =
        nearestLevel !== null &&
        history
          .slice(-15)
          .some(
            (p) =>
              Math.abs(p.price - nearestLevel!) <= tolerance
          );

      const retest =
        nearLevel &&
        hadLevelVisit &&
        history.length >= 10;

      const recent = getRecentFeatures(3);

      const last = recent[recent.length - 1];
      const previousCandle =
        recent.length >= 2
          ? recent[recent.length - 2]
          : null;

      const rejection =
        nearLevel &&
        !!last &&
        (
          (levelType === 'RESISTANCE' &&
            last.topWickRatio > 0.30 &&
            last.color === 'RED') ||
          (levelType === 'SUPPORT' &&
            last.bottomWickRatio > 0.30 &&
            last.color === 'GREEN')
        );

      const confirmation =
        retest &&
        !!previousCandle &&
        !!last &&
        (
          (levelType === 'RESISTANCE' &&
            previousCandle.color === 'RED' &&
            last.color === 'RED') ||
          (levelType === 'SUPPORT' &&
            previousCandle.color === 'GREEN' &&
            last.color === 'GREEN')
        );

      return {
        nearestLevel,
        levelType,
        distance:
          Number.isFinite(nearestDistance)
            ? nearestDistance
            : 0,
        nearLevel,
        breakout,
        retest,
        rejection,
        confirmation
      };
    },
    []
  );

  const buildContextSignature = (
    level: LevelContext,
    indicators: TechnicalIndicatorState
  ) => {
    const levelCode =
      level.levelType === 'SUPPORT'
        ? 'S'
        : level.levelType === 'RESISTANCE'
          ? 'R'
          : 'N';

    const eventCode = [
      level.breakout ? 'B' : '-',
      level.retest ? 'T' : '-',
      level.rejection ? 'J' : '-',
      level.confirmation ? 'C' : '-'
    ].join('');

    const trendCode =
      indicators.sma5Trend === 'BULLISH'
        ? 'U'
        : indicators.sma5Trend === 'BEARISH'
          ? 'D'
          : 'N';

    return `${levelCode}${eventCode}${trendCode}`;
  };

  const buildDiscoveryDNA = (
    features: CandleFeature[],
    level: LevelContext,
    indicators: TechnicalIndicatorState
  ) => {
    const sequence = buildSequenceFromFeatures(features);

    const featureCode = features
      .slice(-5)
      .map(featureSignature)
      .join('.');

    const contextCode =
      buildContextSignature(level, indicators);

    return `DISC_${sequence}_${featureCode}_${contextCode}`;
  };

  const calculatePatternDirection = (
    features: CandleFeature[],
    level: LevelContext
  ): Direction => {
    if (features.length === 0) return 'NEUTRAL';

    const greenStrength = features
      .filter((f) => f.color === 'GREEN')
      .reduce((sum, f) => sum + f.strength, 0);

    const redStrength = features
      .filter((f) => f.color === 'RED')
      .reduce((sum, f) => sum + f.strength, 0);

    if (
      level.levelType === 'RESISTANCE' &&
      (level.rejection || level.retest) &&
      redStrength > greenStrength
    ) {
      return 'DOWN';
    }

    if (
      level.levelType === 'SUPPORT' &&
      (level.rejection || level.retest) &&
      greenStrength > redStrength
    ) {
      return 'UP';
    }

    if (greenStrength > redStrength * 1.10) {
      return 'UP';
    }

    if (redStrength > greenStrength * 1.10) {
      return 'DOWN';
    }

    return 'NEUTRAL';
  };

  const discoverPattern = useCallback(
    (
      observation: PatternObservation,
      indicators: TechnicalIndicatorState
    ): PatternDiscovery | null => {
      const brain = brainRef.current;

      const features = getRecentFeatures(5);

      if (features.length < 3) {
        return null;
      }

      const dnaHash = buildDiscoveryDNA(
        features,
        classifyLevelContext(observation.priceLevel),
        indicators
      );

      const context = observation.context;

      let discovery = brain.discoveries.find(
        (item) => item.dnaHash === dnaHash
      );

      const direction = observation.direction;

      if (!discovery) {
        discovery = {
          id: `DISCOVERED_${String(
            brain.discoveries.length + 1
          ).padStart(4, '0')}`,
          dnaHash,
          sequence: observation.sequence,
          context,
          direction,
          occurrences: 1,
          upCount: direction === 'UP' ? 1 : 0,
          downCount: direction === 'DOWN' ? 1 : 0,
          winCount: 0,
          lossCount: 0,
          winRate: 0,
          confidence: 0,
          avgBodyRatio: observation.bodyRatio,
          avgTopWickRatio: observation.topWickRatio,
          avgBottomWickRatio: observation.bottomWickRatio,
          levelHits: observation.nearLevel ? 1 : 0,
          breakoutRetestHits:
            observation.breakoutRetest ? 1 : 0,
          failedCount: 0,
          createdAt: Date.now(),
          lastSeen: Date.now()
        };

        brain.discoveries.push(discovery);
      } else {
        const n = discovery.occurrences;

        discovery.occurrences++;
        discovery.upCount += direction === 'UP' ? 1 : 0;
        discovery.downCount += direction === 'DOWN' ? 1 : 0;

        discovery.avgBodyRatio =
          (discovery.avgBodyRatio * n +
            observation.bodyRatio) /
          (n + 1);

        discovery.avgTopWickRatio =
          (discovery.avgTopWickRatio * n +
            observation.topWickRatio) /
          (n + 1);

        discovery.avgBottomWickRatio =
          (discovery.avgBottomWickRatio * n +
            observation.bottomWickRatio) /
          (n + 1);

        if (observation.nearLevel) {
          discovery.levelHits++;
        }

        if (observation.breakoutRetest) {
          discovery.breakoutRetestHits++;
        }

        discovery.lastSeen = Date.now();

        if (
          discovery.upCount >
          discovery.downCount * 1.20
        ) {
          discovery.direction = 'UP';
        } else if (
          discovery.downCount >
          discovery.upCount * 1.20
        ) {
          discovery.direction = 'DOWN';
        } else {
          discovery.direction = 'NEUTRAL';
        }
      }

      const totalDirectional =
        discovery.upCount +
        discovery.downCount;

      const directionalRate =
        totalDirectional > 0
          ? Math.max(
              discovery.upCount,
              discovery.downCount
            ) / totalDirectional
          : 0.5;

      const contextBonus =
        (discovery.levelHits /
          Math.max(1, discovery.occurrences)) *
        0.15;

      const retestBonus =
        (discovery.breakoutRetestHits /
          Math.max(1, discovery.occurrences)) *
        0.20;

      discovery.confidence = clamp(
        directionalRate * 0.65 +
        contextBonus +
        retestBonus,
        0,
        1
      );

      if (brain.discoveries.length > MAX_DISCOVERIES) {
        brain.discoveries.sort(
          (a, b) =>
            b.occurrences - a.occurrences
        );

        brain.discoveries =
          brain.discoveries.slice(0, MAX_DISCOVERIES);
      }

      return discovery;
    },
    [classifyLevelContext]
  );

  const updateDiscoveryOutcome = useCallback(
    (
      discoveryId: string | null,
      result: 'WIN' | 'LOSS'
    ) => {
      if (!discoveryId) return;

      const discovery =
        brainRef.current.discoveries.find(
          (item) => item.id === discoveryId
        );

      if (!discovery) return;

      if (result === 'WIN') {
        discovery.winCount++;
      } else {
        discovery.lossCount++;
        discovery.failedCount++;
      }

      const total =
        discovery.winCount +
        discovery.lossCount;

      discovery.winRate =
        total > 0
          ? (discovery.winCount / total) * 100
          : 0;

      discovery.lastOutcome = result;
      discovery.lastSeen = Date.now();
    },
    []
  );

  // ------------------------------------------------------------
  // Main analysis
  // ------------------------------------------------------------

  const finalizeAnalysis = (
    samples: {
      green: number;
      red: number;
      regions: { x: number; color: 'GREEN' | 'RED' }[];
      body: number;
      topW: number;
      botW: number;
      visualCandles: VisualCandlePoint[];
    }[]
  ) => {
    if (samples.length === 0) {
      setIsScanning(false);
      setStatusMessage('Analysis failed. Matrix empty.');
      return;
    }

    let totalGreen = 0;
    let totalRed = 0;
    let avgBody = 0;
    let avgTopWick = 0;
    let avgBotWick = 0;

    const sequenceCounts: Record<string, number> = {};

    samples.forEach((sample) => {
      totalGreen += sample.green;
      totalRed += sample.red;
      avgBody += sample.body;
      avgTopWick += sample.topW;
      avgBotWick += sample.botW;

      let sequence = '';

      sample.regions.forEach((region) => {
        sequence +=
          region.color === 'GREEN'
            ? 'G'
            : 'R';
      });

      for (
        let len = 2;
        len <= Math.min(9, sequence.length);
        len++
      ) {
        for (
          let i = 0;
          i <= sequence.length - len;
          i++
        ) {
          const seq =
            sequence.slice(i, i + len);

          sequenceCounts[seq] =
            (sequenceCounts[seq] || 0) + 1;
        }
      }
    });

    const avgGreen =
      totalGreen / samples.length;

    const avgRed =
      totalRed / samples.length;

    const computedBodySize =
      avgBody / samples.length;

    const computedTopWick =
      avgTopWick / samples.length;

    const computedBottomWick =
      avgBotWick / samples.length;

    const dominantColor: CandleColor =
      avgGreen > avgRed * 1.08
        ? 'GREEN'
        : avgRed > avgGreen * 1.08
          ? 'RED'
          : 'NEUTRAL';

    if (!canvasRef.current || !videoRef.current) {
      setIsScanning(false);
      return;
    }

    const ctx =
      canvasRef.current.getContext(
        '2d',
        { willReadFrequently: true }
      );

    if (!ctx) {
      setIsScanning(false);
      return;
    }

    ctx.drawImage(
      videoRef.current,
      0,
      0,
      800,
      400
    );

    const frameData =
      ctx.getImageData(
        0,
        0,
        800,
        400
      ).data;

    const ocrPrice =
      extractOCRPriceData(frameData);

    const currentPrice =
      extractPriceLevel(frameData);

    processZigZagLogic(currentPrice);
    processVisualMarketStructure(
      samples[samples.length - 1].visualCandles
    );

    const indicators =
      calculateInternalIndicators(
        currentPrice
      );

    const priceRange =
      getPriceRange(currentPrice);

    const matchedZigZag =
      brainRef.current.zigzagLevels.reduce(
        (closest, current) => {
          const currentDiff =
            Math.abs(
              current.price -
              currentPrice
            );

          const closestDiff =
            closest
              ? Math.abs(
                  closest.price -
                  currentPrice
                )
              : Infinity;

          return currentDiff <
            closestDiff &&
            currentDiff < 0.0015
            ? current
            : closest;
        },
        null as ZigZagLevel | null
      );

    const relevantMagicNumbers =
      brainRef.current.magicNumbers.filter(
        (mn) =>
          mn.priceRange === priceRange &&
          Math.abs(
            mn.priceLevel -
            currentPrice
          ) < 0.005
      );

    const now = new Date();

    const currentMinute =
      now.getMinutes();

    const currentSecond =
      now.getSeconds();

    const timeSyncData =
      brainRef.current.timeAlgorithms.find(
        (ta) =>
          ta.secondMarker === currentSecond &&
          ta.minuteMarker === currentMinute
      ) || null;

    const strongestSequence =
      Object.entries(sequenceCounts)
        .sort((a, b) => b[1] - a[1])[0];

    const dnaHash =
      generatePatternDNA(
        strongestSequence
          ? strongestSequence[0]
          : 'RAW',
        computedBodySize,
        computedTopWick,
        computedBottomWick
      );

    // --------------------------------------------------------
    // Build current candle feature.
    // --------------------------------------------------------

    const currentFeature =
      buildFeature(
        dominantColor,
        computedBodySize,
        computedTopWick,
        computedBottomWick
      );

    candleFeaturesRef.current.push(
      currentFeature
    );

    if (
      candleFeaturesRef.current.length >
      MAX_CANDLES
    ) {
      candleFeaturesRef.current.shift();
    }

    const levelContext =
      classifyLevelContext(
        currentPrice
      );

    const recentFeatures =
      getRecentFeatures(5);

    const discoverySequence =
      buildSequenceFromFeatures(
        recentFeatures
      );

    const observation: PatternObservation =
      {
        dnaHash: '',
        sequence:
          discoverySequence,
        direction:
          calculatePatternDirection(
            recentFeatures,
            levelContext
          ),
        context:
          buildContextSignature(
            levelContext,
            indicators
          ),
        createdAt: Date.now(),
        priceLevel: currentPrice,
        bodyRatio:
          currentFeature.bodyRatio,
        topWickRatio:
          currentFeature.topWickRatio,
        bottomWickRatio:
          currentFeature.bottomWickRatio,
        nearLevel:
          levelContext.nearLevel,
        breakoutRetest:
          levelContext.breakout ||
          levelContext.retest
      };

    const discovery =
      discoverPattern(
        observation,
        indicators
      );

    if (discovery) {
      observation.dnaHash =
        discovery.dnaHash;
    }

    // --------------------------------------------------------
    // Existing streak logic
    // --------------------------------------------------------

    let streakCount = 0;
    let streakColor:
      | 'GREEN'
      | 'RED'
      | 'NONE' = 'NONE';

    let isTrapDetected = false;

    if (strongestSequence) {
      const seqStr =
        strongestSequence[0];

      const lastChar =
        seqStr[seqStr.length - 1];

      for (
        let i = seqStr.length - 1;
        i >= 0;
        i--
      ) {
        if (
          seqStr[i] ===
          lastChar
        ) {
          streakCount++;
        } else {
          break;
        }
      }

      streakColor =
        lastChar === 'G'
          ? 'GREEN'
          : 'RED';
    }

    const structureSnapshot = getMarketStructureSnapshot();
    const marketStructure = structureSnapshot.level;
    const structureBias = structureSnapshot.bias;

    let patternString =
      `Dominant: ${dominantColor}`;

    if (marketStructure) {
      patternString +=
        ` | STRUCTURE:${marketStructure.structure}`;
    }
    if (structureBias !== 'NEUTRAL') {
      patternString +=
        ` | STRUCTURE BIAS:${structureBias}`;
    }

    if (strongestSequence) {
      patternString +=
        ` | Seq: ${strongestSequence[0]}`;
    }

    patternString +=
      ` | DNA: ${dnaHash}`;

    if (discovery) {
      patternString +=
        ` | ${discovery.id}`;

      if (
        discovery.occurrences >=
        MIN_PATTERN_OCCURRENCES
      ) {
        patternString +=
          ` | ${discovery.occurrences}x`;
      }
    }

    if (levelContext.nearLevel) {
      patternString +=
        ` | ${levelContext.levelType}`;

      if (levelContext.breakout) {
        patternString +=
          ' BREAKOUT';
      }

      if (levelContext.retest) {
        patternString +=
          ' RETEST';
      }

      if (levelContext.rejection) {
        patternString +=
          ' REJECTION';
      }

      if (levelContext.confirmation) {
        patternString +=
          ' CONFIRMATION';
      }
    }

    // --------------------------------------------------------
    // Existing base signal logic
    // --------------------------------------------------------

    let proposedSignal: 'CALL' | 'PUT' =
      dominantColor === 'GREEN'
        ? 'CALL'
        : 'PUT';

    let confidence =
      Math.abs(
        avgGreen -
        avgRed
      ) /
      Math.max(
        avgGreen,
        avgRed,
        1
      );

    // --------------------------------------------------------
    // NEW: discovered pattern scoring
    // --------------------------------------------------------

    if (
      discovery &&
      discovery.occurrences >=
        MIN_PATTERN_OCCURRENCES
    ) {
      if (
        discovery.direction === 'UP' &&
        discovery.confidence >= 0.58
      ) {
        proposedSignal = 'CALL';
        confidence +=
          discovery.confidence * 0.25;

        patternString +=
          ` | DISCOVERYÃ¢â€ â€™UP`;
      }

      if (
        discovery.direction === 'DOWN' &&
        discovery.confidence >= 0.58
      ) {
        proposedSignal = 'PUT';
        confidence +=
          discovery.confidence * 0.25;

        patternString +=
          ` | DISCOVERYÃ¢â€ â€™DOWN`;
      }

      if (
        discovery.winCount +
          discovery.lossCount >=
          MIN_PATTERN_OCCURRENCES
      ) {
        const outcomeFactor =
          (discovery.winRate - 50) /
          100;

        confidence +=
          outcomeFactor * 0.20;

        patternString +=
          ` | HIST:${discovery.winRate.toFixed(0)}%`;
      }
    }

    // Existing Dynamic DNA factor
    const existingDynamicPattern =
      brainRef.current.dynamicPatterns.find(
        (dp) =>
          dp.dnaHash ===
          dnaHash
      );

    if (
      existingDynamicPattern &&
      existingDynamicPattern.winRate > 65
    ) {
      confidence *= 1.45;

      patternString +=
        ` | DNA WINRATE ${existingDynamicPattern.winRate.toFixed(0)}%`;
    } else if (
      existingDynamicPattern &&
      existingDynamicPattern.winRate < 40 &&
      existingDynamicPattern.winCount +
        existingDynamicPattern.lossCount >= 5
    ) {
      proposedSignal =
        proposedSignal === 'CALL'
          ? 'PUT'
          : 'CALL';

      confidence *= 0.80;

      patternString +=
        ` | WEAK DNA FILTER`;
    }

    // --------------------------------------------------------
    // NEW: level-aware breakout/retest logic
    // --------------------------------------------------------

    if (
      levelContext.retest &&
      levelContext.confirmation
    ) {
      if (
        levelContext.levelType ===
        'SUPPORT'
      ) {
        proposedSignal = 'CALL';
        confidence += 0.12;

        patternString +=
          ' | SUPPORT RETEST CONFIRM';
      }

      if (
        levelContext.levelType ===
        'RESISTANCE'
      ) {
        proposedSignal = 'PUT';
        confidence += 0.12;

        patternString +=
          ' | RESISTANCE RETEST CONFIRM';
      }
    }

    if (
      levelContext.rejection &&
      !levelContext.confirmation
    ) {
      confidence *= 0.85;

      patternString +=
        ' | REJECTIONÃ¢â‚¬â€WAIT FOR CONFIRM';
    }

    // Existing streak shield
    if (
      streakCount >= 5 &&
      streakCount <= 6
    ) {
      isTrapDetected = true;
      confidence *= 0.40;

      patternString +=
        ` | STREAK TRAP ${streakCount}`;
    } else if (
      streakCount >= 7 &&
      streakCount <= 9
    ) {
      isTrapDetected = true;

      proposedSignal =
        streakColor === 'GREEN'
          ? 'PUT'
          : 'CALL';

      confidence *= 1.60;

      patternString +=
        ' | STREAK REVERSAL';
    }

    // Existing wick reversal
    if (
      computedTopWick >
        computedBodySize * 2 ||
      computedBottomWick >
        computedBodySize * 2
    ) {
      proposedSignal =
        proposedSignal === 'CALL'
          ? 'PUT'
          : 'CALL';

      confidence *= 1.4;

      patternString +=
        ' | WICK REVERSAL';
    }

    // Existing SMA/SMMA logic
    if (
      indicators.sma5Trend ===
        'BULLISH' &&
      indicators.smma10Trend ===
        'BULLISH' &&
      indicators.volumeBias ===
        'HIGH_GREEN'
    ) {
      if (
        proposedSignal ===
        'CALL'
      ) {
        confidence *= 1.35;
      }

      patternString +=
        ' | SMA5/SMMA10 BULL CROSS';
    } else if (
      indicators.sma5Trend ===
        'BEARISH' &&
      indicators.smma10Trend ===
        'BEARISH' &&
      indicators.volumeBias ===
        'HIGH_RED'
    ) {
      if (
        proposedSignal ===
        'PUT'
      ) {
        confidence *= 1.35;
      }

      patternString +=
        ' | SMA5/SMMA10 BEAR CROSS';
    }

    // Existing Keltner
    if (
      indicators.keltnerBand ===
      'UPPER_BREAK'
    ) {
      proposedSignal = 'PUT';
      patternString +=
        ' | KELTNER UPPER REVERSAL';
    } else if (
      indicators.keltnerBand ===
      'LOWER_BREAK'
    ) {
      proposedSignal = 'CALL';
      patternString +=
        ' | KELTNER LOWER REVERSAL';
    }

    // Existing ZigZag
    if (matchedZigZag) {
      if (
        matchedZigZag.type ===
        'HIGH'
      ) {
        proposedSignal = 'PUT';
        confidence *= 1.35;

        patternString +=
          ` | ZIGZAG RESISTANCE ${matchedZigZag.occurrences}x`;
      } else {
        proposedSignal = 'CALL';
        confidence *= 1.35;

        patternString +=
          ` | ZIGZAG SUPPORT ${matchedZigZag.occurrences}x`;
      }
    }

    // ========================================================
    // FUSION: Market Structure joins every existing signal source.
    // This is additive/weighted rather than replacing the old logic.
    // ========================================================
    if (structureBias === 'UP') {
      if (proposedSignal === 'CALL') confidence += 0.14;
      else confidence -= 0.08;
      patternString += ' | HH/HL BULLISH STRUCTURE';
    } else if (structureBias === 'DOWN') {
      if (proposedSignal === 'PUT') confidence += 0.14;
      else confidence -= 0.08;
      patternString += ' | LH/LL BEARISH STRUCTURE';
    }

    if (marketStructure) {
      if (marketStructure.structure === 'HH' || marketStructure.structure === 'HL') {
        if (proposedSignal === 'CALL') confidence += 0.06;
      } else if (
        marketStructure.structure === 'LH' ||
        marketStructure.structure === 'LL'
      ) {
        if (proposedSignal === 'PUT') confidence += 0.06;
      }

      if (marketStructure.occurrences >= 3) {
        confidence += 0.03;
        patternString += ` | LEVEL ${marketStructure.structure} ${marketStructure.occurrences}x`;
      }
    }

    // If the structure strongly disagrees with the proposed direction,
    // do not force a reversal; reduce confidence so other engines can win.

    // Normalize confidence
    confidence =
      clamp(
        confidence,
        0,
        0.99
      );

    // Do not allow an unconfirmed discovered pattern
    // to override the entire engine.
    const patternIsMature =
      !!discovery &&
      discovery.occurrences >=
        MIN_PATTERN_OCCURRENCES;

    const analysis: LiveAnalysis =
      {
        pattern:
          patternString,
        sequence:
          strongestSequence
            ? strongestSequence[0].split('')
            : [],
        dominantColor,
        strength:
          confidence,
        priceLevel:
          currentPrice,
        bodySize:
          computedBodySize,
        topWick:
          computedTopWick,
        bottomWick:
          computedBottomWick,
        detectedMagicNumbers:
          relevantMagicNumbers,
        matchedZigZag,
        indicators,
        ocrPrice,
        timestampSecond:
          currentSecond,
        currentMinute,
        timeSyncData,
        streakCount,
        streakColor,
        isTrapDetected,
        dnaHash:
          discovery?.dnaHash ||
          dnaHash,
        discoveryId:
          patternIsMature
            ? discovery!.id
            : null,
        discoveryWinRate:
          discovery &&
          discovery.winCount +
            discovery.lossCount >
            0
            ? discovery.winRate
            : null,
        levelContext,
        patternFeatures:
          observation,
        marketStructure,
        structureBias
      };

    setCurrentAnalysis(
      analysis
    );

    pendingSignalRef.current =
      {
        signal:
          proposedSignal,
        analysis
      };

    setIsScanning(false);

    setStatusMessage(
      `Pattern Discovery complete: ${
        discovery?.id || 'warming up'
      } | ${
        discovery?.occurrences || 0
      } observations`
    );

    void saveBrainToDB();
  };

  // ------------------------------------------------------------
  // Continuous learning
  // ------------------------------------------------------------

  const startContinuousLearning =
    useCallback(
      (_mediaStream: MediaStream) => {
        if (
          continuousLearningRef.current
        ) {
          clearInterval(
            continuousLearningRef.current
          );
        }

        const learnInterval =
          setInterval(() => {
            if (
              !canvasRef.current ||
              !videoRef.current
            ) {
              return;
            }

            const ctx =
              canvasRef.current.getContext(
                '2d',
                {
                  willReadFrequently: true
                }
              );

            if (!ctx) return;

            ctx.drawImage(
              videoRef.current,
              0,
              0,
              800,
              400
            );

            const frameData =
              ctx.getImageData(
                0,
                0,
                800,
                400
              ).data;

            const visual =
              analyzePixelDistribution(
                frameData
              );

            processVisualMarketStructure(
              visual.visualCandles
            );

            const currentColor: CandleColor =
              visual.greenPixels >
              visual.redPixels * 1.05
                ? 'GREEN'
                : visual.redPixels >
                    visual.greenPixels * 1.05
                  ? 'RED'
                  : 'NEUTRAL';

            const currentPrice =
              extractPriceLevel(
                frameData
              );

            if (
              currentPrice > 0
            ) {
              processZigZagLogic(
                currentPrice
              );

              detectMagicNumber(
                currentPrice,
                currentColor,
                lastPriceRef.current,
                lastColorRef.current
              );

              lastPriceRef.current =
                currentPrice;
            }

            const now =
              new Date();

            trackTimeAlgorithm(
              now.getMinutes(),
              now.getSeconds(),
              currentColor
            );

            // Learn a candle feature only when
            // visual structure changes enough.
            const feature =
              buildFeature(
                currentColor,
                visual.actualBodySize,
                visual.actualTopWickSize,
                visual.actualBottomWickSize
              );

            const lastFeature =
              candleFeaturesRef.current[
                candleFeaturesRef.current.length - 1
              ];

            const changed =
              !lastFeature ||
              lastFeature.color !==
                feature.color ||
              Math.abs(
                lastFeature.body -
                feature.body
              ) > 5;

            if (
              currentColor !==
                'NEUTRAL' &&
              changed
            ) {
              candleFeaturesRef.current.push(
                feature
              );

              if (
                candleFeaturesRef.current.length >
                MAX_CANDLES
              ) {
                candleFeaturesRef.current.shift();
              }

              const indicators =
                calculateInternalIndicators(
                  currentPrice
                );

              const level =
                classifyLevelContext(
                  currentPrice
                );

              const recent =
                getRecentFeatures(5);

              if (
                recent.length >= 3
              ) {
                const direction =
                  calculatePatternDirection(
                    recent,
                    level
                  );

                const observation:
                  PatternObservation =
                  {
                    dnaHash: '',
                    sequence:
                      buildSequenceFromFeatures(
                        recent
                      ),
                    direction,
                    context:
                      buildContextSignature(
                        level,
                        indicators
                      ),
                    createdAt:
                      Date.now(),
                    priceLevel:
                      currentPrice,
                    bodyRatio:
                      feature.bodyRatio,
                    topWickRatio:
                      feature.topWickRatio,
                    bottomWickRatio:
                      feature.bottomWickRatio,
                    nearLevel:
                      level.nearLevel,
                    breakoutRetest:
                      level.breakout ||
                      level.retest
                  };

                const discovery =
                  discoverPattern(
                    observation,
                    indicators
                  );

                if (
                  discovery
                ) {
                  discovery.lastSeen =
                    Date.now();
                }
              }
            }

            lastColorRef.current =
              currentColor;
          }, 500);

        continuousLearningRef.current =
          learnInterval;
      },
      [
        calculateInternalIndicators,
        classifyLevelContext,
        detectMagicNumber,
        discoverPattern,
        processZigZagLogic,
        processVisualMarketStructure,
        trackTimeAlgorithm
      ]
    );

  // ------------------------------------------------------------
  // Screen connection
  // ------------------------------------------------------------

  const connectStream =
    async () => {
      try {
        const mediaStream =
          await navigator.mediaDevices.getDisplayMedia(
            {
              video: {
                displaySurface:
                  'browser',
                width: {
                  ideal: 1280
                },
                height: {
                  ideal: 720
                },
                frameRate: {
                  ideal: 30
                }
              } as MediaTrackConstraints,
              audio: false
            }
          );

        setStream(
          mediaStream
        );

        if (
          videoRef.current
        ) {
          videoRef.current.srcObject =
            mediaStream;

          await videoRef.current.play();
        }

        const videoTrack =
          mediaStream.getVideoTracks()[0];

        videoTrack.addEventListener(
          'ended',
          () => {
            disconnectStream();
          }
        );

        setIsStreamActive(
          true
        );

        setStatusMessage(
          'Connected. Vision + Self-Learning Pattern Discovery active.'
        );

        startContinuousLearning(
          mediaStream
        );
      } catch (err) {
        console.error(err);

        setStatusMessage(
          'Connection failed. Please share your chart screen.'
        );
      }
    };

  const disconnectStream =
    () => {
      if (
        continuousLearningRef.current
      ) {
        clearInterval(
          continuousLearningRef.current
        );

        continuousLearningRef.current =
          null;
      }

      stream
        ?.getTracks()
        .forEach(
          (track) =>
            track.stop()
        );

      setStream(null);
      setIsStreamActive(false);
      setIsScanning(false);
      setAiSignal('WAIT');

      pendingSignalRef.current =
        null;

      setStatusMessage(
        'Brain paused. Learned pattern memory preserved.'
      );
    };

  // ------------------------------------------------------------
  // Analysis trigger
  // ------------------------------------------------------------

  const triggerAnalysis =
    () => {
      if (
        !isStreamActive ||
        !videoRef.current
      ) {
        setStatusMessage(
          'Error: Connect screen first!'
        );
        return;
      }

      setIsScanning(
        true
      );

      setAiSignal(
        'WAIT'
      );

      setStatusMessage(
        'Scanning candles + discovering patterns + checking levels...'
      );

      const samples: {
        green: number;
        red: number;
        regions: {
          x: number;
          color: 'GREEN' | 'RED';
        }[];
        body: number;
        topW: number;
        botW: number;
        visualCandles: VisualCandlePoint[];
      }[] = [];

      const sampleInterval =
        setInterval(
          () => {
            if (
              !canvasRef.current ||
              !videoRef.current
            ) {
              return;
            }

            const ctx =
              canvasRef.current.getContext(
                '2d',
                {
                  willReadFrequently: true
                }
              );

            if (!ctx) return;

            ctx.drawImage(
              videoRef.current,
              0,
              0,
              800,
              400
            );

            const frameData =
              ctx.getImageData(
                0,
                0,
                800,
                400
              ).data;

            const analysis =
              analyzePixelDistribution(
                frameData
              );

            processVisualMarketStructure(
              analysis.visualCandles
            );

            samples.push({
              green:
                analysis.greenPixels,
              red:
                analysis.redPixels,
              regions:
                analysis.candleRegions,
              body:
                analysis.actualBodySize,
              topW:
                analysis.actualTopWickSize,
              botW:
                analysis.actualBottomWickSize,
              visualCandles:
                analysis.visualCandles
            });
          },
          200
        );

      setTimeout(
        () => {
          clearInterval(
            sampleInterval
          );

          finalizeAnalysis(
            samples
          );
        },
        46000
      );
    };

  // ------------------------------------------------------------
  // Candle timing
  // ------------------------------------------------------------

  useEffect(() => {
    const candleSync =
      setInterval(
        () => {
          const now =
            new Date();

          const seconds =
            now.getSeconds();

          const milliseconds =
            now.getMilliseconds();

          const timeUntilNext =
            60 -
            seconds -
            milliseconds /
              1000;

          setTimeUntilCandle(
            Math.ceil(
              timeUntilNext
            )
          );

          if (
            pendingSignalRef.current &&
            seconds === 0 &&
            milliseconds < 250
          ) {
            const pending =
              pendingSignalRef.current;

            setAiSignal(
              pending.signal
            );

            setStatusMessage(
              `SIGNAL ACTIVE | Price: ${pending.analysis.priceLevel.toFixed(5)} | Pattern: ${
                pending.analysis.discoveryId ||
                'base'
              }`
            );

            pendingSignalRef.current =
              null;
          }
        },
        50
      );

    return () =>
      clearInterval(
        candleSync
      );
  }, []);

  useEffect(() => {
    return () => {
      if (
        continuousLearningRef.current
      ) {
        clearInterval(
          continuousLearningRef.current
        );
      }

      stream
        ?.getTracks()
        .forEach(
          (track) =>
            track.stop()
        );
    };
  }, [stream]);

  // ------------------------------------------------------------
  // Outcome learning
  // ------------------------------------------------------------

  const logTradeOutcome =
    (result: 'WIN' | 'LOSS') => {
      if (
        aiSignal === 'WAIT' ||
        !currentAnalysis
      ) {
        return;
      }

      const brain =
        brainRef.current;

      const patternId =
        `${currentAnalysis.bodySize.toFixed(0)}_${Date.now()}`;

      // Existing DNA learning
      processDynamicPatternLearning(
        currentAnalysis.dnaHash,
        currentAnalysis.sequence.join(''),
        result
      );

      // NEW discovered pattern learning
      updateDiscoveryOutcome(
        currentAnalysis.discoveryId,
        result
      );

      brain.patterns.push({
        id: patternId,
        pattern:
          currentAnalysis.pattern,
        sequenceLength:
          currentAnalysis.sequence.length,
        priceLevel:
          currentAnalysis.priceLevel,
        priceRange:
          getPriceRange(
            currentAnalysis.priceLevel
          ),
        bodySize:
          currentAnalysis.bodySize,
        topWickSize:
          currentAnalysis.topWick,
        bottomWickSize:
          currentAnalysis.bottomWick,
        result,
        timestamp:
          Date.now(),
        timeSync:
          currentAnalysis.timestampSecond,
        minuteMarker:
          currentAnalysis.currentMinute,
        confidence:
          currentAnalysis.strength,
        streakCount:
          currentAnalysis.streakCount,
        dnaHash:
          currentAnalysis.dnaHash,
        discoveryId:
          currentAnalysis.discoveryId ||
          undefined
      });

      // Existing ZigZag adaptation
      if (
        currentAnalysis.matchedZigZag
      ) {
        const found =
          brain.zigzagLevels.find(
            (zl) =>
              zl.price ===
              currentAnalysis
                ?.matchedZigZag
                ?.price
          );

        if (
          found &&
          result === 'LOSS'
        ) {
          found.occurrences =
            Math.max(
              1,
              found.occurrences - 1
            );
        }
      }

      // Existing magic-number adaptation
      currentAnalysis.detectedMagicNumbers.forEach(
        (mn) => {
          const found =
            brain.magicNumbers.find(
              (bmn) =>
                bmn.priceLevel ===
                  mn.priceLevel &&
                bmn.priceRange ===
                  mn.priceRange
            );

          if (found) {
            found.successRate =
              result === 'WIN'
                ? Math.min(
                    1,
                    found.successRate +
                      0.1
                  )
                : Math.max(
                    0,
                    found.successRate -
                      0.1
                  );
          }
        }
      );

      // Existing time adaptation
      if (
        currentAnalysis.timeSyncData
      ) {
        const ta =
          brain.timeAlgorithms.find(
            (t) =>
              t.secondMarker ===
                currentAnalysis
                  .timestampSecond &&
              t.minuteMarker ===
                currentAnalysis
                  .currentMinute
          );

        if (ta) {
          ta.successRate =
            result === 'WIN'
              ? Math.min(
                  1,
                  ta.successRate +
                    0.05
                )
              : Math.max(
                  0,
                  ta.successRate -
                    0.05
                );
        }
      }

      brain.totalTrades++;

      const wins =
        brain.patterns.filter(
          (p) =>
            p.result ===
            'WIN'
        ).length;

      brain.winRate =
        brain.patterns.length >
        0
          ? (wins /
              brain.patterns.length) *
            100
          : 0;

      void saveBrainToDB();

      const discovery =
        currentAnalysis.discoveryId
          ? brain.discoveries.find(
              (d) =>
                d.id ===
                currentAnalysis.discoveryId
            )
          : null;

      setStatusMessage(
        `Outcome ${result} saved. ${
          discovery
            ? `${discovery.id}: ${discovery.winRate.toFixed(1)}% after ${
                discovery.winCount +
                discovery.lossCount
              } outcomes.`
            : 'Base DNA updated.'
        }`
      );

      setAiSignal(
        'WAIT'
      );

      setCurrentAnalysis(
        null
      );
    };

  // ------------------------------------------------------------
  // Brain reset
  // ------------------------------------------------------------

  const clearBrain =
    async () => {
      const password =
        prompt(
          'Enter Master Password to Reset Brain Memory:'
        );

      if (
        password ===
        'YODDHAX_REBORN'
      ) {
        if (
          confirm(
            'This erases all YoddhaX learning records. Continue?'
          )
        ) {
          brainRef.current =
            initialBrain();

          lastVisualStructureSignatureRef.current = '';
          candleFeaturesRef.current =
            [];

          priceHistoryRef.current =
            [];

          smmaPreviousRef.current =
            null;

          await saveBrainToDB();

          setCurrentAnalysis(
            null
          );

          setAiSignal(
            'WAIT'
          );

          setStatusMessage(
            'Brain reset complete. New self-learning cycle started.'
          );
        }
      } else if (
        password !== null
      ) {
        alert(
          'Access Denied.'
        );
      }
    };

  // ------------------------------------------------------------
  // Crop box controls
  // ------------------------------------------------------------

  const handleMouseDown =
    (e: React.MouseEvent) => {
      setIsDragging(
        true
      );

      setDragStart({
        x: e.clientX,
        y: e.clientY
      });
    };

  const handleMouseMove =
    (e: React.MouseEvent) => {
      if (
        !isDragging ||
        !containerRef.current
      ) {
        return;
      }

      const rect =
        containerRef.current.getBoundingClientRect();

      const deltaX =
        ((e.clientX -
          dragStart.x) /
          rect.width) *
        100;

      const deltaY =
        ((e.clientY -
          dragStart.y) /
          rect.height) *
        100;

      setCropBox(
        (prev) => ({
          ...prev,
          x: clamp(
            prev.x + deltaX,
            0,
            100 -
              prev.width
          ),
          y: clamp(
            prev.y + deltaY,
            0,
            100 -
              prev.height
          )
        })
      );

      setDragStart({
        x: e.clientX,
        y: e.clientY
      });
    };

  const handleMouseUp =
    () => {
      setIsDragging(
        false
      );
    };

  const adjustBoxSize =
    (
      dw: number,
      dh: number
    ) => {
      setCropBox(
        (prev) => ({
          ...prev,
          width: clamp(
            prev.width + dw,
            10,
            100 - prev.x
          ),
          height: clamp(
            prev.height + dh,
            10,
            100 - prev.y
          )
        })
      );
    };

  const topDiscoveries =
    [...brainRef.current.discoveries]
      .sort(
        (a, b) =>
          b.occurrences -
          a.occurrences
      )
      .slice(0, 5);

  return (
    <div className="min-h-screen bg-[#040814] text-slate-100 font-sans select-none">
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-cyan-400 tracking-wider">
              YODDHA X FUSION ENGINE v5 â€” MARKET STRUCTURE FUSION
            </h1>

            <p className="text-slate-500 text-sm">
              Vision + Existing Brain + Self-Learning + HH/HL/LH/LL Market Structure
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right mr-2">
              <div className="text-xs text-slate-500">
                Discovered Intelligence
              </div>

              <div className="text-sm font-mono text-emerald-400">
                {brainStats.discoveries} discovered |{' '}
                {brainStats.dynamicPatterns} DNA
              </div>
            </div>

            {!isStreamActive ? (
              <button
                onClick={connectStream}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-all"
              >
                Connect Chart Screen
              </button>
            ) : (
              <button
                onClick={disconnectStream}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-all"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4">
            <div className="bg-[#0f172a] rounded-xl p-5 border border-slate-800">
              <button
                onClick={triggerAnalysis}
                disabled={
                  !isStreamActive ||
                  isScanning
                }
                className={`w-full py-4 rounded-xl font-bold text-lg ${
                  !isStreamActive ||
                  isScanning
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                }`}
              >
                {isScanning
                  ? 'SCANNING + DISCOVERING...'
                  : 'ANALYZE & DISCOVER PATTERN'}
              </button>

              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-slate-500">
                  Next Candle:
                </span>

                <span className="font-mono text-xl text-amber-400">
                  {timeUntilCandle}s
                </span>
              </div>
            </div>

            <div className="bg-[#0f172a] rounded-xl p-5 border border-slate-800">
              <h3 className="text-xs font-bold text-cyan-400 uppercase mb-3">
                Vision Boundary
              </h3>

              <div className="grid grid-cols-2 gap-2 mb-2">
                <button
                  onClick={() =>
                    adjustBoxSize(5, 0)
                  }
                  className="py-1.5 bg-slate-800 rounded"
                >
                  Width +
                </button>

                <button
                  onClick={() =>
                    adjustBoxSize(-5, 0)
                  }
                  className="py-1.5 bg-slate-800 rounded"
                >
                  Width -
                </button>

                <button
                  onClick={() =>
                    adjustBoxSize(0, 5)
                  }
                  className="py-1.5 bg-slate-800 rounded"
                >
                  Height +
                </button>

                <button
                  onClick={() =>
                    adjustBoxSize(0, -5)
                  }
                  className="py-1.5 bg-slate-800 rounded"
                >
                  Height -
                </button>
              </div>

              <p className="text-[10px] text-slate-500 font-mono">
                X:{cropBox.x.toFixed(0)}% Y:
                {cropBox.y.toFixed(0)}% |{' '}
                {cropBox.width.toFixed(0)}x
                {cropBox.height.toFixed(0)}%
              </p>
            </div>

            <div className="bg-[#0f172a] rounded-xl p-5 border border-slate-800">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-4">
                Brain Analytics
              </h3>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">
                    Historical Outcomes
                  </span>
                  <span className="font-bold text-purple-400">
                    {brainStats.patterns}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-500">
                    AI-Created DNA
                  </span>
                  <span className="font-bold text-cyan-400">
                    {brainStats.dynamicPatterns}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-500">
                    Discovered Patterns
                  </span>
                  <span className="font-bold text-emerald-400">
                    {brainStats.discoveries}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-500">
                    ZigZag Levels
                  </span>
                  <span className="font-bold text-amber-400">
                    {brainStats.zigzag}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-500">
                    HH / HL / LH / LL Levels
                  </span>
                  <span className="font-bold text-cyan-400">
                    {brainStats.marketStructure}
                  </span>
                </div>

                <div className="flex justify-between border-t border-slate-700 pt-3">
                  <span className="text-slate-500">
                    System Win Rate
                  </span>

                  <span className="font-bold text-emerald-400">
                    {brainStats.winRate.toFixed(1)}%
                  </span>
                </div>
              </div>

              <button
                onClick={clearBrain}
                className="mt-4 w-full py-2 text-xs text-slate-600 hover:text-red-400"
              >
                Emergency Reset Brain Memory
              </button>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="bg-[#0f172a] rounded-xl p-5 border border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      isStreamActive
                        ? 'bg-emerald-400 animate-pulse'
                        : 'bg-slate-600'
                    }`}
                  />

                  <span className="text-xs font-bold text-slate-400">
                    LIVE VISION + PATTERN DISCOVERY
                  </span>
                </div>

                <span className="text-[11px] text-cyan-400 font-mono">
                  Candle Ã¢â€ â€™ Features Ã¢â€ â€™ DNA Ã¢â€ â€™ Learning
                </span>
              </div>

              <div
                ref={containerRef}
                onMouseMove={
                  handleMouseMove
                }
                onMouseUp={
                  handleMouseUp
                }
                onMouseLeave={
                  handleMouseUp
                }
                className="relative bg-[#020617] rounded-lg aspect-video flex items-center justify-center overflow-hidden border border-slate-900 cursor-crosshair"
              >
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${
                    isStreamActive
                      ? 'block'
                      : 'hidden'
                  }`}
                />

                {!isStreamActive && (
                  <div className="text-center">
                    <p className="text-slate-500 font-medium">
                      Connect your chart screen.
                    </p>
                  </div>
                )}

                {isStreamActive && (
                  <div
                    onMouseDown={
                      handleMouseDown
                    }
                    style={{
                      left: `${cropBox.x}%`,
                      top: `${cropBox.y}%`,
                      width: `${cropBox.width}%`,
                      height: `${cropBox.height}%`
                    }}
                    className="absolute border-2 border-cyan-400 bg-cyan-500/10 cursor-move"
                  >
                    <span className="absolute top-1 left-2 bg-slate-950/80 px-1.5 py-0.5 text-[9px] text-cyan-300 rounded font-mono">
                      SELF-LEARNING SCANNER
                    </span>
                  </div>
                )}
              </div>

              <canvas
                ref={canvasRef}
                width="800"
                height="400"
                className="hidden"
              />

              <div className="mt-3 px-4 py-2 bg-[#020617] rounded-lg border-l-4 border-cyan-500">
                <p className="text-xs text-slate-400">
                  <strong className="text-cyan-400">
                    Console:
                  </strong>{' '}
                  {statusMessage}
                </p>
              </div>
            </div>

            {currentAnalysis && (
              <div className="bg-[#0f172a] rounded-xl p-5 border border-slate-800">
                <h3 className="text-xs font-bold text-cyan-400 uppercase mb-3">
                  Current Pattern Intelligence
                </h3>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="bg-slate-900 p-3 rounded">
                    <div className="text-slate-500">
                      Pattern
                    </div>
                    <div className="text-cyan-300 font-mono mt-1">
                      {currentAnalysis.discoveryId ||
                        'WARMING'}
                    </div>
                  </div>

                  <div className="bg-slate-900 p-3 rounded">
                    <div className="text-slate-500">
                      Sequence
                    </div>
                    <div className="font-mono mt-1">
                      {currentAnalysis.patternFeatures.sequence}
                    </div>
                  </div>

                  <div className="bg-slate-900 p-3 rounded">
                    <div className="text-slate-500">
                      Level
                    </div>
                    <div className="font-mono mt-1">
                      {currentAnalysis.levelContext.levelType}
                    </div>
                  </div>

                  <div className="bg-slate-900 p-3 rounded">
                    <div className="text-slate-500">
                      Market Structure
                    </div>
                    <div className="font-mono mt-1 text-cyan-300">
                      {currentAnalysis.marketStructure?.structure || 'WARMING'}
                      {' / '}
                      {currentAnalysis.structureBias}
                    </div>
                  </div>

                  <div className="bg-slate-900 p-3 rounded">
                    <div className="text-slate-500">
                      Historical
                    </div>
                    <div className="font-mono mt-1">
                      {currentAnalysis.discoveryWinRate !==
                      null
                        ? `${currentAnalysis.discoveryWinRate.toFixed(
                            1
                          )}%`
                        : 'N/A'}
                    </div>
                  </div>
                </div>

                <p className="mt-4 text-xs text-slate-400 leading-relaxed">
                  {currentAnalysis.pattern}
                </p>
              </div>
            )}

            <div className="bg-[#0f172a] rounded-xl p-5 border border-slate-800">
              <h3 className="text-xs font-bold text-emerald-400 uppercase mb-3">
                Top Discovered Patterns
              </h3>

              {topDiscoveries.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No mature patterns yet. Keep observing historical candles.
                </p>
              ) : (
                <div className="space-y-2">
                  {topDiscoveries.map(
                    (item) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-5 gap-2 bg-slate-900 rounded p-2 text-[10px] font-mono"
                      >
                        <span className="text-cyan-300">
                          {item.id}
                        </span>

                        <span>
                          {item.sequence}
                        </span>

                        <span>
                          {item.direction}
                        </span>

                        <span>
                          {item.occurrences}x
                        </span>

                        <span>
                          {item.winCount +
                            item.lossCount >
                          0
                            ? `${item.winRate.toFixed(
                                0
                              )}%`
                            : 'Learning'}
                        </span>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>

            <div className="bg-[#0f172a] rounded-xl p-6 border border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <span className="px-3 py-1 bg-purple-900/50 text-purple-300 text-xs font-bold rounded">
                  YODDHAX EXECUTOR SWITCH
                </span>

                <span className="text-xs text-slate-500 font-mono">
                  Sync: :00
                </span>
              </div>

              <div className="text-center py-8">
                <div
                  className={`inline-block px-14 py-6 rounded-2xl text-6xl font-black tracking-widest border-4 ${
                    aiSignal === 'CALL'
                      ? 'bg-emerald-500/10 border-emerald-400 text-emerald-400'
                      : aiSignal === 'PUT'
                        ? 'bg-red-500/10 border-red-400 text-red-400'
                        : 'bg-slate-800 border-slate-700 text-slate-600'
                  }`}
                >
                  {aiSignal}
                </div>
              </div>

              {aiSignal !== 'WAIT' &&
                currentAnalysis && (
                  <div className="mt-4 pt-4 border-t border-slate-800">
                    <p className="text-xs text-slate-400 text-center mb-3">
                      Record the actual next-candle outcome to teach the pattern.
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() =>
                          logTradeOutcome(
                            'WIN'
                          )
                        }
                        className="py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg"
                      >
                        WIN Ã¢â‚¬â€ Teach Pattern
                      </button>

                      <button
                        onClick={() =>
                          logTradeOutcome(
                            'LOSS'
                          )
                        }
                        className="py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg"
                      >
                        LOSS Ã¢â‚¬â€ Adapt Pattern
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
