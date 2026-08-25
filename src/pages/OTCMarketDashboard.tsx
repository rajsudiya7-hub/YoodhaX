import React, { useState, useEffect, useRef, useCallback } from 'react';

// ============================================================
// YODDHA X FUSION ENGINE v4
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
}

interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}


interface PriceAxisBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PriceAxisLabel {
  value: number;
  y: number;
  confidence: number;
}

interface RealCandleGeometry extends CandleFeature {
  x: number;
  yHigh: number;
  yLow: number;
  yBodyTop: number;
  yBodyBottom: number;
  openPrice: number | null;
  closePrice: number | null;
  highPrice: number | null;
  lowPrice: number | null;
  confidence: number;
}

interface VisualPriceLevel {
  price: number;
  yPercent: number;
  type: 'SUPPORT' | 'RESISTANCE';
  occurrences: number;
  confidence: number;
}

interface BrainState {
  patterns: PatternMemory[];
  dynamicPatterns: DynamicPattern[];
  discoveries: PatternDiscovery[];
  magicNumbers: MagicNumber[];
  timeAlgorithms: TimeAlgorithm[];
  zigzagLevels: ZigZagLevel[];
  totalTrades: number;
  winRate: number;
  lastUpdated: number;
}

const DB_NAME = 'YoddhaX_AI_Database';
const DB_VERSION = 3;
const STORE_NAME = 'brain_state_store';

const MAX_CANDLES = 80;
const MIN_PATTERN_OCCURRENCES = 5;
const MAX_DISCOVERIES = 1500;

