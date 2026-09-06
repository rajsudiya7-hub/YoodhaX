import { useState, useEffect, useRef, useCallback } from 'react';
import { createWorker } from 'tesseract.js';

/* =========================================================
   TRADER YODHA X — OTC 1-MIN MULTI FACTOR ENGINE
   ========================================================= */

type Direction = 'CALL' | 'PUT' | 'WAIT';
type CandleColor = 'GREEN' | 'RED' | 'NEUTRAL';
type Trend = 'UPTREND' | 'DOWNTREND' | 'RANGE' | 'UNKNOWN';
type Structure =
  | 'HH_HL'
  | 'LH_LL'
  | 'BOS_UP'
  | 'BOS_DOWN'
  | 'RANGE'
  | 'UNKNOWN';

interface Candle {
  time: number;
  minuteKey: string;
  open: number;
  high: number;
  low: number;
  close: number;
  color: CandleColor;
  body: number;
  upperWick: number;
  lowerWick: number;
}

interface PatternMemory {
  id: string;
  pattern: string;
  signal: Direction;
  result: 'WIN' | 'LOSS';
  timestamp: number;

  priceLevel: number;
  trend: Trend;
  structure: Structure;

  candlePattern: string;
  priceAction: string;

  score: number;
  confidence: number;

  timeKey: string;
  minute: number;
}

interface MagicNumber {
  priceLevel: number;
  isRoundNumber: boolean;
  priceRange: string;
  direction: 'GREEN_TO_RED' | 'RED_TO_GREEN';
  occurrences: number;
  wins: number;
  losses: number;
  successRate: number;
  lastSeen: number;
}

interface TimeAlgorithm {
  timeKey: string;
  direction: 'UP' | 'DOWN' | 'NEUTRAL';
  occurrences: number;
  wins: number;
  losses: number;
  successRate: number;
  lastOccurrences: number[];
}

interface SRLevel {
  price: number;
  type: 'SUPPORT' | 'RESISTANCE';
  touches: number;
  strength: number;
  lastSeen: number;
}

interface ZigZagLevel {
  price: number;
  type: 'HIGH' | 'LOW';
  occurrences: number;
  timestamp: number;
}

interface BrainState {
  patterns: PatternMemory[];
  magicNumbers: MagicNumber[];
  timeAlgorithms: TimeAlgorithm[];
  srLevels: SRLevel[];
  zigzagLevels: ZigZagLevel[];

  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;

  lastUpdated: number;
}

interface LiveAnalysis {
  signal: Direction;

  score: number;
  confidence: number;
  quality: 'STRONG' | 'MEDIUM' | 'WEAK' | 'WAIT';

  price: number;

  trend: Trend;
  structure: Structure;

  candlePattern: string;
  priceAction: string;

  support: SRLevel | null;
  resistance: SRLevel | null;

  reasons: string[];

  currentCandle: Candle | null;
  previousCandles: Candle[];

  timeKey: string;
}

interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DB_NAME = 'TraderYodhaX_AI_Database';
const DB_VERSION = 2;
const STORE_NAME = 'trader_yodha_x_brain_store';

const MIN_CANDLES_FOR_ANALYSIS = 8;

export default function TraderYodhaXEngine() {
  /* =========================================================
     UI STATE
     ========================================================= */

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isStreamActive, setIsStreamActive] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const [aiSignal, setAiSignal] = useState<Direction>('WAIT');

  const [statusMessage, setStatusMessage] = useState(
    'Trader Yodha X Multi-Factor OTC Engine Ready.'
  );

  const [ocrPriceText, setOcrPriceText] = useState('Searching...');
  const [isRealRoundNumber, setIsRealRoundNumber] = useState(false);

  const [timeUntilCandle, setTimeUntilCandle] = useState(60);

  const [roiBox, setRoiBox] = useState<CropRegion>({
    x: 100,
    y: 50,
    width: 300,
    height: 250,
  });

  const [isRoiLocked, setIsRoiLocked] = useState(false);

  const [currentAnalysis, setCurrentAnalysis] =
    useState<LiveAnalysis | null>(null);

  const [brainStats, setBrainStats] = useState({
    patterns: 0,
    sr: 0,
    zigzag: 0,
    timeSyncs: 0,
    winRate: 0,
    trades: 0,
  });

  /* =========================================================
     REFS
     ========================================================= */

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ocrCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  const ocrWorkerRef = useRef<any>(null);

  const continuousLearningRef = useRef<ReturnType<
    typeof setInterval
  > | null>(null);

  const priceHistoryRef = useRef<
    { price: number; time: number; color: CandleColor }[]
  >([]);

  const candleHistoryRef = useRef<Candle[]>([]);

  const lastPriceRef = useRef(0);
  const lastColorRef = useRef<CandleColor>('NEUTRAL');

  const pendingSignalRef = useRef<{
    signal: Direction;
    analysis: LiveAnalysis;
  } | null>(null);

  const brainRef = useRef<BrainState>({
    patterns: [],
    magicNumbers: [],
    timeAlgorithms: [],
    srLevels: [],
    zigzagLevels: [],

    totalTrades: 0,
    wins: 0,
    losses: 0,
    winRate: 0,

    lastUpdated: Date.now(),
  });

  /* =========================================================
     STREAM
     ========================================================= */

  useEffect(() => {
    if (isStreamActive && stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, isStreamActive]);

  /* =========================================================
     OCR
     ========================================================= */

  useEffect(() => {
    let mounted = true;

    const initOCR = async () => {
      try {
        const worker = await createWorker('eng');

        if (!mounted) {
          await worker.terminate();
          return;
        }

        ocrWorkerRef.current = worker;

        setStatusMessage(
          'Vision + OCR engine initialized. Connect chart screen.'
        );
      } catch (error) {
        console.error('OCR initialization error:', error);
        setStatusMessage('OCR initialization failed.');
      }
    };

    initOCR();

    return () => {
      mounted = false;

      if (ocrWorkerRef.current) {
        ocrWorkerRef.current.terminate();
        ocrWorkerRef.current = null;
      }
    };
  }, []);

  /* =========================================================
     DATABASE
     ========================================================= */

  const initIndexedDB = useCallback((): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }, []);

  const updateBrainStats = useCallback(() => {
    const brain = brainRef.current;

    setBrainStats({
      patterns: brain.patterns.length,
      sr: brain.srLevels.length,
      zigzag: brain.zigzagLevels.length,
      timeSyncs: brain.timeAlgorithms.length,
      winRate: brain.winRate,
      trades: brain.totalTrades,
    });
  }, []);

  const saveBrainToDB = useCallback(async () => {
    try {
      const db = await initIndexedDB();

      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      brainRef.current.lastUpdated = Date.now();

      store.put(
        brainRef.current,
        'trader_yodha_x_brain_state'
      );

      updateBrainStats();
    } catch (error) {
      console.error('Database save error:', error);
    }
  }, [initIndexedDB, updateBrainStats]);

  const loadBrainFromDB = useCallback(async () => {
    try {
      const db = await initIndexedDB();

      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);

      const request = store.get(
        'trader_yodha_x_brain_state'
      );

      request.onsuccess = () => {
        if (request.result) {
          const loaded = request.result as BrainState;

          brainRef.current = {
            ...brainRef.current,
            ...loaded,
            patterns: loaded.patterns || [],
            magicNumbers: loaded.magicNumbers || [],
            timeAlgorithms: loaded.timeAlgorithms || [],
            srLevels: loaded.srLevels || [],
            zigzagLevels: loaded.zigzagLevels || [],
          };

          updateBrainStats();

          setStatusMessage(
            `Brain loaded: ${brainRef.current.patterns.length} historical setups.`
          );
        }
      };
    } catch (error) {
      console.error('Database load error:', error);
    }
  }, [initIndexedDB, updateBrainStats]);

  useEffect(() => {
    loadBrainFromDB();
  }, [loadBrainFromDB]);

  /* =========================================================
     BASIC PRICE UTILITIES
     ========================================================= */

  const getPriceRange = (price: number) => {
    const base = Math.floor(price * 1000);

    return `${(base / 1000).toFixed(3)}-${(
      (base + 1) /
      1000
    ).toFixed(3)}`;
  };

  const checkIsRoundNumber = (price: number) => {
    if (!price || !Number.isFinite(price)) return false;

    const scaled = Math.round(price * 10000);

    return (
      scaled % 100 === 0 ||
      scaled % 50 === 0 ||
      scaled % 10 === 0
    );
  };

  /* =========================================================
     ROI
     ========================================================= */

  const getScaledROI = useCallback(() => {
    if (!videoRef.current || !videoContainerRef.current) {
      return roiBox;
    }

    const containerWidth =
      videoContainerRef.current.clientWidth || 800;

    const containerHeight =
      videoContainerRef.current.clientHeight || 450;

    const actualWidth =
      videoRef.current.videoWidth || containerWidth;

    const actualHeight =
      videoRef.current.videoHeight || containerHeight;

    const scaleX = actualWidth / containerWidth;
    const scaleY = actualHeight / containerHeight;

    return {
      x: Math.max(0, Math.floor(roiBox.x * scaleX)),
      y: Math.max(0, Math.floor(roiBox.y * scaleY)),
      width: Math.max(
        1,
        Math.min(
          actualWidth,
          Math.floor(roiBox.width * scaleX)
        )
      ),
      height: Math.max(
        1,
        Math.min(
          actualHeight,
          Math.floor(roiBox.height * scaleY)
        )
      ),
    };
  }, [roiBox]);

  /* =========================================================
     PIXEL ANALYSIS
     ========================================================= */

  const analyzePixelDistribution = (
    frameData: Uint8ClampedArray,
    width: number,
    height: number
  ) => {
    let greenPixels = 0;
    let redPixels = 0;

    const chunks: {
      index: number;
      green: number;
      red: number;
      color: CandleColor;
    }[] = [];

    const chunkCount = 20;
    const chunkWidth = Math.max(
      1,
      Math.floor(width / chunkCount)
    );

    for (let chunk = 0; chunk < chunkCount; chunk++) {
      let green = 0;
      let red = 0;

      const startX = chunk * chunkWidth;
      const endX =
        chunk === chunkCount - 1
          ? width
          : Math.min(width, (chunk + 1) * chunkWidth);

      for (let x = startX; x < endX; x++) {
        for (let y = 0; y < height; y++) {
          const index = (y * width + x) * 4;

          const r = frameData[index];
          const g = frameData[index + 1];
          const b = frameData[index + 2];

          const isGreen =
            g > r + 30 && g > b + 30;

          const isRed =
            r > g + 30 && r > b + 30;

          if (isGreen) {
            green++;
            greenPixels++;
          }

          if (isRed) {
            red++;
            redPixels++;
          }
        }
      }

      const color: CandleColor =
        green > red * 1.15
          ? 'GREEN'
          : red > green * 1.15
          ? 'RED'
          : 'NEUTRAL';

      chunks.push({
        index: chunk,
        green,
        red,
        color,
      });
    }

    return {
      greenPixels,
      redPixels,
      chunks,
    };
  };

  /* =========================================================
     OCR PRICE
     ========================================================= */

  const extractPriceLevelWithOCR = async (
    ctx: CanvasRenderingContext2D
  ): Promise<number> => {
    if (!ocrWorkerRef.current || !ocrCanvasRef.current) {
      return lastPriceRef.current;
    }

    const targetROI = getScaledROI();

    const ocrCanvas = ocrCanvasRef.current;

    ocrCanvas.width = targetROI.width;
    ocrCanvas.height = targetROI.height;

    const ocrCtx = ocrCanvas.getContext('2d');

    if (!ocrCtx) return lastPriceRef.current;

    ocrCtx.clearRect(
      0,
      0,
      ocrCanvas.width,
      ocrCanvas.height
    );

    ocrCtx.drawImage(
      ctx.canvas,
      targetROI.x,
      targetROI.y,
      targetROI.width,
      targetROI.height,
      0,
      0,
      targetROI.width,
      targetROI.height
    );

    try {
      const result =
        await ocrWorkerRef.current.recognize(
          ocrCanvas
        );

      const text =
        result?.data?.text || '';

      /*
       * More conservative price parser.
       * Looks for decimal numbers.
       */
      const matches =
        text.match(/\d+\.\d{2,8}/g);

      if (!matches || matches.length === 0) {
        return lastPriceRef.current;
      }

      /*
       * Prefer the number closest to the previous price
       * when possible.
       */
      const candidates = matches
        .map((value: string) => parseFloat(value))
        .filter(
          (value: number) =>
            Number.isFinite(value) && value > 0
        );

      if (!candidates.length) {
        return lastPriceRef.current;
      }

      let selected = candidates[0];

      if (lastPriceRef.current > 0) {
        selected = candidates.reduce(
          (best: number, value: number) => {
            const bestDiff =
              Math.abs(
                best - lastPriceRef.current
              );

            const valueDiff =
              Math.abs(
                value - lastPriceRef.current
              );

            return valueDiff < bestDiff
              ? value
              : best;
          },
          candidates[0]
        );
      }

      const isRound =
        checkIsRoundNumber(selected);

      setOcrPriceText(
        `${selected.toFixed(5)}${
          isRound ? ' 🎯 ROUND' : ''
        }`
      );

      setIsRealRoundNumber(isRound);

      return selected;
    } catch {
      return lastPriceRef.current;
    }
  };

  /* =========================================================
     CANDLE BUILDER
     ========================================================= */

  const buildOneMinuteCandle = useCallback(() => {
    const history = priceHistoryRef.current;

    if (!history.length) return;

    const currentTime = Date.now();

    const minuteKey = new Date(
      currentTime
    ).toISOString().slice(0, 16);

    const minuteData = history.filter(
      item => {
        const key = new Date(
          item.time
        ).toISOString().slice(0, 16);

        return key === minuteKey;
      }
    );

    if (minuteData.length < 2) return;

    const prices = minuteData.map(
      item => item.price
    );

    const open = prices[0];
    const close = prices[prices.length - 1];

    const high = Math.max(...prices);
    const low = Math.min(...prices);

    const body = Math.abs(close - open);

    const upperWick =
      Math.max(0, high - Math.max(open, close));

    const lowerWick =
      Math.max(0, Math.min(open, close) - low);

    const color: CandleColor =
      close > open
        ? 'GREEN'
        : close < open
        ? 'RED'
        : 'NEUTRAL';

    const candle: Candle = {
      time: currentTime,
      minuteKey,
      open,
      high,
      low,
      close,
      color,
      body,
      upperWick,
      lowerWick,
    };

    const previous =
      candleHistoryRef.current[
        candleHistoryRef.current.length - 1
      ];

    if (!previous || previous.minuteKey !== minuteKey) {
      candleHistoryRef.current.push(candle);

      if (candleHistoryRef.current.length > 100) {
        candleHistoryRef.current.shift();
      }
    } else {
      candleHistoryRef.current[
        candleHistoryRef.current.length - 1
      ] = candle;
    }
  }, []);

  /* =========================================================
     CANDLE PATTERN ENGINE
     ========================================================= */

  const detectCandlePattern = (
    candles: Candle[]
  ) => {
    if (!candles.length) {
      return 'NO_CANDLE';
    }

    const current =
      candles[candles.length - 1];

    const previous =
      candles[candles.length - 2];

    if (!previous) {
      return current.color === 'GREEN'
        ? 'BULLISH_CANDLE'
        : current.color === 'RED'
        ? 'BEARISH_CANDLE'
        : 'NEUTRAL_CANDLE';
    }

    const body =
      Math.max(current.body, 0.00000001);

    /*
     * Doji
     */
    const range =
      current.high - current.low;

    if (
      range > 0 &&
      current.body <= range * 0.15
    ) {
      return 'DOJI';
    }

    /*
     * Bullish rejection
     */
    if (
      current.lowerWick > body * 1.8 &&
      current.close >= current.open
    ) {
      return 'BULLISH_REJECTION';
    }

    /*
     * Bearish rejection
     */
    if (
      current.upperWick > body * 1.8 &&
      current.close <= current.open
    ) {
      return 'BEARISH_REJECTION';
    }

    /*
     * Bullish engulfing
     */
    if (
      previous.color === 'RED' &&
      current.color === 'GREEN' &&
      current.open <= previous.close &&
      current.close >= previous.open
    ) {
      return 'BULLISH_ENGULFING';
    }

    /*
     * Bearish engulfing
     */
    if (
      previous.color === 'GREEN' &&
      current.color === 'RED' &&
      current.open >= previous.close &&
      current.close <= previous.open
    ) {
      return 'BEARISH_ENGULFING';
    }

    if (current.color === 'GREEN') {
      return 'BULLISH_CANDLE';
    }

    if (current.color === 'RED') {
      return 'BEARISH_CANDLE';
    }

    return 'NEUTRAL_CANDLE';
  };

  /* =========================================================
     MARKET STRUCTURE
     ========================================================= */

  const detectMarketStructure = (
    candles: Candle[]
  ): {
    trend: Trend;
    structure: Structure;
  } => {
    if (candles.length < 5) {
      return {
        trend: 'UNKNOWN',
        structure: 'UNKNOWN',
      };
    }

    const recent = candles.slice(-6);

    const highs = recent.map(
      candle => candle.high
    );

    const lows = recent.map(
      candle => candle.low
    );

    const higherHigh =
      highs[highs.length - 1] >
      highs[0];

    const higherLow =
      lows[lows.length - 1] >
      lows[0];

    const lowerHigh =
      highs[highs.length - 1] <
      highs[0];

    const lowerLow =
      lows[lows.length - 1] <
      lows[0];

    let trend: Trend = 'RANGE';

    if (higherHigh && higherLow) {
      trend = 'UPTREND';
    } else if (lowerHigh && lowerLow) {
      trend = 'DOWNTREND';
    }

    let structure: Structure = 'RANGE';

    if (higherHigh && higherLow) {
      structure = 'HH_HL';
    } else if (lowerHigh && lowerLow) {
      structure = 'LH_LL';
    }

    /*
     * Basic BOS detection.
     */
    const previousHigh = Math.max(
      ...recent.slice(0, -1).map(
        c => c.high
      )
    );

    const previousLow = Math.min(
      ...recent.slice(0, -1).map(
        c => c.low
      )
    );

    const last =
      recent[recent.length - 1];

    if (last.close > previousHigh) {
      structure = 'BOS_UP';
      trend = 'UPTREND';
    }

    if (last.close < previousLow) {
      structure = 'BOS_DOWN';
      trend = 'DOWNTREND';
    }

    return {
      trend,
      structure,
    };
  };

  /* =========================================================
     SUPPORT / RESISTANCE
     ========================================================= */

  const updateSupportResistance = useCallback(
    (price: number) => {
      if (!price || price <= 0) return;

      const brain = brainRef.current;

      const tolerance = Math.max(
        Math.abs(price) * 0.00015,
        0.00005
      );

      const existing = brain.srLevels.find(
        level =>
          Math.abs(level.price - price) <
          tolerance
      );

      if (existing) {
        existing.touches += 1;
        existing.lastSeen = Date.now();

        existing.strength = Math.min(
          100,
          40 + existing.touches * 10
        );

        return;
      }

      /*
       * New candidate level.
       * Classification is refined later from surrounding price.
       */
      brain.srLevels.push({
        price,
        type: 'SUPPORT',
        touches: 1,
        strength: 40,
        lastSeen: Date.now(),
      });

      /*
       * Limit memory.
       */
      if (brain.srLevels.length > 100) {
        brain.srLevels.sort(
          (a, b) =>
            b.lastSeen - a.lastSeen
        );

        brain.srLevels =
          brain.srLevels.slice(0, 100);
      }
    },
    []
  );

  const findNearestSR = (
    price: number
  ): {
    support: SRLevel | null;
    resistance: SRLevel | null;
  } => {
    const levels =
      brainRef.current.srLevels;

    let support: SRLevel | null = null;
    let resistance: SRLevel | null = null;

    for (const level of levels) {
      if (level.price <= price) {
        if (
          !support ||
          level.price > support.price
        ) {
          support = {
            ...level,
            type: 'SUPPORT',
          };
        }
      }

      if (level.price >= price) {
        if (
          !resistance ||
          level.price < resistance.price
        ) {
          resistance = {
            ...level,
            type: 'RESISTANCE',
          };
        }
      }
    }

    return {
      support,
      resistance,
    };
  };

  /* =========================================================
     PRICE ACTION
     ========================================================= */

  const detectPriceAction = (
    candles: Candle[],
    support: SRLevel | null,
    resistance: SRLevel | null
  ) => {
    if (!candles.length) {
      return 'NONE';
    }

    const current =
      candles[candles.length - 1];

    const previous =
      candles[candles.length - 2];

    if (!previous) {
      return 'NONE';
    }

    const price = current.close;

    const nearSupport =
      support &&
      Math.abs(
        price - support.price
      ) <=
        Math.max(
          Math.abs(price) * 0.0004,
          0.0001
        );

    const nearResistance =
      resistance &&
      Math.abs(
        price - resistance.price
      ) <=
        Math.max(
          Math.abs(price) * 0.0004,
          0.0001
        );

    if (
      nearSupport &&
      current.lowerWick > current.body * 1.5
    ) {
      return 'SUPPORT_REJECTION';
    }

    if (
      nearResistance &&
      current.upperWick > current.body * 1.5
    ) {
      return 'RESISTANCE_REJECTION';
    }

    /*
     * Breakout
     */
    if (
      resistance &&
      previous.close <= resistance.price &&
      current.close > resistance.price
    ) {
      return 'BREAKOUT_UP';
    }

    if (
      support &&
      previous.close >= support.price &&
      current.close < support.price
    ) {
      return 'BREAKOUT_DOWN';
    }

    /*
     * Simple retest
     */
    if (
      resistance &&
      previous.close > resistance.price &&
      current.low <= resistance.price &&
      current.close > resistance.price
    ) {
      return 'RETEST_SUPPORT_AFTER_BREAKOUT';
    }

    if (
      support &&
      previous.close < support.price &&
      current.high >= support.price &&
      current.close < support.price
    ) {
      return 'RETEST_RESISTANCE_AFTER_BREAKDOWN';
    }

    return 'NONE';
  };

  /* =========================================================
     ZIGZAG
     ========================================================= */

  const processZigZag = useCallback(
    (price: number) => {
      const history =
        priceHistoryRef.current;

      if (history.length < 10) return;

      const recent = history.slice(-20);

      const prices = recent.map(
        item => item.price
      );

      const max = Math.max(...prices);
      const min = Math.min(...prices);

      const tolerance = Math.max(
        Math.abs(price) * 0.0002,
        0.00005
      );

      let type: 'HIGH' | 'LOW' | null =
        null;

      if (
        Math.abs(price - max) <= tolerance
      ) {
        type = 'HIGH';
      } else if (
        Math.abs(price - min) <= tolerance
      ) {
        type = 'LOW';
      }

      if (!type) return;

      const existing =
        brainRef.current.zigzagLevels.find(
          level =>
            level.type === type &&
            Math.abs(level.price - price) <
              tolerance
        );

      if (existing) {
        existing.occurrences++;
        existing.timestamp = Date.now();
      } else {
        brainRef.current.zigzagLevels.push({
          price,
          type,
          occurrences: 1,
          timestamp: Date.now(),
        });
      }

      if (
        brainRef.current.zigzagLevels.length >
        100
      ) {
        brainRef.current.zigzagLevels =
          brainRef.current.zigzagLevels.slice(
            -100
          );
      }
    },
    []
  );

  /* =========================================================
     MAGIC NUMBERS
     ========================================================= */

  const detectMagicNumber = useCallback(
    (
      currentPrice: number,
      currentColor: CandleColor,
      previousPrice: number,
      previousColor: CandleColor
    ) => {
      if (
        !currentPrice ||
        !previousPrice ||
        currentColor === 'NEUTRAL' ||
        previousColor === 'NEUTRAL' ||
        currentColor === previousColor
      ) {
        return;
      }

      const direction =
        previousColor === 'GREEN'
          ? 'GREEN_TO_RED'
          : 'RED_TO_GREEN';

      const range =
        getPriceRange(currentPrice);

      const existing =
        brainRef.current.magicNumbers.find(
          item =>
            item.priceRange === range &&
            Math.abs(
              item.priceLevel -
                currentPrice
            ) < 0.0005
        );

      if (existing) {
        existing.occurrences++;
        existing.lastSeen = Date.now();

        return;
      }

      brainRef.current.magicNumbers.push({
        priceLevel: currentPrice,
        isRoundNumber:
          checkIsRoundNumber(currentPrice),
        priceRange: range,
        direction,
        occurrences: 1,
        wins: 0,
        losses: 0,
        successRate: 50,
        lastSeen: Date.now(),
      });
    },
    []
  );

  /* =========================================================
     TIME STATISTICS
     ========================================================= */

  const trackTime = useCallback(
    (
      direction: 'UP' | 'DOWN' | 'NEUTRAL'
    ) => {
      const now = new Date();

      /*
       * Use minute-level buckets rather than
       * exact second so there are enough observations.
       */
      const timeKey =
        `${String(
          now.getHours()
        ).padStart(2, '0')}:` +
        `${String(
          now.getMinutes()
        ).padStart(2, '0')}`;

      let existing =
        brainRef.current.timeAlgorithms.find(
          item =>
            item.timeKey === timeKey
        );

      if (!existing) {
        existing = {
          timeKey,
          direction,
          occurrences: 1,
          wins: 0,
          losses: 0,
          successRate: 50,
          lastOccurrences: [
            Date.now(),
          ],
        };

        brainRef.current.timeAlgorithms.push(
          existing
        );
      } else {
        existing.occurrences++;

        if (direction !== 'NEUTRAL') {
          existing.direction = direction;
        }

        existing.lastOccurrences.push(
          Date.now()
        );

        if (
          existing.lastOccurrences.length >
          20
        ) {
          existing.lastOccurrences.shift();
        }
      }
    },
    []
  );

  /* =========================================================
     HISTORICAL SETUP STATISTICS
     ========================================================= */

  const getHistoricalSetupScore = (
    candlePattern: string,
    priceAction: string,
    signal: Direction
  ) => {
    const patterns =
      brainRef.current.patterns.filter(
        item =>
          item.candlePattern ===
            candlePattern &&
          item.priceAction ===
            priceAction &&
          item.signal === signal
      );

    if (patterns.length < 5) {
      return {
        score: 0,
        sample: patterns.length,
        winRate: 0,
      };
    }

    const wins = patterns.filter(
      item => item.result === 'WIN'
    ).length;

    const winRate =
      (wins / patterns.length) * 100;

    const score =
      Math.max(
        -10,
        Math.min(10, (winRate - 50) / 5)
      );

    return {
      score,
      sample: patterns.length,
      winRate,
    };
  };

  /* =========================================================
     MULTI FACTOR SIGNAL ENGINE
     ========================================================= */

  const buildSignal = (
    price: number
  ): LiveAnalysis => {
    const candles =
      candleHistoryRef.current.slice(-20);

    const current =
      candles[candles.length - 1] || null;

    const previousCandles =
      candles.slice(
        Math.max(0, candles.length - 10),
        -1
      );

    if (
      !current ||
      candles.length < MIN_CANDLES_FOR_ANALYSIS
    ) {
      return {
        signal: 'WAIT',
        score: 0,
        confidence: 0,
        quality: 'WAIT',
        price,
        trend: 'UNKNOWN',
        structure: 'UNKNOWN',
        candlePattern: 'INSUFFICIENT_DATA',
        priceAction: 'INSUFFICIENT_DATA',
        support: null,
        resistance: null,
        reasons: [
          'More 1-minute candle history required.',
        ],
        currentCandle: current,
        previousCandles,
        timeKey: '',
      };
    }

    const {
      trend,
      structure,
    } = detectMarketStructure(candles);

    const candlePattern =
      detectCandlePattern(candles);

    const {
      support,
      resistance,
    } = findNearestSR(price);

    const priceAction =
      detectPriceAction(
        candles,
        support,
        resistance
      );

    let callScore = 0;
    let putScore = 0;

    const reasons: string[] = [];

    /* -------------------------------------------------------
       MARKET STRUCTURE
       ------------------------------------------------------- */

    if (trend === 'UPTREND') {
      callScore += 20;
      reasons.push('Trend: UPTREND');
    }

    if (trend === 'DOWNTREND') {
      putScore += 20;
      reasons.push('Trend: DOWNTREND');
    }

    if (structure === 'HH_HL') {
      callScore += 15;
      reasons.push('Structure: HH + HL');
    }

    if (structure === 'LH_LL') {
      putScore += 15;
      reasons.push('Structure: LH + LL');
    }

    if (structure === 'BOS_UP') {
      callScore += 20;
      reasons.push('Bullish BOS detected');
    }

    if (structure === 'BOS_DOWN') {
      putScore += 20;
      reasons.push('Bearish BOS detected');
    }

    /* -------------------------------------------------------
       CANDLE PATTERN
       ------------------------------------------------------- */

    if (
      candlePattern ===
        'BULLISH_REJECTION' ||
      candlePattern ===
        'BULLISH_ENGULFING'
    ) {
      callScore += 18;

      reasons.push(
        `Bullish candle: ${candlePattern}`
      );
    }

    if (
      candlePattern ===
        'BEARISH_REJECTION' ||
      candlePattern ===
        'BEARISH_ENGULFING'
    ) {
      putScore += 18;

      reasons.push(
        `Bearish candle: ${candlePattern}`
      );
    }

    if (
      candlePattern === 'BULLISH_CANDLE'
    ) {
      callScore += 7;
    }

    if (
      candlePattern === 'BEARISH_CANDLE'
    ) {
      putScore += 7;
    }

    /*
     * Doji = uncertainty.
     */
    if (candlePattern === 'DOJI') {
      callScore -= 10;
      putScore -= 10;

      reasons.push(
        'Doji/noise filter active'
      );
    }

    /* -------------------------------------------------------
       SUPPORT / RESISTANCE
       ------------------------------------------------------- */

    if (support) {
      const distance =
        Math.abs(
          price - support.price
        );

      const tolerance =
        Math.max(
          Math.abs(price) * 0.0005,
          0.0001
        );

      if (distance <= tolerance) {
        callScore += 12;

        reasons.push(
          `Near support ${support.price.toFixed(
            5
          )}`
        );
      }
    }

    if (resistance) {
      const distance =
        Math.abs(
          price - resistance.price
        );

      const tolerance =
        Math.max(
          Math.abs(price) * 0.0005,
          0.0001
        );

      if (distance <= tolerance) {
        putScore += 12;

        reasons.push(
          `Near resistance ${resistance.price.toFixed(
            5
          )}`
        );
      }
    }

    /* -------------------------------------------------------
       PRICE ACTION
       ------------------------------------------------------- */

    switch (priceAction) {
      case 'SUPPORT_REJECTION':
        callScore += 20;
        reasons.push(
          'Support rejection confirmed'
        );
        break;

      case 'RESISTANCE_REJECTION':
        putScore += 20;
        reasons.push(
          'Resistance rejection confirmed'
        );
        break;

      case 'BREAKOUT_UP':
        callScore += 18;
        reasons.push(
          'Resistance breakout'
        );
        break;

      case 'BREAKOUT_DOWN':
        putScore += 18;
        reasons.push(
          'Support breakdown'
        );
        break;

      case 'RETEST_SUPPORT_AFTER_BREAKOUT':
        callScore += 22;
        reasons.push(
          'Bullish breakout retest'
        );
        break;

      case 'RETEST_RESISTANCE_AFTER_BREAKDOWN':
        putScore += 22;
        reasons.push(
          'Bearish breakdown retest'
        );
        break;
    }

    /* -------------------------------------------------------
       ROUND NUMBER
       ------------------------------------------------------- */

    if (checkIsRoundNumber(price)) {
      /*
       * Round number alone is NOT a signal.
       */
      reasons.push(
        'Round-number level detected'
      );
    }

    /* -------------------------------------------------------
       HISTORICAL LEARNING
       ------------------------------------------------------- */

    const provisionalSignal =
      callScore > putScore
        ? 'CALL'
        : putScore > callScore
        ? 'PUT'
        : 'WAIT';

    if (provisionalSignal !== 'WAIT') {
      const historical =
        getHistoricalSetupScore(
          candlePattern,
          priceAction,
          provisionalSignal
        );

      if (historical.sample >= 5) {
        if (
          provisionalSignal === 'CALL'
        ) {
          callScore += historical.score;
        } else {
          putScore += historical.score;
        }

        reasons.push(
          `Historical setup: ${historical.winRate.toFixed(
            1
          )}% (${historical.sample} samples)`
        );
      }
    }

    /* -------------------------------------------------------
       FINAL SCORE
       ------------------------------------------------------- */

    const bestScore = Math.max(
      callScore,
      putScore
    );

    const difference = Math.abs(
      callScore - putScore
    );

    let signal: Direction = 'WAIT';

    if (
      callScore >= 55 &&
      callScore > putScore + 8
    ) {
      signal = 'CALL';
    }

    if (
      putScore >= 55 &&
      putScore > callScore + 8
    ) {
      signal = 'PUT';
    }

    /*
     * Noise filter:
     * if there is not enough confirmation,
     * stay WAIT.
     */
    if (
      candles.length < 10 ||
      difference < 8 ||
      bestScore < 45
    ) {
      signal = 'WAIT';

      reasons.push(
        'Confirmation insufficient → WAIT'
      );
    }

    /*
     * Confidence is derived from score,
     * not hard-coded 85%.
     */
    const confidence =
      signal === 'WAIT'
        ? Math.min(
            49,
            Math.max(
              0,
              bestScore
            )
          )
        : Math.min(
            95,
            Math.max(
              50,
              50 +
                bestScore * 0.45 +
                difference * 0.2
            )
          );

    let quality:
      | 'STRONG'
      | 'MEDIUM'
      | 'WEAK'
      | 'WAIT' = 'WAIT';

    if (signal !== 'WAIT') {
      if (confidence >= 80) {
        quality = 'STRONG';
      } else if (confidence >= 65) {
        quality = 'MEDIUM';
      } else {
        quality = 'WEAK';
      }
    }

    const score =
      signal === 'CALL'
        ? Math.round(callScore)
        : signal === 'PUT'
        ? Math.round(putScore)
        : Math.round(bestScore);

    const now = new Date();

    const timeKey =
      `${String(
        now.getHours()
      ).padStart(2, '0')}:` +
      `${String(
        now.getMinutes()
      ).padStart(2, '0')}`;

    return {
      signal,
      score,
      confidence,
      quality,
      price,
      trend,
      structure,
      candlePattern,
      priceAction,
      support,
      resistance,
      reasons,
      currentCandle: current,
      previousCandles,
      timeKey,
    };
  };

  /* =========================================================
     FRAME PROCESSING
     ========================================================= */

  const captureCurrentFrame = useCallback(
    async () => {
      if (
        !canvasRef.current ||
        !videoRef.current
      ) {
        return null;
      }

      const ctx =
        canvasRef.current.getContext(
          '2d',
          {
            willReadFrequently: true,
          }
        );

      if (!ctx) return null;

      const width =
        videoRef.current.videoWidth ||
        800;

      const height =
        videoRef.current.videoHeight ||
        450;

      canvasRef.current.width = width;
      canvasRef.current.height = height;

      ctx.drawImage(
        videoRef.current,
        0,
        0,
        width,
        height
      );

      const roi = getScaledROI();

      const imageData =
        ctx.getImageData(
          roi.x,
          roi.y,
          roi.width,
          roi.height
        );

      const pixelAnalysis =
        analyzePixelDistribution(
          imageData.data,
          roi.width,
          roi.height
        );

      const color: CandleColor =
        pixelAnalysis.greenPixels >
        pixelAnalysis.redPixels * 1.15
          ? 'GREEN'
          : pixelAnalysis.redPixels >
            pixelAnalysis.greenPixels *
              1.15
          ? 'RED'
          : 'NEUTRAL';

      const price =
        await extractPriceLevelWithOCR(
          ctx
        );

      return {
        ctx,
        color,
        price,
      };
    },
    [getScaledROI]
  );

  /* =========================================================
     CONTINUOUS LEARNING
     ========================================================= */

  const startContinuousLearning =
    useCallback(() => {
      if (
        continuousLearningRef.current
      ) {
        clearInterval(
          continuousLearningRef.current
        );
      }

      continuousLearningRef.current =
        setInterval(async () => {
          if (!isStreamActive) return;

          const frame =
            await captureCurrentFrame();

          if (!frame) return;

          const {
            color,
            price,
          } = frame;

          if (
            price &&
            Number.isFinite(price) &&
            price > 0
          ) {
            priceHistoryRef.current.push({
              price,
              time: Date.now(),
              color,
            });

            if (
              priceHistoryRef.current
                .length > 2000
            ) {
              priceHistoryRef.current.shift();
            }

            updateSupportResistance(
              price
            );

            processZigZag(price);

            detectMagicNumber(
              price,
              color,
              lastPriceRef.current,
              lastColorRef.current
            );

            lastPriceRef.current = price;
            lastColorRef.current = color;

            buildOneMinuteCandle();
          }

          const direction =
            color === 'GREEN'
              ? 'UP'
              : color === 'RED'
              ? 'DOWN'
              : 'NEUTRAL';

          trackTime(direction);
        }, 1000);
    }, [
      isStreamActive,
      captureCurrentFrame,
      updateSupportResistance,
      processZigZag,
      detectMagicNumber,
      buildOneMinuteCandle,
      trackTime,
    ]);

  /* =========================================================
     CONNECT
     ========================================================= */

  const connectStream = async () => {
    try {
      const mediaStream =
        await navigator.mediaDevices.getDisplayMedia(
          {
            video: {
              displaySurface: 'window',
              width: {
                ideal: 1920,
              },
              height: {
                ideal: 1080,
              },
              frameRate: {
                ideal: 30,
              },
            } as any,
            audio: false,
          }
        );

      setStream(mediaStream);
      setIsStreamActive(true);

      setStatusMessage(
        'Screen connected. Building 1-minute market structure...'
      );

      mediaStream
        .getVideoTracks()[0]
        ?.addEventListener(
          'ended',
          () => {
            setIsStreamActive(false);
            setStream(null);
          }
        );
    } catch (error) {
      console.error(error);

      setStatusMessage(
        'Screen sharing failed. Please share the chart window.'
      );
    }
  };

  useEffect(() => {
    if (isStreamActive) {
      startContinuousLearning();
    }
  }, [
    isStreamActive,
    startContinuousLearning,
  ]);

  const disconnectStream = () => {
    if (
      continuousLearningRef.current
    ) {
      clearInterval(
        continuousLearningRef.current
      );

      continuousLearningRef.current =
        null;
    }

    if (stream) {
      stream
        .getTracks()
        .forEach(track =>
          track.stop()
        );
    }

    setStream(null);
    setIsStreamActive(false);
    setAiSignal('WAIT');
    setCurrentAnalysis(null);

    pendingSignalRef.current = null;

    setStatusMessage(
      'Engine paused.'
    );
  };

  /* =========================================================
     FAST SCAN
     ========================================================= */

  const executeFastScan = async () => {
    if (
      !isStreamActive ||
      !videoRef.current
    ) {
      return;
    }

    setIsScanning(true);

    try {
      /*
       * Take several quick samples instead of
       * trusting one frame.
       */
      for (let i = 0; i < 3; i++) {
        const frame =
          await captureCurrentFrame();

        if (!frame) continue;

        if (
          frame.price &&
          Number.isFinite(frame.price)
        ) {
          priceHistoryRef.current.push({
            price: frame.price,
            time: Date.now(),
            color: frame.color,
          });

          lastPriceRef.current =
            frame.price;

          lastColorRef.current =
            frame.color;

          buildOneMinuteCandle();
        }

        await new Promise(resolve =>
          setTimeout(resolve, 150)
        );
      }

      const price =
        lastPriceRef.current;

      if (!price) {
        setStatusMessage(
          'Price not detected. Adjust OCR ROI.'
        );

        setIsScanning(false);
        return;
      }

      const analysis =
        buildSignal(price);

      setCurrentAnalysis(analysis);

      /*
       * Only prepare executable direction when
       * confirmation is sufficient.
       */
      if (
        analysis.signal !== 'WAIT'
      ) {
        pendingSignalRef.current = {
          signal: analysis.signal,
          analysis,
        };

        setStatusMessage(
          `${analysis.quality} setup prepared. Score ${analysis.score}/100. Entry synchronized to next candle.`
        );
      } else {
        pendingSignalRef.current = null;

        setStatusMessage(
          `WAIT — confirmation insufficient. Score ${analysis.score}.`
        );
      }
    } catch (error) {
      console.error(
        'Fast scan error:',
        error
      );

      setStatusMessage(
        'Scan error. Check ROI and OCR.'
      );
    }

    setIsScanning(false);
  };

  const triggerAnalysis = () => {
    if (!isStreamActive) {
      setStatusMessage(
        'Connect screen first.'
      );
      return;
    }

    setIsScanning(true);

    setTimeout(() => {
      executeFastScan();
    }, 500);
  };

  /* =========================================================
     CANDLE SYNCHRONIZATION
     ========================================================= */

  useEffect(() => {
    const interval =
      setInterval(() => {
        const now = new Date();

        const seconds =
          now.getSeconds();

        const milliseconds =
          now.getMilliseconds();

        const remaining =
          60 -
          seconds -
          milliseconds / 1000;

        setTimeUntilCandle(
          Math.ceil(remaining)
        );

        /*
         * Automatic scan at :52.
         */
        if (
          isStreamActive &&
          seconds === 52 &&
          !isScanning &&
          !pendingSignalRef.current
        ) {
          executeFastScan();
        }

        /*
         * Activate prepared signal at :00.
         */
        if (
          pendingSignalRef.current &&
          seconds === 0 &&
          milliseconds < 500
        ) {
          const pending =
            pendingSignalRef.current;

          setAiSignal(
            pending.signal
          );

          setStatusMessage(
            `🚀 ${pending.signal} ACTIVE | ${pending.quality} | Score ${pending.score}/100`
          );

          pendingSignalRef.current =
            null;
        }
      }, 100);

    return () =>
      clearInterval(interval);
  }, [
    isStreamActive,
    isScanning,
  ]);

  /* =========================================================
     JOURNAL / WIN LOSS
     ========================================================= */

  const logTradeOutcome = async (
    result: 'WIN' | 'LOSS'
  ) => {
    if (
      aiSignal === 'WAIT' ||
      !currentAnalysis
    ) {
      return;
    }

    const analysis =
      currentAnalysis;

    const id =
      `${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;

    brainRef.current.patterns.push({
      id,

      pattern:
        `${analysis.candlePattern} | ${analysis.priceAction}`,

      signal: aiSignal,

      result,

      timestamp: Date.now(),

      priceLevel:
        analysis.price,

      trend:
        analysis.trend,

      structure:
        analysis.structure,

      candlePattern:
        analysis.candlePattern,

      priceAction:
        analysis.priceAction,

      score:
        analysis.score,

      confidence:
        analysis.confidence,

      timeKey:
        analysis.timeKey,

      minute:
        new Date().getMinutes(),
    });

    brainRef.current.totalTrades++;

    if (result === 'WIN') {
      brainRef.current.wins++;
    } else {
      brainRef.current.losses++;
    }

    brainRef.current.winRate =
      brainRef.current.totalTrades > 0
        ? (brainRef.current.wins /
            brainRef.current
              .totalTrades) *
          100
        : 0;

    /*
     * Update magic number statistics.
     */
    const magic =
      brainRef.current.magicNumbers.find(
        item =>
          Math.abs(
            item.priceLevel -
              analysis.price
          ) <
          Math.max(
            Math.abs(
              analysis.price
            ) * 0.0005,
            0.0001
          )
      );

    if (magic) {
      if (result === 'WIN') {
        magic.wins++;
      } else {
        magic.losses++;
      }

      const total =
        magic.wins +
        magic.losses;

      magic.successRate =
        total > 0
          ? (magic.wins / total) *
            100
          : 50;
    }

    /*
     * Update time statistics.
     */
    const timeAlgo =
      brainRef.current.timeAlgorithms.find(
        item =>
          item.timeKey ===
          analysis.timeKey
      );

    if (timeAlgo) {
      if (result === 'WIN') {
        timeAlgo.wins++;
      } else {
        timeAlgo.losses++;
      }

      const total =
        timeAlgo.wins +
        timeAlgo.losses;

      timeAlgo.successRate =
        total > 0
          ? (timeAlgo.wins / total) *
            100
          : 50;
    }

    await saveBrainToDB();

    setStatusMessage(
      `${result} logged. Overall historical win rate: ${brainRef.current.winRate.toFixed(
        1
      )}%`
    );

    setAiSignal('WAIT');
    setCurrentAnalysis(null);
  };

  /* =========================================================
     CLEAR BRAIN
     ========================================================= */

  const clearBrain = async () => {
    const password =
      window.prompt(
        'Enter Master Password:'
      );

    if (
      password !==
      'YODDHAX_REBORN'
    ) {
      return;
    }

    brainRef.current = {
      patterns: [],
      magicNumbers: [],
      timeAlgorithms: [],
      srLevels: [],
      zigzagLevels: [],

      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,

      lastUpdated: Date.now(),
    };

    await saveBrainToDB();

    setCurrentAnalysis(null);
    setAiSignal('WAIT');

    setStatusMessage(
      'Trader Yodha X Brain reset.'
    );
  };

  /* =========================================================
     ROI DRAG / RESIZE
     ========================================================= */

  const [
    isDragging,
    setIsDragging,
  ] = useState(false);

  const [
    isResizing,
    setIsResizing,
  ] = useState(false);

  const [
    dragStart,
    setDragStart,
  ] = useState({
    x: 0,
    y: 0,
  });

  const handleMouseDown = (
    event: React.MouseEvent
  ) => {
    if (isRoiLocked) return;

    event.stopPropagation();

    setIsDragging(true);

    setDragStart({
      x:
        event.clientX -
        roiBox.x,
      y:
        event.clientY -
        roiBox.y,
    });
  };

  const handleResizeDown = (
    event: React.MouseEvent
  ) => {
    if (isRoiLocked) return;

    event.stopPropagation();

    setIsResizing(true);

    setDragStart({
      x: event.clientX,
      y: event.clientY,
    });
  };

  const handleMouseMove = (
    event: React.MouseEvent
  ) => {
    if (
      isRoiLocked ||
      (!isDragging && !isResizing)
    ) {
      return;
    }

    const container =
      videoContainerRef.current;

    if (!container) return;

    const bounds =
      container.getBoundingClientRect();

    if (isDragging) {
      const newX = Math.max(
        0,
        Math.min(
          bounds.width -
            roiBox.width,
          event.clientX -
            bounds.left -
            dragStart.x
        )
      );

      const newY = Math.max(
        0,
        Math.min(
          bounds.height -
            roiBox.height,
          event.clientY -
            bounds.top -
            dragStart.y
        )
      );

      setRoiBox(prev => ({
        ...prev,
        x: newX,
        y: newY,
      }));
    }

    if (isResizing) {
      const deltaX =
        event.clientX -
        dragStart.x;

      const deltaY =
        event.clientY -
        dragStart.y;

      setDragStart({
        x: event.clientX,
        y: event.clientY,
      });

      setRoiBox(prev => ({
        ...prev,

        width: Math.max(
          120,
          Math.min(
            bounds.width -
              prev.x,
            prev.width +
              deltaX
          )
        ),

        height: Math.max(
          100,
          Math.min(
            bounds.height -
              prev.y,
            prev.height +
              deltaY
          )
        ),
      }));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsResizing(false);
  };

  /* =========================================================
     UI HELPERS
     ========================================================= */

  const signalClass =
    aiSignal === 'CALL'
      ? 'bg-emerald-500/10 border-emerald-400 text-emerald-400'
      : aiSignal === 'PUT'
      ? 'bg-red-500/10 border-red-400 text-red-400'
      : 'bg-slate-800 border-slate-700 text-slate-600';

  /* =========================================================
     UI
     ========================================================= */

  return (
    <div
      className="min-h-screen bg-[#040814] text-slate-100 font-sans"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-5">
          <div>
            <h1 className="text-2xl font-bold text-cyan-400 tracking-wider">
              TRADER YODHA X AI
            </h1>

            <p className="text-slate-500 text-sm">
              OTC 1-Min Multi-Factor Analysis Engine
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-slate-500">
                Historical Setups
              </div>

              <div className="text-sm font-mono text-emerald-400">
                {brainStats.patterns} |{' '}
                {brainStats.winRate.toFixed(
                  1
                )}
                %
              </div>
            </div>

            {!isStreamActive ? (
              <button
                onClick={
                  connectStream
                }
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg"
              >
                Connect Chart Screen
              </button>
            ) : (
              <button
                onClick={
                  disconnectStream
                }
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

          {/* =================================================
              LEFT PANEL
              ================================================= */}

          <div className="space-y-4">

            <div className="bg-[#0f172a] rounded-xl p-5 border border-slate-800">
              <button
                onClick={
                  triggerAnalysis
                }
                disabled={
                  !isStreamActive ||
                  isScanning
                }
                className={`w-full py-4 rounded-xl font-bold text-lg ${
                  !isStreamActive ||
                  isScanning
                    ? 'bg-slate-700 text-slate-500'
                    : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                }`}
              >
                {isScanning
                  ? 'SCANNING...'
                  : 'INSTANT OTC SCAN'}
              </button>

              <div className="mt-4 flex justify-between">
                <span className="text-sm text-slate-500">
                  Next candle
                </span>

                <span className="font-mono text-xl text-amber-400">
                  {timeUntilCandle}s
                </span>
              </div>
            </div>

            {/* Brain stats */}

            <div className="bg-[#0f172a] rounded-xl p-5 border border-slate-800">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-4">
                AI Brain Statistics
              </h3>

              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div>
                  <span className="text-slate-500">
                    Setups
                  </span>

                  <div className="text-cyan-400 text-lg">
                    {brainStats.patterns}
                  </div>
                </div>

                <div>
                  <span className="text-slate-500">
                    Trades
                  </span>

                  <div className="text-cyan-400 text-lg">
                    {brainStats.trades}
                  </div>
                </div>

                <div>
                  <span className="text-slate-500">
                    S/R
                  </span>

                  <div className="text-purple-400 text-lg">
                    {brainStats.sr}
                  </div>
                </div>

                <div>
                  <span className="text-slate-500">
                    ZigZag
                  </span>

                  <div className="text-purple-400 text-lg">
                    {brainStats.zigzag}
                  </div>
                </div>

                <div className="col-span-2">
                  <span className="text-slate-500">
                    Historical Win Rate
                  </span>

                  <div className="text-emerald-400 text-2xl font-bold">
                    {brainStats.winRate.toFixed(
                      1
                    )}
                    %
                  </div>
                </div>
              </div>
            </div>

            {/* OCR */}

            <div className="bg-[#0f172a] rounded-xl p-5 border border-slate-800">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">
                OCR Telemetry
              </h3>

              <div className="font-mono text-sm">
                <span className="text-slate-500">
                  Price:
                </span>{' '}
                <span className="text-cyan-400">
                  {ocrPriceText}
                </span>
              </div>
            </div>

            {/* Analysis */}

            {currentAnalysis && (
              <div className="bg-[#0f172a] rounded-xl p-5 border border-slate-800">
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-4">
                  Multi-Factor Analysis
                </h3>

                <div className="space-y-2 text-xs font-mono">

                  <div className="flex justify-between">
                    <span className="text-slate-500">
                      Signal
                    </span>

                    <span
                      className={
                        currentAnalysis.signal ===
                        'CALL'
                          ? 'text-emerald-400 font-bold'
                          : currentAnalysis.signal ===
                            'PUT'
                          ? 'text-red-400 font-bold'
                          : 'text-slate-400 font-bold'
                      }
                    >
                      {
                        currentAnalysis.signal
                      }
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-500">
                      Score
                    </span>

                    <span className="text-cyan-400">
                      {
                        currentAnalysis.score
                      }
                      /100
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-500">
                      Confidence
                    </span>

                    <span className="text-amber-400">
                      {currentAnalysis.confidence.toFixed(
                        1
                      )}
                      %
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-500">
                      Quality
                    </span>

                    <span className="text-purple-400">
                      {
                        currentAnalysis.quality
                      }
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500">
                      Trend:
                    </span>{' '}
                    {
                      currentAnalysis.trend
                    }
                  </div>

                  <div>
                    <span className="text-slate-500">
                      Structure:
                    </span>{' '}
                    {
                      currentAnalysis.structure
                    }
                  </div>

                  <div>
                    <span className="text-slate-500">
                      Candle:
                    </span>{' '}
                    {
                      currentAnalysis.candlePattern
                    }
                  </div>

                  <div>
                    <span className="text-slate-500">
                      Price Action:
                    </span>{' '}
                    {
                      currentAnalysis.priceAction
                    }
                  </div>

                  <div className="pt-2">
                    <span className="text-slate-500">
                      Confirmations:
                    </span>

                    <div className="mt-2 space-y-1">
                      {currentAnalysis.reasons.map(
                        (reason, index) => (
                          <div
                            key={index}
                            className="text-slate-300"
                          >
                            ✓ {reason}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={clearBrain}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg text-xs"
            >
              Reset AI Memory
            </button>
          </div>

          {/* =================================================
              RIGHT PANEL
              ================================================= */}

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
                    LIVE CHART SCREEN
                  </span>
                </div>

                {isStreamActive && (
                  <button
                    onClick={() =>
                      setIsRoiLocked(
                        value => !value
                      )
                    }
                    className="px-3 py-1 rounded text-xs font-bold bg-slate-800"
                  >
                    {isRoiLocked
                      ? '🔒 ROI Locked'
                      : '🔓 Move ROI'}
                  </button>
                )}
              </div>

              <div
                ref={
                  videoContainerRef
                }
                className="bg-[#020617] rounded-lg aspect-video flex items-center justify-center overflow-hidden border border-slate-900 relative select-none"
              >

                {isStreamActive ? (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-contain pointer-events-none"
                    />

                    <div
                      onMouseDown={
                        handleMouseDown
                      }
                      style={{
                        left: `${roiBox.x}px`,
                        top: `${roiBox.y}px`,
                        width: `${roiBox.width}px`,
                        height: `${roiBox.height}px`,
                      }}
                      className={`absolute border-2 ${
                        isRoiLocked
                          ? 'border-amber-400 bg-amber-500/10'
                          : 'border-cyan-400 bg-cyan-500/10 cursor-move'
                      } z-20`}
                    >
                      <div className="text-[10px] bg-slate-950/80 text-cyan-300 font-mono px-1">
                        AI OCR / CHART ROI
                      </div>

                      {!isRoiLocked && (
                        <div
                          onMouseDown={
                            handleResizeDown
                          }
                          className="w-4 h-4 bg-cyan-400 absolute bottom-0 right-0 cursor-se-resize"
                        />
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-center text-slate-500">
                    Connect chart screen to start.
                  </div>
                )}
              </div>

              <canvas
                ref={canvasRef}
                className="hidden"
              />

              <canvas
                ref={ocrCanvasRef}
                className="hidden"
              />

              <div className="mt-3 px-4 py-2 bg-[#020617] rounded-lg border-l-4 border-cyan-500">
                <p className="text-xs text-slate-400">
                  <strong className="text-cyan-400">
                    Status:
                  </strong>{' '}
                  {statusMessage}
                </p>
              </div>
            </div>

            {/* =================================================
                SIGNAL
                ================================================= */}

            <div className="bg-[#0f172a] rounded-xl p-6 border border-slate-800">

              <div className="flex items-center justify-between mb-4">
                <span className="px-3 py-1 bg-purple-900/50 text-purple-300 text-xs font-bold rounded">
                  SIGNAL EXECUTOR
                </span>

                <span className="text-xs text-slate-500 font-mono">
                  1-MIN CANDLE
                </span>
              </div>

              <div className="text-center py-8">

                <div
                  className={`inline-block px-14 py-6 rounded-2xl text-6xl font-black tracking-widest border-4 ${signalClass}`}
                >
                  {aiSignal}
                </div>

                {currentAnalysis && (
                  <div className="mt-5 text-sm font-mono">
                    <span className="text-slate-500">
                      Score:
                    </span>{' '}
                    <span className="text-cyan-400">
                      {
                        currentAnalysis.score
                      }
                      /100
                    </span>

                    {' • '}

                    <span className="text-slate-500">
                      Confidence:
                    </span>{' '}

                    <span className="text-amber-400">
                      {currentAnalysis.confidence.toFixed(
                        1
                      )}
                      %
                    </span>
                  </div>
                )}
              </div>

              {aiSignal !== 'WAIT' && (
                <div className="mt-4 pt-4 border-t border-slate-800">

                  <p className="text-xs text-slate-400 text-center mb-3">
                    Record actual outcome for AI learning:
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
                      WIN
                    </button>

                    <button
                      onClick={() =>
                        logTradeOutcome(
                          'LOSS'
                        )
                      }
                      className="py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg"
                    >
                      LOSS
                    </button>

                  </div>
                </div>
              )}
            </div>

            {/* =================================================
                EDUCATION / ENGINE STATUS
                ================================================= */}

            <div className="bg-[#0f172a] rounded-xl p-5 border border-slate-800">

              <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">
                Active Analysis Modules
              </h3>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs font-mono">

                <div className="px-3 py-2 bg-slate-900 rounded">
                  ✓ Candlestick
                </div>

                <div className="px-3 py-2 bg-slate-900 rounded">
                  ✓ Market Structure
                </div>

                <div className="px-3 py-2 bg-slate-900 rounded">
                  ✓ Support / Resistance
                </div>

                <div className="px-3 py-2 bg-slate-900 rounded">
                  ✓ Price Action
                </div>

                <div className="px-3 py-2 bg-slate-900 rounded">
                  ✓ Noise Filter
                </div>

                <div className="px-3 py-2 bg-slate-900 rounded">
                  ✓ Historical Journal
                </div>

                <div className="px-3 py-2 bg-slate-900 rounded">
                  ✓ OCR
                </div>

                <div className="px-3 py-2 bg-slate-900 rounded">
                  ✓ Time Statistics
                </div>

                <div className="px-3 py-2 bg-slate-900 rounded">
                  ✓ ZigZag
                </div>

              </div>

              <p className="mt-4 text-[11px] text-slate-600">
                This engine provides statistical/technical
                analysis only. No trading result is guaranteed.
              </p>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}