const initialBrain = (): BrainState => ({
  patterns: [],
  dynamicPatterns: [],
  discoveries: [],
  magicNumbers: [],
  timeAlgorithms: [],
  zigzagLevels: [],
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
  const [realPrice, setRealPrice] = useState<number | null>(null);
  const [priceAxisStatus, setPriceAxisStatus] = useState('Price-axis OCR waiting...');
  const [visualPriceLevels, setVisualPriceLevels] = useState<VisualPriceLevel[]>([]);
  const [liveCandleGeometry, setLiveCandleGeometry] = useState<RealCandleGeometry[]>([]);
  const [priceAxisBox, setPriceAxisBox] = useState<PriceAxisBox>({
    x: 82,
    y: 0,
    width: 18,
    height: 100
  });

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
  // Real market-price state. Never fabricate a price when OCR has not found one.
  const realPriceRef = useRef<number | null>(null);
  const priceAxisLabelsRef = useRef<PriceAxisLabel[]>([]);
  const ocrWorkerRef = useRef<any>(null);
  const ocrBusyRef = useRef(false);
  const lastOcrAtRef = useRef(0);
  const lastVisualLevelsAtRef = useRef(0);

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
            zigzagLevels: saved.zigzagLevels || []
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

  // ------------------------------------------------------------
  // REAL PRICE AXIS OCR
  // ------------------------------------------------------------
  // The old implementation generated fake prices from pixel counts.
  // This implementation reads the actual numeric labels rendered by the
  // shared chart. The last confirmed OCR price is cached and reused until
  // a newer real value is detected. No synthetic base price is generated.

  const normalizeOcrNumber = (raw: string): number | null => {
    let text = raw
      .replace(/[Oo]/g, '0')
      .replace(/[Il|]/g, '1')
      .replace(/[,]/g, '')
      .replace(/[^\d.\-]/g, '');

    if (!text) return null;

    // Avoid accepting a decimal with multiple dots.
    const firstDot = text.indexOf('.');
    if (firstDot >= 0) {
      text =
        text.slice(0, firstDot + 1) +
        text.slice(firstDot + 1).replace(/\./g, '');
    }

    const value = Number(text);
    if (!Number.isFinite(value) || value <= 0) return null;

    // OTC/forex chart prices are commonly 3-6 decimal digits.
    const decimals = text.includes('.')
      ? text.split('.')[1]?.length ?? 0
      : 0;

    if (decimals < 2 || decimals > 8) return null;
    return value;
  };

  const buildPriceAxisImage = (
    source: HTMLVideoElement
  ): HTMLCanvasElement => {
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = 800;
    sourceCanvas.height = 400;

    const sourceCtx = sourceCanvas.getContext('2d', {
      willReadFrequently: true
    });

    if (!sourceCtx) return sourceCanvas;

    sourceCtx.drawImage(source, 0, 0, 800, 400);

    const sx = Math.max(
      0,
      Math.floor((priceAxisBox.x / 100) * 800)
    );
    const sy = Math.max(
      0,
      Math.floor((priceAxisBox.y / 100) * 400)
    );
    const sw = Math.min(
      800 - sx,
      Math.floor((priceAxisBox.width / 100) * 800)
    );
    const sh = Math.min(
      400 - sy,
      Math.floor((priceAxisBox.height / 100) * 400)
    );

    const ocrCanvas = document.createElement('canvas');
    ocrCanvas.width = Math.max(320, sw * 3);
    ocrCanvas.height = Math.max(200, sh * 3);

    const ocrCtx = ocrCanvas.getContext('2d', {
      willReadFrequently: true
    });

    if (!ocrCtx) return ocrCanvas;

    ocrCtx.imageSmoothingEnabled = false;
    ocrCtx.drawImage(
      sourceCanvas,
      sx,
      sy,
      sw,
      sh,
      0,
      0,
      ocrCanvas.width,
      ocrCanvas.height
    );

    // Improve OCR against dark chart backgrounds.
    const image = ocrCtx.getImageData(
      0,
      0,
      ocrCanvas.width,
      ocrCanvas.height
    );

    for (let i = 0; i < image.data.length; i += 4) {
      const r = image.data[i];
      const g = image.data[i + 1];
      const b = image.data[i + 2];
      const luminance =
        0.299 * r + 0.587 * g + 0.114 * b;

      const v = luminance > 145 ? 255 : 0;
      image.data[i] = v;
      image.data[i + 1] = v;
      image.data[i + 2] = v;
      image.data[i + 3] = 255;
    }

    ocrCtx.putImageData(image, 0, 0);
    return ocrCanvas;
  };

  const detectPriceLineY = (
    frameData: Uint8ClampedArray
  ): number | null => {
    const xStart = Math.max(
      0,
      Math.floor((priceAxisBox.x / 100) * 800)
    );
    const xEnd = Math.min(
      800,
      Math.floor(
        ((priceAxisBox.x + priceAxisBox.width) / 100) * 800
      )
    );
    const yStart = Math.max(
      0,
      Math.floor((priceAxisBox.y / 100) * 400)
    );
    const yEnd = Math.min(
      400,
      Math.floor(
        ((priceAxisBox.y + priceAxisBox.height) / 100) * 400
      )
    );

    let bestY: number | null = null;
    let bestScore = 0;

    for (let y = yStart; y < yEnd; y++) {
      let score = 0;

      for (let x = xStart; x < xEnd; x++) {
        const i = (y * 800 + x) * 4;
        const r = frameData[i];
        const g = frameData[i + 1];
        const b = frameData[i + 2];

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);

        // Price markers/lines are normally brighter and/or saturated
        // than the dark axis background.
        if (max > 150 && max - min > 35) score++;
        else if (max > 190 && min > 150) score += 0.5;
      }

      if (score > bestScore) {
        bestScore = score;
        bestY = y;
      }
    }

    return bestScore >= Math.max(3, (xEnd - xStart) * 0.08)
      ? bestY
      : null;
  };

  const estimatePriceFromAxisLabels = (
    labels: PriceAxisLabel[],
    priceLineY: number | null
  ): number | null => {
    if (!labels.length) return null;

    const sorted = [...labels].sort((a, b) => a.y - b.y);

    // If the chart exposes several axis labels, interpolate price from
    // their actual screen positions.
    if (priceLineY !== null && sorted.length >= 2) {
      let lower: PriceAxisLabel | null = null;
      let upper: PriceAxisLabel | null = null;

      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i];
        const b = sorted[i + 1];

        if (priceLineY >= a.y && priceLineY <= b.y) {
          upper = a;
          lower = b;
          break;
        }
      }

      if (upper && lower && Math.abs(lower.y - upper.y) > 1) {
        const t =
          (priceLineY - upper.y) /
          (lower.y - upper.y);

        return upper.value +
          (lower.value - upper.value) * t;
      }
    }

    // If no price line can be found, use the most confident label as
    // the current visible market reference rather than inventing a value.
    const best = [...sorted].sort(
      (a, b) => b.confidence - a.confidence
    )[0];

    return best?.value ?? null;
  };

  const runRealPriceOCR = useCallback(
    async () => {
      if (
        !videoRef.current ||
        !canvasRef.current ||
        ocrBusyRef.current
      ) {
        return;
      }

      const now = Date.now();
      if (now - lastOcrAtRef.current < 1200) return;

      ocrBusyRef.current = true;
      lastOcrAtRef.current = now;

      try {
        if (!ocrWorkerRef.current) {
          const mod = await import('tesseract.js');
          const createWorker = mod.createWorker;
          const worker = await createWorker('eng');

          try {
            await worker.setParameters({
              tessedit_char_whitelist:
                '0123456789.-',
              preserve_interword_spaces: '1'
            });
          } catch {
            // Older Tesseract versions may not expose all parameters.
          }

          ocrWorkerRef.current = worker;
        }

        const axisCanvas = buildPriceAxisImage(
          videoRef.current
        );

        const result =
          await ocrWorkerRef.current.recognize(
            axisCanvas
          );

        const words =
          result?.data?.words ?? [];

        const labels: PriceAxisLabel[] = [];

        for (const word of words) {
          const value =
            normalizeOcrNumber(word.text || '');

          if (value === null) continue;

          const confidence =
            Number(word.confidence) || 0;

          if (confidence < 35) continue;

          const bbox = word.bbox;
          if (!bbox) continue;

          // bbox is in the upscaled OCR canvas. Convert back to the
          // original 800x400 screen coordinate system.
          const scaleX =
            Math.max(1, axisCanvas.width) /
            Math.max(
              1,
              (priceAxisBox.width / 100) * 800
            );
          const scaleY =
            Math.max(1, axisCanvas.height) /
            Math.max(
              1,
              (priceAxisBox.height / 100) * 400
            );

          const centerY =
            priceAxisBox.y / 100 * 400 +
            ((bbox.y0 + bbox.y1) / 2) / scaleY;

          labels.push({
            value,
            y: centerY,
            confidence
          });
        }

        // Deduplicate OCR hallucinations near the same y position.
        labels.sort((a, b) => a.y - b.y);

        const deduped: PriceAxisLabel[] = [];
        for (const label of labels) {
          const previous = deduped[deduped.length - 1];

          if (
            previous &&
            Math.abs(previous.y - label.y) < 8
          ) {
            if (label.confidence > previous.confidence) {
              deduped[deduped.length - 1] = label;
            }
          } else {
            deduped.push(label);
          }
        }

        if (deduped.length > 0) {
          priceAxisLabelsRef.current = deduped;
        }

        const frameCtx =
          canvasRef.current.getContext('2d', {
            willReadFrequently: true
          });

        if (!frameCtx) return;

        frameCtx.drawImage(
          videoRef.current,
          0,
          0,
          800,
          400
        );

        const frame =
          frameCtx.getImageData(
            0,
            0,
            800,
            400
          ).data;

        const lineY = detectPriceLineY(frame);

        const detected =
          estimatePriceFromAxisLabels(
            priceAxisLabelsRef.current,
            lineY
          );

        if (
          detected !== null &&
          Number.isFinite(detected) &&
          detected > 0
        ) {
          const normalized =
            Number(detected.toFixed(6));

          realPriceRef.current = normalized;
          setRealPrice(normalized);
          setPriceAxisStatus(
            `LIVE PRICE ${normalized.toFixed(6)} | ${priceAxisLabelsRef.current.length} axis labels`
          );
        } else {
          setPriceAxisStatus(
            'Price axis visible, but a reliable numeric value was not detected yet.'
          );
        }
      } catch (error) {
        console.error('Real price OCR failure:', error);
        setPriceAxisStatus(
          'OCR unavailable. Install tesseract.js and keep the price axis inside the OCR box.'
        );
      } finally {
        ocrBusyRef.current = false;
      }
    },
    [priceAxisBox]
  );

  const extractOCRPriceData = (
    _frameData: Uint8ClampedArray
  ): number => {
    return realPriceRef.current ?? 0;
  };

  const extractPriceLevel = (
    _frameData: Uint8ClampedArray
  ): number => {
    // IMPORTANT: Never fabricate a market price.
    return realPriceRef.current ?? 0;
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
  // NEW: Real-price visual candle + level engine
  // Existing logic remains active; this layer only adds validated
  // screen-derived OHLC geometry and visual price levels.
  // ------------------------------------------------------------

  const priceAtPixelY = useCallback((y: number): number | null => {
    const labels = [...priceAxisLabelsRef.current]
      .filter((l) => Number.isFinite(l.value) && Number.isFinite(l.y))
      .sort((a, b) => a.y - b.y);
    if (labels.length < 2) return realPriceRef.current ?? null;

    for (let i = 0; i < labels.length - 1; i++) {
      const a = labels[i];
      const b = labels[i + 1];
      if (y >= a.y && y <= b.y && b.y !== a.y) {
        const t = (y - a.y) / (b.y - a.y);
        return a.value + (b.value - a.value) * t;
      }
    }

    const a = labels[0];
    const b = labels[labels.length - 1];
    if (b.y !== a.y) {
      const t = (y - a.y) / (b.y - a.y);
      return a.value + (b.value - a.value) * t;
    }
    return null;
  }, []);

  const detectRealCandleGeometry = useCallback((frameData: Uint8ClampedArray): RealCandleGeometry[] => {
    const x0 = Math.floor((cropBox.x / 100) * 800);
    const x1 = Math.min(800, Math.floor(((cropBox.x + cropBox.width) / 100) * 800));
    const y0 = Math.floor((cropBox.y / 100) * 400);
    const y1 = Math.min(400, Math.floor(((cropBox.y + cropBox.height) / 100) * 400));
    const columns: { x:number; green:number; red:number; ys:number[] }[] = [];

    for (let x = x0; x < x1; x++) {
      let green = 0, red = 0;
      const ys: number[] = [];
      for (let y = y0; y < y1; y++) {
        const i = (y * 800 + x) * 4;
        const r = frameData[i], g = frameData[i+1], b = frameData[i+2];
        const isGreen = g > r + 30 && g > b + 30;
        const isRed = r > g + 30 && r > b + 30;
        if (isGreen || isRed) { ys.push(y); if (isGreen) green++; else red++; }
      }
      if (ys.length >= 3) columns.push({ x, green, red, ys });
    }

    // Merge adjacent colored columns into individual candle candidates.
    const groups: typeof columns[] = [];
    let group: typeof columns = [];
    for (const c of columns) {
      if (!group.length || c.x - group[group.length - 1].x <= 2) group.push(c);
      else { if (group.length >= 2) groups.push(group); group = [c]; }
    }
    if (group.length >= 2) groups.push(group);

    return groups.slice(-30).map(g => {
      const x = Math.round((g[0].x + g[g.length-1].x) / 2);
      const allY = g.flatMap(c => c.ys);
      const high = Math.min(...allY), low = Math.max(...allY);
      const color = g.reduce((a,c) => a + c.green,0) >= g.reduce((a,c) => a + c.red,0) ? 'GREEN' : 'RED';
      // Body is estimated from the dense central colored run; wick is the sparse extension.
      const rowCounts = new Map<number, number>();
      for (const yy of allY) rowCounts.set(yy, (rowCounts.get(yy) || 0) + 1);
      const denseRows = [...rowCounts.entries()].filter(([,n]) => n >= Math.max(2, Math.ceil(g.length * 0.35))).map(([yy]) => yy);
      const bodyTop = denseRows.length ? Math.min(...denseRows) : high;
      const bodyBottom = denseRows.length ? Math.max(...denseRows) : low;
      const range = Math.max(1, low - high);
      const body = Math.max(1, bodyBottom - bodyTop);
      const topWick = Math.max(0, bodyTop - high);
      const bottomWick = Math.max(0, low - bodyBottom);
      const highPrice = priceAtPixelY(high), lowPrice = priceAtPixelY(low);
      const bodyTopPrice = priceAtPixelY(bodyTop), bodyBottomPrice = priceAtPixelY(bodyBottom);
      const openPrice = color === 'GREEN' ? bodyBottomPrice : bodyTopPrice;
      const closePrice = color === 'GREEN' ? bodyTopPrice : bodyBottomPrice;
      const confidence = Math.min(0.99, 0.55 + Math.min(0.35, g.length / 40) + (highPrice !== null && lowPrice !== null ? 0.09 : 0));
      return {
        x, yHigh: high, yLow: low, yBodyTop: bodyTop, yBodyBottom: bodyBottom,
        color, body, range, topWick, bottomWick,
        bodyRatio: body / range, topWickRatio: topWick / range, bottomWickRatio: bottomWick / range,
        strength: Math.min(1, body / range), openPrice, closePrice, highPrice, lowPrice, confidence
      };
    });
  }, [cropBox, priceAtPixelY]);

  const refreshVisualPriceLevels = useCallback(() => {
    const now = Date.now();
    if (now - lastVisualLevelsAtRef.current < 250) return;
    lastVisualLevelsAtRef.current = now;
    const levels = brainRef.current.zigzagLevels
      .filter(z => Number.isFinite(z.price))
      .sort((a,b) => b.occurrences - a.occurrences)
      .slice(0, 80)
      .map(z => {
        const y = priceAxisLabelsRef.current.length >= 2
          ? (() => {
              const labels = [...priceAxisLabelsRef.current].sort((a,b)=>a.y-b.y);
              for (let i=0;i<labels.length-1;i++) {
                const a=labels[i], b=labels[i+1];
                if ((z.price <= a.value && z.price >= b.value) || (z.price >= a.value && z.price <= b.value)) {
                  const t=(z.price-a.value)/(b.value-a.value || 1);
                  return a.y + t*(b.y-a.y);
                }
              }
              const a=labels[0], b=labels[labels.length-1];
              return a.y + ((z.price-a.value)/(b.value-a.value || 1))*(b.y-a.y);
            })()
          : null;
        return y === null ? null : {
          price:z.price, yPercent:(y/400)*100,
          type:z.type === 'LOW' ? 'SUPPORT' : 'RESISTANCE',
          occurrences:z.occurrences, confidence:Math.min(0.99, 0.55 + z.occurrences*0.05)
        } as VisualPriceLevel;
      }).filter(Boolean) as VisualPriceLevel[];
    setVisualPriceLevels(levels);
  }, []);

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
        candleRegions.push({
          x: chunk,
          color:
            chunkGreen > chunkRed
              ? 'GREEN'
              : 'RED'
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
      actualBottomWickSize
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

    if (!currentPrice || currentPrice <= 0) {
      setIsScanning(false);
      setStatusMessage(
        'Real market price not detected. Move the price-axis OCR box over the live price scale and retry.'
      );
      return;
    }

    processZigZagLogic(currentPrice);

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

    let patternString =
      `Dominant: ${dominantColor}`;

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
          ` | DISCOVERYâ†’UP`;
      }

      if (
        discovery.direction === 'DOWN' &&
        discovery.confidence >= 0.58
      ) {
        proposedSignal = 'PUT';
        confidence +=
          discovery.confidence * 0.25;

        patternString +=
          ` | DISCOVERYâ†’DOWN`;
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
        ' | REJECTIONâ€”WAIT FOR CONFIRM';
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
          observation
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

            // NEW vision layer: derive individual candle geometry from the same
            // real screen frame without replacing the existing detector.
            const realCandles = detectRealCandleGeometry(frameData);
            if (realCandles.length) {
              setLiveCandleGeometry(realCandles.slice(-12));
              candleFeaturesRef.current.push(...realCandles.slice(-3).map(c => ({
                color:c.color, body:c.body, range:c.range, topWick:c.topWick,
                bottomWick:c.bottomWick, bodyRatio:c.bodyRatio,
                topWickRatio:c.topWickRatio, bottomWickRatio:c.bottomWickRatio,
                strength:c.strength
              })));
              if (candleFeaturesRef.current.length > 250) {
                candleFeaturesRef.current.splice(0, candleFeaturesRef.current.length - 250);
              }
            }

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
              refreshVisualPriceLevels();

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
        refreshVisualPriceLevels,
        detectRealCandleGeometry,
        trackTimeAlgorithm,
        runRealPriceOCR
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
          'Connected. Vision + Self-Learning Pattern Discovery active. Reading live price axis...'
        );

        // Start real-price OCR immediately, then continuous learning
        // keeps refreshing it in the background.
        window.setTimeout(() => {
          void runRealPriceOCR();
        }, 500);

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
                analysis.actualBottomWickSize
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
              YODDHA X FUSION ENGINE v4
            </h1>

            <p className="text-slate-500 text-sm">
              Vision + Existing Brain + Self-Learning Pattern Discovery
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
              <h3 className="text-xs font-bold text-emerald-400 uppercase mb-2">
                REAL PRICE AXIS OCR
              </h3>
              <p className="text-xs text-slate-400 mb-3">
                Keep this zone over the live numeric price scale on the right side of the chart.
              </p>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <button
                  onClick={() =>
                    setPriceAxisBox(prev => ({
                      ...prev,
                      x: Math.max(0, prev.x - 2)
                    }))
                  }
                  className="py-1.5 bg-slate-800 hover:bg-slate-700 text-xs rounded"
                >
                  Axis â†
                </button>
                <button
                  onClick={() =>
                    setPriceAxisBox(prev => ({
                      ...prev,
                      x: Math.min(100 - prev.width, prev.x + 2)
                    }))
                  }
                  className="py-1.5 bg-slate-800 hover:bg-slate-700 text-xs rounded"
                >
                  Axis â†’
                </button>
                <button
                  onClick={() =>
                    setPriceAxisBox(prev => ({
                      ...prev,
                      width: Math.min(40, prev.width + 2)
                    }))
                  }
                  className="py-1.5 bg-slate-800 hover:bg-slate-700 text-xs rounded"
                >
                  Width +
                </button>
                <button
                  onClick={() =>
                    setPriceAxisBox(prev => ({
                      ...prev,
                      width: Math.max(8, prev.width - 2)
                    }))
                  }
                  className="py-1.5 bg-slate-800 hover:bg-slate-700 text-xs rounded"
                >
                  Width -
                </button>
              </div>
              <p className="text-[10px] text-slate-500 font-mono">
                Axis X:{priceAxisBox.x.toFixed(0)}% Y:{priceAxisBox.y.toFixed(0)}% | W:{priceAxisBox.width.toFixed(0)}%
              </p>
              <button
                onClick={() => void runRealPriceOCR()}
                className="mt-2 w-full py-2 bg-emerald-700 hover:bg-emerald-600 text-xs font-bold rounded"
              >
                READ LIVE PRICE NOW
              </button>
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
                  Candle â†’ Features â†’ DNA â†’ Learning
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

                {isStreamActive && visualPriceLevels.map((level, i) => (
                  <div
                    key={`real-level-${level.price}-${i}`}
                    className="absolute left-0 right-0 pointer-events-none"
                    style={{ top: `${level.yPercent}%` }}
                  >
                    <div className="border-t-2 border-dashed border-amber-400/80" />
                    <span className="absolute right-1 -top-4 bg-slate-950/90 px-1.5 py-0.5 text-[9px] text-amber-300 font-mono rounded">
                      {level.type} {level.price.toFixed(6)} Â· {level.occurrences}x
                    </span>
                  </div>
                ))}

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
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="bg-[#020617] rounded-lg border border-slate-800 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">
                    Real Live Price
                  </div>
                  <div className="font-mono text-lg text-emerald-400">
                    {realPrice !== null
                      ? realPrice.toFixed(6)
                      : 'WAITING...'}
                  </div>
                </div>
                <div className="bg-[#020617] rounded-lg border border-slate-800 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">
                    Price Axis OCR
                  </div>
                  <div className="text-xs text-cyan-300">
                    {priceAxisStatus}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="bg-[#020617] rounded-lg border border-slate-800 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Real Candle Vision</div>
                  <div className="font-mono text-sm text-emerald-300">{liveCandleGeometry.length} candles Â· OHLC mapped</div>
                </div>
                <div className="bg-[#020617] rounded-lg border border-slate-800 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Real Price Levels</div>
                  <div className="font-mono text-sm text-amber-300">{visualPriceLevels.length} levels Â· ZigZag + OCR</div>
                </div>
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
                        WIN â€” Teach Pattern
                      </button>

                      <button
                        onClick={() =>
                          logTradeOutcome(
                            'LOSS'
                          )
                        }
                        className="py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg"
                      >
                        LOSS â€” Adapt Pattern
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
