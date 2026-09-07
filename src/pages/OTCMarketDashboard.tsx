import { useState, useEffect, useRef, useCallback } from 'react';
import { createWorker } from 'tesseract.js';

/* =========================================================
   TRADER YODHA X AI
   Candle Vision + Sequence Memory + Pattern Discovery
   ========================================================= */

type CandleColor = 'GREEN' | 'RED' | 'NEUTRAL';
type Signal = 'WAIT' | 'CALL' | 'PUT';
type TradeResult = 'WIN' | 'LOSS';
type CandleSize = 'TINY' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'HUGE';
type WickSize = 'NONE' | 'SMALL' | 'MEDIUM' | 'LARGE';
type CandleShape =
  | 'BULL_STRONG'
  | 'BEAR_STRONG'
  | 'BULL_REJECTION'
  | 'BEAR_REJECTION'
  | 'DOJI'
  | 'SMALL_BULL'
  | 'SMALL_BEAR'
  | 'INDECISION';

interface DetectedCandle {
  id: number;
  x: number;
  width: number;

  top: number;
  bottom: number;

  bodyTop: number;
  bodyBottom: number;

  highY: number;
  lowY: number;

  color: CandleColor;

  bodySize: number;
  topWick: number;
  bottomWick: number;

  bodyRatio: number;
  upperWickRatio: number;
  lowerWickRatio: number;

  bodyClass: CandleSize;
  topWickClass: WickSize;
  bottomWickClass: WickSize;

  shape: CandleShape;

  timestamp: number;
}

interface CandlePatternMemory {
  id: string;

  sequenceKey: string;
  sequenceLength: number;

  nextGreen: number;
  nextRed: number;
  nextNeutral: number;

  wins: number;
  losses: number;

  occurrences: number;
  confidence: number;

  lastSeen: number;

  description: string;
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

  result: TradeResult;
  timestamp: number;

  timeSync?: number;
  timeKey24H: string;
  minuteMarker: number;

  confidence: number;

  candleSequence?: string[];
}

interface MagicNumber {
  priceLevel: number;
  isRoundNumber: boolean;
  priceRange: string;

  direction: 'GREEN_TO_RED' | 'RED_TO_GREEN';

  occurrences: number;
  successRate: number;

  lastSeen: number;
}

interface TimeAlgorithm {
  timeKey24H: string;
  minuteMarker: number;
  secondMarker: number;

  direction: 'UP' | 'DOWN' | 'NEUTRAL';

  frequency: number;
  successRate: number;

  lastOccurrences: number[];
}

interface ZigZagLevel {
  price: number;
  type: 'HIGH' | 'LOW';

  occurrences: number;
  timestamp: number;

  screenY?: number;
}

interface BrainState {
  patterns: PatternMemory[];

  candlePatterns: CandlePatternMemory[];

  magicNumbers: MagicNumber[];

  timeAlgorithms: TimeAlgorithm[];

  zigzagLevels: ZigZagLevel[];

  totalTrades: number;
  winRate: number;

  lastUpdated: number;
}

interface LiveAnalysis {
  pattern: string;

  sequence: string[];

  detectedCandles: DetectedCandle[];

  dominantColor: CandleColor;

  strength: number;

  priceLevel: number;

  isRoundNumber: boolean;

  bodySize: number;
  topWick: number;
  bottomWick: number;

  detectedMagicNumbers: MagicNumber[];

  matchedZigZag: ZigZagLevel | null;

  matchedCandlePattern: CandlePatternMemory | null;

  timeKey24H: string;

  timestampSecond: number;
  currentMinute: number;

  timeSyncData: TimeAlgorithm | null;
}

interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PixelAnalysis {
  greenPixels: number;
  redPixels: number;

  candles: DetectedCandle[];

  actualBodySize: number;
  actualTopWickSize: number;
  actualBottomWickSize: number;
}

const DB_NAME = 'TraderYodhaX_AI_Database';
const DB_VERSION = 2;
const STORE_NAME = 'trader_yodha_x_brain_store';

const MAX_CANDLE_HISTORY = 120;
const PATTERN_SEQUENCE_LENGTH = 5;

/* =========================================================
   MAIN ENGINE
   ========================================================= */

export default function TraderYodhaXEngine() {
  const [stream, setStream] = useState<MediaStream | null>(null);

  const [isStreamActive, setIsStreamActive] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const [aiSignal, setAiSignal] = useState<Signal>('WAIT');

  const [statusMessage, setStatusMessage] = useState(
    'Trader Yodha X OTC Engine Ready. Connect Quotex Screen.'
  );

  const [brainStats, setBrainStats] = useState({
    patterns: 0,
    candlePatterns: 0,
    candles: 0,
    magicNumbers: 0,
    timeSyncs: 0,
    zigzag: 0,
    winRate: 0
  });

  const [currentAnalysis, setCurrentAnalysis] =
    useState<LiveAnalysis | null>(null);

  const [timeUntilCandle, setTimeUntilCandle] = useState(60);

  const [ocrPriceText, setOcrPriceText] =
    useState<string>('Searching...');

  const [isRealRoundNumber, setIsRealRoundNumber] =
    useState<boolean>(false);

  const [roiBox, setRoiBox] = useState<CropRegion>({
    x: 100,
    y: 50,
    width: 500,
    height: 350
  });

  const [isRoiLocked, setIsRoiLocked] = useState(false);

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  const [dragStart, setDragStart] = useState({
    x: 0,
    y: 0
  });

  const videoRef = useRef<HTMLVideoElement>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const overlayCanvasRef =
    useRef<HTMLCanvasElement>(null);

  const ocrCanvasRef =
    useRef<HTMLCanvasElement>(null);

  const videoContainerRef =
    useRef<HTMLDivElement>(null);

  const ocrWorkerRef = useRef<any>(null);

  /* =======================================================
     BRAIN
     ======================================================= */

  const brainRef = useRef<BrainState>({
    patterns: [],
    candlePatterns: [],
    magicNumbers: [],
    timeAlgorithms: [],
    zigzagLevels: [],

    totalTrades: 0,
    winRate: 0,

    lastUpdated: Date.now()
  });

  /*
    IMPORTANT:
    This is the actual candle history.

    The AI does not depend only on the current frame.
    It keeps the detected candle sequence here.
  */
  const candleHistoryRef =
    useRef<DetectedCandle[]>([]);

  const nextCandleIdRef =
    useRef(1);

  const pendingSignalRef =
    useRef<{
      signal: 'CALL' | 'PUT';
      analysis: LiveAnalysis;
    } | null>(null);

  const continuousLearningRef =
    useRef<ReturnType<typeof setInterval> | null>(null);

  const lastPriceRef =
    useRef<number>(0);

  const lastColorRef =
    useRef<CandleColor>('NEUTRAL');

  const priceHistoryRef =
    useRef<{ price: number; time: number }[]>([]);

  const hasScannedThisCandle =
    useRef(false);

  /*
    Prevent overlapping OCR calls.
  */
  const processingFrameRef =
    useRef(false);

  /*
    Last detected candle signature.
    Used to prevent adding the same candle every 500ms.
  */
  const lastCandleSignatureRef =
    useRef('');

  /* =======================================================
     VIDEO
     ======================================================= */

  useEffect(() => {
    if (
      isStreamActive &&
      stream &&
      videoRef.current
    ) {
      videoRef.current.srcObject = stream;
    }
  }, [isStreamActive, stream]);

  /* =======================================================
     OCR
     ======================================================= */

  useEffect(() => {
    const initOCR = async () => {
      try {
        const worker = await createWorker('eng');

        ocrWorkerRef.current = worker;

        setStatusMessage(
          'Trader Yodha X Vision Engine Initialized.'
        );
      } catch (err) {
        console.error('OCR Init Error:', err);
      }
    };

    initOCR();

    return () => {
      if (ocrWorkerRef.current) {
        ocrWorkerRef.current.terminate();
        ocrWorkerRef.current = null;
      }
    };
  }, []);

  /* =======================================================
     BRAIN STATS
     ======================================================= */

  const updateBrainStats = useCallback(() => {
    const brain = brainRef.current;

    setBrainStats({
      patterns: brain.patterns.length,

      candlePatterns:
        brain.candlePatterns.length,

      candles:
        candleHistoryRef.current.length,

      magicNumbers:
        brain.magicNumbers.length,

      timeSyncs:
        brain.timeAlgorithms.length,

      zigzag:
        brain.zigzagLevels.length,

      winRate:
        brain.winRate
    });
  }, []);

  /* =======================================================
     INDEXED DB
     ======================================================= */

  const initIndexedDB =
    useCallback((): Promise<IDBDatabase> => {
      return new Promise((resolve, reject) => {
        const request =
          indexedDB.open(
            DB_NAME,
            DB_VERSION
          );

        request.onupgradeneeded = (event) => {
          const db =
            (event.target as IDBOpenDBRequest).result;

          if (
            !db.objectStoreNames.contains(
              STORE_NAME
            )
          ) {
            db.createObjectStore(
              STORE_NAME
            );
          }
        };

        request.onsuccess = (event) => {
          resolve(
            (event.target as IDBOpenDBRequest).result
          );
        };

        request.onerror = (event) => {
          reject(
            (event.target as IDBOpenDBRequest).error
          );
        };
      });
    }, []);

  const saveBrainToDB =
    useCallback(async () => {
      try {
        const db =
          await initIndexedDB();

        const transaction =
          db.transaction(
            STORE_NAME,
            'readwrite'
          );

        const store =
          transaction.objectStore(
            STORE_NAME
          );

        brainRef.current.lastUpdated =
          Date.now();

        store.put(
          brainRef.current,
          'trader_yodha_x_brain_state'
        );

        updateBrainStats();
      } catch (err) {
        console.error(
          'IndexedDB Save Failure:',
          err
        );
      }
    }, [
      initIndexedDB,
      updateBrainStats
    ]);

  const loadBrainFromDB =
    useCallback(async () => {
      try {
        const db =
          await initIndexedDB();

        const transaction =
          db.transaction(
            STORE_NAME,
            'readonly'
          );

        const store =
          transaction.objectStore(
            STORE_NAME
          );

        const request =
          store.get(
            'trader_yodha_x_brain_state'
          );

        request.onsuccess = () => {
          if (!request.result) return;

          const parsed =
            request.result as BrainState;

          if (!parsed.patterns)
            parsed.patterns = [];

          if (!parsed.candlePatterns)
            parsed.candlePatterns = [];

          if (!parsed.magicNumbers)
            parsed.magicNumbers = [];

          if (!parsed.timeAlgorithms)
            parsed.timeAlgorithms = [];

          if (!parsed.zigzagLevels)
            parsed.zigzagLevels = [];

          brainRef.current = parsed;

          updateBrainStats();

          setStatusMessage(
            `Trader Yodha X Brain Active: ${parsed.patterns.length} trade memories + ${parsed.candlePatterns.length} candle patterns loaded.`
          );
        };
      } catch (err) {
        console.error(
          'IndexedDB Load Failure:',
          err
        );
      }
    }, [
      initIndexedDB,
      updateBrainStats
    ]);

  useEffect(() => {
    loadBrainFromDB();
  }, [loadBrainFromDB]);

  /* =======================================================
     PRICE HELPERS
     ======================================================= */

  const getPriceRange =
    (price: number): string => {
      const base =
        Math.floor(price * 1000);

      return `${(base / 1000).toFixed(
        3
      )}-${((base + 1) / 1000).toFixed(
        3
      )}`;
    };

  const checkIsRoundNumber =
    (price: number): boolean => {
      if (!price || price <= 0)
        return false;

      const priceStr =
        price.toFixed(5);

      return (
        priceStr.endsWith('000') ||
        priceStr.endsWith('500') ||
        priceStr.endsWith('0000') ||
        priceStr.endsWith('5000')
      );
    };

  /* =======================================================
     CANDLE CLASSIFICATION
     ======================================================= */

  const classifyBodySize =
    (
      body: number,
      totalRange: number
    ): CandleSize => {
      if (totalRange <= 0)
        return 'TINY';

      const ratio =
        body / totalRange;

      if (ratio < 0.10)
        return 'TINY';

      if (ratio < 0.25)
        return 'SMALL';

      if (ratio < 0.50)
        return 'MEDIUM';

      if (ratio < 0.75)
        return 'LARGE';

      return 'HUGE';
    };

  const classifyWick =
    (
      wick: number,
      body: number
    ): WickSize => {
      if (wick <= 1)
        return 'NONE';

      if (body <= 1) {
        return wick < 8
          ? 'SMALL'
          : wick < 20
          ? 'MEDIUM'
          : 'LARGE';
      }

      const ratio =
        wick / body;

      if (ratio < 0.35)
        return 'SMALL';

      if (ratio < 0.90)
        return 'MEDIUM';

      return 'LARGE';
    };

  const classifyCandleShape =
    (
      color: CandleColor,
      body: number,
      topWick: number,
      bottomWick: number
    ): CandleShape => {
      if (color === 'NEUTRAL')
        return 'INDECISION';

      const range =
        body + topWick + bottomWick;

      if (range <= 0)
        return 'INDECISION';

      const bodyRatio =
        body / range;

      const topRatio =
        topWick / Math.max(body, 1);

      const bottomRatio =
        bottomWick / Math.max(body, 1);

      if (bodyRatio < 0.12)
        return 'DOJI';

      if (
        bottomRatio >= 1.5 &&
        bottomWick > topWick
      ) {
        return color === 'GREEN'
          ? 'BULL_REJECTION'
          : 'BEAR_REJECTION';
      }

      if (
        topRatio >= 1.5 &&
        topWick > bottomWick
      ) {
        return color === 'GREEN'
          ? 'BULL_REJECTION'
          : 'BEAR_REJECTION';
      }

      if (bodyRatio >= 0.70) {
        return color === 'GREEN'
          ? 'BULL_STRONG'
          : 'BEAR_STRONG';
      }

      return color === 'GREEN'
        ? 'SMALL_BULL'
        : 'SMALL_BEAR';
    };

  /* =======================================================
     CANDLE DETECTION ENGINE
     ======================================================= */

  const detectCandlesFromPixels =
    (
      frameData: Uint8ClampedArray,
      width: number,
      height: number
    ): PixelAnalysis => {
      if (
        width <= 0 ||
        height <= 0
      ) {
        return {
          greenPixels: 0,
          redPixels: 0,
          candles: [],
          actualBodySize: 0,
          actualTopWickSize: 0,
          actualBottomWickSize: 0
        };
      }

      /*
        1. Find colored pixels.

        Instead of dividing screen into 20 chunks,
        we calculate a true X projection.
      */

      const greenX =
        new Uint32Array(width);

      const redX =
        new Uint32Array(width);

      const greenPixelsByY =
        new Uint32Array(height);

      const redPixelsByY =
        new Uint32Array(height);

      let greenPixels = 0;
      let redPixels = 0;

      for (
        let y = 0;
        y < height;
        y++
      ) {
        for (
          let x = 0;
          x < width;
          x++
        ) {
          const i =
            (y * width + x) * 4;

          const r =
            frameData[i];

          const g =
            frameData[i + 1];

          const b =
            frameData[i + 2];

          /*
            Stronger color separation
            reduces chart-grid false positives.
          */

          const green =
            g > r + 35 &&
            g > b + 25 &&
            g > 80;

          const red =
            r > g + 35 &&
            r > b + 25 &&
            r > 80;

          if (green) {
            greenX[x]++;
            greenPixelsByY[y]++;
            greenPixels++;
          }

          if (red) {
            redX[x]++;
            redPixelsByY[y]++;
            redPixels++;
          }
        }
      }

      /*
        2. Build candidate candle X columns.
      */

      const activeColumns =
        new Array<boolean>(
          width
        ).fill(false);

      for (
        let x = 0;
        x < width;
        x++
      ) {
        const total =
          greenX[x] +
          redX[x];

        /*
          Candle wick may be only 1-3 px,
          therefore threshold is intentionally low.
        */

        if (total >= 2) {
          activeColumns[x] = true;
        }
      }

      /*
        3. Group neighboring X columns.

        Small gaps are merged because anti-aliasing
        can break the candle body.
      */

      const groups: {
        start: number;
        end: number;
      }[] = [];

      let start = -1;
      let gap = 0;

      for (
        let x = 0;
        x < width;
        x++
      ) {
        if (activeColumns[x]) {
          if (start === -1) {
            start = x;
          }

          gap = 0;
        } else if (start !== -1) {
          gap++;

          if (gap > 3) {
            const end =
              x - gap;

            if (
              end - start >= 2
            ) {
              groups.push({
                start,
                end
              });
            }

            start = -1;
            gap = 0;
          }
        }
      }

      if (
        start !== -1 &&
        width - start >= 2
      ) {
        groups.push({
          start,
          end: width - 1
        });
      }

      /*
        4. Filter groups.

        A normal candle is relatively narrow.
        Very wide colored regions are usually
        UI elements or accidental detection.
      */

      const filteredGroups =
        groups.filter((group) => {
          const w =
            group.end -
            group.start +
            1;

          return (
            w >= 2 &&
            w <= Math.max(
              40,
              Math.floor(width * 0.10)
            )
          );
        });

      const candles: DetectedCandle[] = [];

      /*
        5. Build candle geometry.
      */

      for (
        const group of filteredGroups
      ) {
        const candleWidth =
          group.end -
          group.start +
          1;

        let top =
          height;

        let bottom = 0;

        let greenCount = 0;
        let redCount = 0;

        const rowOccupancy =
          new Uint16Array(height);

        const rowGreen =
          new Uint16Array(height);

        const rowRed =
          new Uint16Array(height);

        for (
          let x = group.start;
          x <= group.end;
          x++
        ) {
          for (
            let y = 0;
            y < height;
            y++
          ) {
            const i =
              (y * width + x) * 4;

            const r =
              frameData[i];

            const g =
              frameData[i + 1];

            const b =
              frameData[i + 2];

            const isGreen =
              g > r + 35 &&
              g > b + 25 &&
              g > 80;

            const isRed =
              r > g + 35 &&
              r > b + 25 &&
              r > 80;

            if (
              isGreen ||
              isRed
            ) {
              rowOccupancy[y]++;

              if (isGreen) {
                greenCount++;
                rowGreen[y]++;
              }

              if (isRed) {
                redCount++;
                rowRed[y]++;
              }

              if (y < top)
                top = y;

              if (y > bottom)
                bottom = y;
            }
          }
        }

        if (
          top >= height ||
          bottom <= top
        ) {
          continue;
        }

        const color: CandleColor =
          greenCount >
          redCount * 1.15
            ? 'GREEN'
            : redCount >
              greenCount * 1.15
            ? 'RED'
            : 'NEUTRAL';

        /*
          6. Estimate body.

          Body rows occupy a large percentage
          of candle width.

          Wick rows normally occupy only a small
          portion of the candle width.
        */

        const bodyThreshold =
          Math.max(
            2,
            candleWidth * 0.45
          );

        let bodyTop =
          bottom;

        let bodyBottom =
          top;

        for (
          let y = top;
          y <= bottom;
          y++
        ) {
          if (
            rowOccupancy[y] >=
            bodyThreshold
          ) {
            bodyTop =
              Math.min(
                bodyTop,
                y
              );

            bodyBottom =
              Math.max(
                bodyBottom,
                y
              );
          }
        }

        /*
          If body couldn't be separated,
          use densest rows.
        */

        if (
          bodyBottom <= bodyTop
        ) {
          let bestY = top;
          let bestValue = 0;

          for (
            let y = top;
            y <= bottom;
            y++
          ) {
            if (
              rowOccupancy[y] >
              bestValue
            ) {
              bestValue =
                rowOccupancy[y];

              bestY = y;
            }
          }

          bodyTop =
            Math.max(
              top,
              bestY - 2
            );

          bodyBottom =
            Math.min(
              bottom,
              bestY + 2
            );
        }

        const bodySize =
          Math.max(
            1,
            bodyBottom -
              bodyTop +
              1
          );

        const totalRange =
          Math.max(
            1,
            bottom - top + 1
          );

        const topWick =
          Math.max(
            0,
            bodyTop - top
          );

        const bottomWick =
          Math.max(
            0,
            bottom - bodyBottom
          );

        const bodyClass =
          classifyBodySize(
            bodySize,
            totalRange
          );

        const topWickClass =
          classifyWick(
            topWick,
            bodySize
          );

        const bottomWickClass =
          classifyWick(
            bottomWick,
            bodySize
          );

        const shape =
          classifyCandleShape(
            color,
            bodySize,
            topWick,
            bottomWick
          );

        candles.push({
          id: 0,

          x: group.start,

          width: candleWidth,

          top,
          bottom,

          bodyTop,
          bodyBottom,

          highY: top,
          lowY: bottom,

          color,

          bodySize,

          topWick,
          bottomWick,

          bodyRatio:
            bodySize /
            totalRange,

          upperWickRatio:
            topWick /
            Math.max(
              bodySize,
              1
            ),

          lowerWickRatio:
            bottomWick /
            Math.max(
              bodySize,
              1
            ),

          bodyClass,
          topWickClass,
          bottomWickClass,

          shape,

          timestamp: Date.now()
        });
      }

      /*
        Remove overlapping candles.
        Keep the stronger / wider candidate.
      */

      candles.sort(
        (a, b) =>
          a.x - b.x
      );

      const cleanCandles: DetectedCandle[] = [];

      for (
        const candle of candles
      ) {
        const previous =
          cleanCandles[
            cleanCandles.length - 1
          ];

        if (!previous) {
          cleanCandles.push(
            candle
          );
          continue;
        }

        const overlap =
          previous.x +
            previous.width -
            candle.x;

        if (
          overlap >
          Math.min(
            previous.width,
            candle.width
          ) *
            0.5
        ) {
          const prevScore =
            previous.bottom -
            previous.top;

          const currentScore =
            candle.bottom -
            candle.top;

          if (
            currentScore >
            prevScore
          ) {
            cleanCandles[
              cleanCandles.length - 1
            ] = candle;
          }
        } else {
          cleanCandles.push(
            candle
          );
        }
      }

      /*
        Current visible candles are normally
        left -> right.
      */

      return {
        greenPixels,
        redPixels,

        candles:
          cleanCandles,

        actualBodySize:
          cleanCandles.length
            ? cleanCandles[
                cleanCandles.length -
                  1
              ].bodySize
            : 0,

        actualTopWickSize:
          cleanCandles.length
            ? cleanCandles[
                cleanCandles.length -
                  1
              ].topWick
            : 0,

        actualBottomWickSize:
          cleanCandles.length
            ? cleanCandles[
                cleanCandles.length -
                  1
              ].bottomWick
            : 0
      };
    };

  /* =======================================================
     CANDLE NUMBERING + MEMORY
     ======================================================= */

  const makeCandleSignature =
    (
      candle: DetectedCandle
    ) => {
      return [
        candle.color,
        Math.round(candle.x / 4),
        Math.round(
          candle.top / 4
        ),
        Math.round(
          candle.bottom / 4
        ),
        candle.shape
      ].join('|');
    };

  const mergeDetectedCandlesIntoHistory =
    useCallback(
      (
        detected: DetectedCandle[]
      ) => {
        if (!detected.length)
          return;

        const sorted =
          [...detected].sort(
            (a, b) =>
              a.x - b.x
          );

        /*
          Use right-most candle as the
          currently forming/latest candle.
        */

        for (
          const detectedCandle of sorted
        ) {
          const signature =
            makeCandleSignature(
              detectedCandle
            );

          /*
            Same frame / same candle.
          */

          if (
            signature ===
            lastCandleSignatureRef.current
          ) {
            continue;
          }

          /*
            Match by approximate X.
          */

          const existing =
            candleHistoryRef.current.find(
              c =>
                Math.abs(
                  c.x -
                    detectedCandle.x
                ) < 8
            );

          if (existing) {
            /*
              Update the existing candle.
              This is important because the latest
              candle changes while it is forming.
            */

            existing.color =
              detectedCandle.color;

            existing.top =
              Math.min(
                existing.top,
                detectedCandle.top
              );

            existing.bottom =
              Math.max(
                existing.bottom,
                detectedCandle.bottom
              );

            existing.bodyTop =
              detectedCandle.bodyTop;

            existing.bodyBottom =
              detectedCandle.bodyBottom;

            existing.bodySize =
              detectedCandle.bodySize;

            existing.topWick =
              detectedCandle.topWick;

            existing.bottomWick =
              detectedCandle.bottomWick;

            existing.bodyClass =
              detectedCandle.bodyClass;

            existing.topWickClass =
              detectedCandle.topWickClass;

            existing.bottomWickClass =
              detectedCandle.bottomWickClass;

            existing.shape =
              detectedCandle.shape;

            existing.timestamp =
              Date.now();

            continue;
          }

          /*
            New candle.
          */

          const newCandle: DetectedCandle =
            {
              ...detectedCandle,

              id:
                nextCandleIdRef.current++
            };

          candleHistoryRef.current.push(
            newCandle
          );
        }

        /*
          Keep only recent memory.
        */

        if (
          candleHistoryRef.current.length >
          MAX_CANDLE_HISTORY
        ) {
          candleHistoryRef.current =
            candleHistoryRef.current.slice(
              -MAX_CANDLE_HISTORY
            );
        }

        lastCandleSignatureRef.current =
          makeCandleSignature(
            sorted[
              sorted.length - 1
            ]
          );

        updateBrainStats();
      },
      [updateBrainStats]
    );

  /* =======================================================
     CANDLE TOKEN
     ======================================================= */

  const candleToToken =
    (
      candle: DetectedCandle
    ): string => {
      return [
        candle.color === 'GREEN'
          ? 'G'
          : candle.color === 'RED'
          ? 'R'
          : 'N',

        candle.shape,

        candle.bodyClass,

        `U${candle.topWickClass}`,

        `L${candle.bottomWickClass}`
      ].join('_');
    };

  /*
    Short readable token.
    Used for UI / pattern matching.
  */

  const candleToShortToken =
    (
      candle: DetectedCandle
    ): string => {
      const color =
        candle.color === 'GREEN'
          ? 'G'
          : candle.color === 'RED'
          ? 'R'
          : 'N';

      return `${color}-${candle.shape}`;
    };

  /* =======================================================
     PATTERN DISCOVERY
     ======================================================= */

  const getRecentCandleSequence =
    (
      length = PATTERN_SEQUENCE_LENGTH
    ): DetectedCandle[] => {
      return candleHistoryRef.current.slice(
        -length
      );
    };

  const buildSequenceKey =
    (
      candles: DetectedCandle[]
    ): string => {
      return candles
        .map(
          candleToToken
        )
        .join('>');
    };

  /*
    Learn:

    A B C D E
          ↓
       next candle

    We store what the next candle became.
  */

  const learnNextCandlePattern =
    useCallback(
      (
        sequenceBeforeNext: DetectedCandle[],
        nextCandle: DetectedCandle
      ) => {
        if (
          sequenceBeforeNext.length <
          PATTERN_SEQUENCE_LENGTH
        ) {
          return;
        }

        const sequence =
          sequenceBeforeNext.slice(
            -PATTERN_SEQUENCE_LENGTH
          );

        const sequenceKey =
          buildSequenceKey(
            sequence
          );

        let memory =
          brainRef.current.candlePatterns.find(
            p =>
              p.sequenceKey ===
              sequenceKey
          );

        if (!memory) {
          memory = {
            id:
              `CP_${Date.now()}_${Math.random()
                .toString(36)
                .slice(2, 8)}`,

            sequenceKey,

            sequenceLength:
              sequence.length,

            nextGreen: 0,
            nextRed: 0,
            nextNeutral: 0,

            wins: 0,
            losses: 0,

            occurrences: 0,

            confidence: 0,

            lastSeen:
              Date.now(),

            description:
              sequence
                .map(
                  candleToShortToken
                )
                .join(' → ')
          };

          brainRef.current.candlePatterns.push(
            memory
          );
        }

        memory.occurrences++;

        if (
          nextCandle.color ===
          'GREEN'
        ) {
          memory.nextGreen++;
        } else if (
          nextCandle.color ===
          'RED'
        ) {
          memory.nextRed++;
        } else {
          memory.nextNeutral++;
        }

        memory.lastSeen =
          Date.now();

        const total =
          memory.nextGreen +
          memory.nextRed +
          memory.nextNeutral;

        const maxCount =
          Math.max(
            memory.nextGreen,
            memory.nextRed,
            memory.nextNeutral
          );

        memory.confidence =
          total > 0
            ? (maxCount / total) *
              100
            : 0;

        /*
          Prevent unlimited growth.
        */

        if (
          brainRef.current.candlePatterns
            .length > 5000
        ) {
          brainRef.current.candlePatterns =
            brainRef.current.candlePatterns.slice(
              -5000
            );
        }
      },
      []
    );

  /*
    Run pattern learning when a new candle appears.
  */

  const learnFromCandleHistory =
    useCallback(() => {
      const history =
        candleHistoryRef.current;

      if (
        history.length <
        PATTERN_SEQUENCE_LENGTH + 1
      ) {
        return;
      }

      /*
        Learn the most recent completed transition.
      */

      const nextCandle =
        history[
          history.length - 1
        ];

      const sequence =
        history.slice(
          -(
            PATTERN_SEQUENCE_LENGTH +
            1
          ),
          -1
        );

      learnNextCandlePattern(
        sequence,
        nextCandle
      );

      updateBrainStats();
    }, [
      learnNextCandlePattern,
      updateBrainStats
    ]);

  /* =======================================================
     MATCH CANDLE PATTERN
     ======================================================= */

  const findMatchingCandlePattern =
    (
      candles: DetectedCandle[]
    ): CandlePatternMemory | null => {
      if (
        candles.length <
        PATTERN_SEQUENCE_LENGTH
      ) {
        return null;
      }

      const sequence =
        candles.slice(
          -PATTERN_SEQUENCE_LENGTH
        );

      const key =
        buildSequenceKey(
          sequence
        );

      const exact =
        brainRef.current.candlePatterns.find(
          p =>
            p.sequenceKey ===
            key
        );

      if (exact) {
        return exact;
      }

      /*
        Fallback:
        match color + shape only.

        This makes the memory slightly more
        tolerant to small visual differences.
      */

      const shortKey =
        sequence
          .map(
            candleToShortToken
          )
          .join('>');

      let best:
        CandlePatternMemory | null =
        null;

      let bestScore = 0;

      for (
        const memory of
          brainRef.current
            .candlePatterns
      ) {
        const memoryShort =
          memory.description;

        const parts =
          memoryShort.split(
            ' → '
          );

        const target =
          shortKey.split('>');

        if (
          parts.length !==
          target.length
        ) {
          continue;
        }

        let matches = 0;

        for (
          let i = 0;
          i < target.length;
          i++
        ) {
          if (
            parts[i] ===
            target[i]
          ) {
            matches++;
          }
        }

        const score =
          matches /
          target.length;

        if (
          score >
            bestScore &&
          score >= 0.60
        ) {
          bestScore = score;
          best = memory;
        }
      }

      return best;
    };

  /* =======================================================
     DRAW CANDLE NUMBERS
     ======================================================= */

  const drawCandleOverlays =
    useCallback(
      (
        candles: DetectedCandle[]
      ) => {
        if (
          !overlayCanvasRef.current ||
          !videoRef.current ||
          !videoContainerRef.current
        ) {
          return;
        }

        const canvas =
          overlayCanvasRef.current;

        const container =
          videoContainerRef.current;

        const width =
          container.clientWidth ||
          800;

        const height =
          container.clientHeight ||
          450;

        canvas.width =
          width;

        canvas.height =
          height;

        const ctx =
          canvas.getContext(
            '2d'
          );

        if (!ctx) return;

        ctx.clearRect(
          0,
          0,
          width,
          height
        );

        const videoWidth =
          videoRef.current
            .videoWidth ||
          width;

        const videoHeight =
          videoRef.current
            .videoHeight ||
          height;

        /*
          ROI coordinates are in video space.
          Convert detected ROI pixels to displayed
          container coordinates.
        */

        const roi =
          getScaledROI();

        const roiDisplayScaleX =
          roi.width > 0
            ? roiBox.width /
              roi.width
            : 1;

        const roiDisplayScaleY =
          roi.height > 0
            ? roiBox.height /
              roi.height
            : 1;

        candles.forEach(
          (candle) => {
            /*
              Candle x/y is relative to ROI.
            */

            const displayX =
              roiBox.x +
              candle.x *
                roiDisplayScaleX;

            const displayWidth =
              Math.max(
                3,
                candle.width *
                  roiDisplayScaleX
              );

            const displayTop =
              roiBox.y +
              candle.top *
                roiDisplayScaleY;

            const displayBottom =
              roiBox.y +
              candle.bottom *
                roiDisplayScaleY;

            /*
              Candle outline.
            */

            ctx.save();

            ctx.lineWidth = 1.5;

            ctx.setLineDash([
              3,
              3
            ]);

            ctx.strokeStyle =
              candle.color ===
              'GREEN'
                ? '#22c55e'
                : candle.color ===
                  'RED'
                ? '#ef4444'
                : '#94a3b8';

            ctx.strokeRect(
              displayX,
              displayTop,
              displayWidth,
              Math.max(
                5,
                displayBottom -
                  displayTop
              )
            );

            ctx.setLineDash([]);

            /*
              Number above candle.
            */

            const numberX =
              displayX +
              displayWidth / 2;

            const numberY =
              Math.max(
                16,
                displayTop - 5
              );

            ctx.font =
              'bold 13px monospace';

            ctx.textAlign =
              'center';

            ctx.textBaseline =
              'bottom';

            ctx.fillStyle =
              candle.color ===
              'GREEN'
                ? '#84cc16'
                : candle.color ===
                  'RED'
                ? '#f43f5e'
                : '#cbd5e1';

            ctx.fillText(
              String(candle.id),
              numberX,
              numberY
            );

            /*
              Small body/wick information
              on latest candles only.
            */

            if (
              candle.id >=
              Math.max(
                1,
                nextCandleIdRef.current -
                  5
              )
            ) {
              ctx.font =
                '9px monospace';

              ctx.fillText(
                `${candle.shape}`,
                numberX,
                Math.min(
                  height - 5,
                  displayBottom +
                    13
                )
              );
            }

            ctx.restore();
          }
        );

        /*
          Draw a small legend.
        */

        ctx.save();

        ctx.font =
          'bold 10px monospace';

        ctx.textAlign =
          'left';

        ctx.fillStyle =
          '#67e8f9';

        ctx.fillText(
          `CANDLES DETECTED: ${candleHistoryRef.current.length}`,
          10,
          18
        );

        ctx.restore();
      },
      [
        getScaledROI,
        roiBox,
        nextCandleIdRef
      ]
    );

  /* =======================================================
     ZIGZAG OVERLAY
     ======================================================= */

  const drawZigZagOverlays =
    useCallback(() => {
      /*
        Candle drawing is handled separately.
        This function now only draws historical
        ZigZag levels.
      */

      if (
        !overlayCanvasRef.current ||
        !videoRef.current
      ) {
        return;
      }

      const canvas =
        overlayCanvasRef.current;

      const ctx =
        canvas.getContext(
          '2d'
        );

      if (!ctx) return;

      const levels =
        brainRef.current
          .zigzagLevels;

      if (!levels.length)
        return;

      levels
        .slice(-5)
        .forEach(
          (level) => {
            const y =
              level.screenY ||
              Math.floor(
                canvas.height *
                  0.4
              );

            ctx.save();

            ctx.beginPath();

            ctx.setLineDash([
              6,
              6
            ]);

            ctx.strokeStyle =
              level.type ===
              'HIGH'
                ? '#f43f5e'
                : '#10b981';

            ctx.lineWidth = 1.5;

            ctx.moveTo(
              0,
              y
            );

            ctx.lineTo(
              canvas.width,
              y
            );

            ctx.stroke();

            ctx.setLineDash([]);

            ctx.fillStyle =
              level.type ===
              'HIGH'
                ? '#f43f5e'
                : '#10b981';

            ctx.font =
              'bold 11px monospace';

            ctx.fillText(
              `ZIGZAG ${level.type}: ${level.price.toFixed(
                5
              )}`,
              10,
              Math.max(
                14,
                y - 5
              )
            );

            ctx.restore();
          }
        );
    },
    []
  );

  /* =======================================================
     ZIGZAG LOGIC
     ======================================================= */

  const processZigZagLogic =
    useCallback(
      (currentPrice: number) => {
        const history =
          priceHistoryRef.current;

        history.push({
          price: currentPrice,
          time: Date.now()
        });

        if (
          history.length > 50
        ) {
          history.shift();
        }

        if (
          history.length < 10
        ) {
          return;
        }

        const prices =
          history.map(
            h => h.price
          );

        const maxPrice =
          Math.max(
            ...prices
          );

        const minPrice =
          Math.min(
            ...prices
          );

        const lastIndex =
          history.length - 1;

        let detectedPeak:
          | 'HIGH'
          | 'LOW'
          | null = null;

        let peakPrice = 0;

        if (
          history[lastIndex]
            .price ===
            maxPrice &&
          maxPrice -
            history[0]
              .price >
            0.00030
        ) {
          detectedPeak =
            'HIGH';

          peakPrice =
            maxPrice;
        } else if (
          history[lastIndex]
            .price ===
            minPrice &&
          history[0]
            .price -
            minPrice >
            0.00030
        ) {
          detectedPeak =
            'LOW';

          peakPrice =
            minPrice;
        }

        if (!detectedPeak)
          return;

        const brain =
          brainRef.current;

        const existingLevel =
          brain.zigzagLevels.find(
            zl =>
              Math.abs(
                zl.price -
                  peakPrice
              ) <
              0.00020
          );

        if (existingLevel) {
          existingLevel.occurrences++;

          existingLevel.timestamp =
            Date.now();
        } else {
          brain.zigzagLevels.push(
            {
              price:
                peakPrice,

              type:
                detectedPeak,

              occurrences: 1,

              timestamp:
                Date.now(),

              /*
                No random Y now.
                It will be updated only if
                a reliable screen mapping is available.
              */
              screenY:
                undefined
            }
          );
        }

        updateBrainStats();
      },
      [updateBrainStats]
    );

  /* =======================================================
     MAGIC NUMBER
     ======================================================= */

  const detectMagicNumber =
    useCallback(
      (
        currentPrice: number,
        currentColor: CandleColor,
        lastPrice: number,
        lastColor: CandleColor
      ) => {
        if (
          lastColor ===
            currentColor ||
          currentColor ===
            'NEUTRAL' ||
          lastColor ===
            'NEUTRAL'
        ) {
          return;
        }

        const isRound =
          checkIsRoundNumber(
            currentPrice
          );

        const priceRange =
          getPriceRange(
            currentPrice
          );

        const direction =
          lastColor === 'GREEN'
            ? 'GREEN_TO_RED'
            : 'RED_TO_GREEN';

        const existing =
          brainRef.current.magicNumbers.find(
            mn =>
              Math.abs(
                mn.priceLevel -
                  currentPrice
              ) <
                0.0003 &&
              mn.priceRange ===
                priceRange
          );

        if (existing) {
          existing.occurrences++;

          existing.lastSeen =
            Date.now();

          existing.isRoundNumber =
            isRound;
        } else {
          brainRef.current.magicNumbers.push(
            {
              priceLevel:
                currentPrice,

              isRoundNumber:
                isRound,

              priceRange,

              direction,

              occurrences: 1,

              successRate: 50,

              lastSeen:
                Date.now()
            }
          );
        }
      },
      []
    );

  /* =======================================================
     TIME ALGORITHM
     ======================================================= */

  const trackTimeAlgorithm =
    useCallback(
      (
        currentMinute: number,
        currentSecond: number,
        color: CandleColor
      ) => {
        const brain =
          brainRef.current;

        const now =
          new Date();

        /*
          Store minute + second bucket.
          Exact hour:minute:second is too sparse.
        */

        const timeKey24H =
          `${String(
            now.getHours()
          ).padStart(
            2,
            '0'
          )}:${String(
            currentMinute
          ).padStart(
            2,
            '0'
          )}:${String(
            Math.floor(
              currentSecond /
                5
            ) * 5
          ).padStart(
            2,
            '0'
          )}`;

        let timeAlgo =
          brain.timeAlgorithms.find(
            ta =>
              ta.timeKey24H ===
              timeKey24H
          );

        const direction =
          color === 'GREEN'
            ? 'UP'
            : color === 'RED'
            ? 'DOWN'
            : 'NEUTRAL';

        if (!timeAlgo) {
          timeAlgo = {
            timeKey24H,

            minuteMarker:
              currentMinute,

            secondMarker:
              Math.floor(
                currentSecond /
                  5
              ) * 5,

            direction,

            frequency: 1,

            successRate: 50,

            lastOccurrences: [
              Date.now()
            ]
          };

          brain.timeAlgorithms.push(
            timeAlgo
          );
        } else {
          timeAlgo.frequency++;

          timeAlgo.lastOccurrences.push(
            Date.now()
          );

          if (
            timeAlgo.lastOccurrences
              .length > 30
          ) {
            timeAlgo.lastOccurrences =
              timeAlgo.lastOccurrences.slice(
                -30
              );
          }
        }

        updateBrainStats();
      },
      [updateBrainStats]
    );

  /* =======================================================
     ROI
     ======================================================= */

  const getScaledROI =
    useCallback(() => {
      if (
        !videoRef.current ||
        !videoContainerRef.current
      ) {
        return roiBox;
      }

      const containerWidth =
        videoContainerRef.current
          .clientWidth ||
        800;

      const containerHeight =
        videoContainerRef.current
          .clientHeight ||
        450;

      const actualWidth =
        videoRef.current
          .videoWidth ||
        containerWidth;

      const actualHeight =
        videoRef.current
          .videoHeight ||
        containerHeight;

      const scaleX =
        actualWidth /
        containerWidth;

      const scaleY =
        actualHeight /
        containerHeight;

      return {
        x: Math.max(
          0,
          Math.floor(
            roiBox.x *
              scaleX
          )
        ),

        y: Math.max(
          0,
          Math.floor(
            roiBox.y *
              scaleY
          )
        ),

        width: Math.min(
          actualWidth,
          Math.floor(
            roiBox.width *
              scaleX
          )
        ),

        height: Math.min(
          actualHeight,
          Math.floor(
            roiBox.height *
              scaleY
          )
        )
      };
    }, [roiBox]);

  /* =======================================================
     OCR PRICE
     ======================================================= */

  const extractPriceLevelWithOCR =
    async (
      ctx: CanvasRenderingContext2D
    ): Promise<number> => {
      if (
        !ocrWorkerRef.current ||
        !ocrCanvasRef.current
      ) {
        return (
          lastPriceRef.current ||
          0
        );
      }

      const ocrCtx =
        ocrCanvasRef.current.getContext(
          '2d'
        );

      if (!ocrCtx) {
        return (
          lastPriceRef.current ||
          0
        );
      }

      const targetROI =
        getScaledROI();

      ocrCanvasRef.current.width =
        Math.max(
          1,
          targetROI.width
        );

      ocrCanvasRef.current.height =
        Math.max(
          1,
          targetROI.height
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
            ocrCanvasRef.current
          );

        const text =
          result?.data?.text ||
          '';

        const matches =
          text.match(
            /\d+\.\d{2,5}/g
          );

        if (matches?.length) {
          /*
            Prefer the largest plausible numeric
            price candidate.
          */

          const candidates =
            matches
              .map(
                v =>
                  parseFloat(v)
              )
              .filter(
                v =>
                  Number.isFinite(
                    v
                  ) &&
                  v > 0
              );

          if (
            candidates.length
          ) {
            const parsedPrice =
              candidates[
                candidates.length -
                  1
              ];

            const isRound =
              checkIsRoundNumber(
                parsedPrice
              );

            setOcrPriceText(
              `${parsedPrice.toFixed(
                5
              )} ${
                isRound
                  ? '🎯 [ROUND SNR]'
                  : ''
              }`
            );

            setIsRealRoundNumber(
              isRound
            );

            return parsedPrice;
          }
        }
      } catch (e) {
        /*
          OCR can temporarily fail when the screen
          changes. Keep previous price.
        */
      }

      return (
        lastPriceRef.current ||
        0
      );
    };

  /* =======================================================
     FULL FRAME ANALYSIS
     ======================================================= */

  const analyzeCurrentFrame =
    useCallback(
      async () => {
        if (
          processingFrameRef.current
        ) {
          return;
        }

        if (
          !canvasRef.current ||
          !videoRef.current
        ) {
          return;
        }

        processingFrameRef.current =
          true;

        try {
          const ctx =
            canvasRef.current.getContext(
              '2d',
              {
                willReadFrequently:
                  true
              }
            );

          if (!ctx) return;

          const vWidth =
            videoRef.current
              .videoWidth ||
            800;

          const vHeight =
            videoRef.current
              .videoHeight ||
            400;

          canvasRef.current.width =
            vWidth;

          canvasRef.current.height =
            vHeight;

          ctx.drawImage(
            videoRef.current,
            0,
            0,
            vWidth,
            vHeight
          );

          const targetROI =
            getScaledROI();

          const roiWidth =
            Math.max(
              1,
              targetROI.width
            );

          const roiHeight =
            Math.max(
              1,
              targetROI.height
            );

          const cropped =
            ctx.getImageData(
              targetROI.x,
              targetROI.y,
              roiWidth,
              roiHeight
            );

          const analysis =
            detectCandlesFromPixels(
              cropped.data,
              roiWidth,
              roiHeight
            );

          /*
            Add detected candles to history.
          */

          mergeDetectedCandlesIntoHistory(
            analysis.candles
          );

          /*
            Learn transitions when enough candles
            are available.
          */

          learnFromCandleHistory();

          /*
            Draw numbered candles.
          */

          drawCandleOverlays(
            analysis.candles
          );

          /*
            Draw ZigZag after candle layer.
          */

          drawZigZagOverlays();

          const currentPrice =
            await extractPriceLevelWithOCR(
              ctx
            );

          const latestCandle =
            candleHistoryRef.current[
              candleHistoryRef.current
                .length - 1
            ];

          const currentColor =
            latestCandle?.color ||
            'NEUTRAL';

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

          lastColorRef.current =
            currentColor;
        } finally {
          processingFrameRef.current =
            false;
        }
      },
      [
        getScaledROI,
        detectCandlesFromPixels,
        mergeDetectedCandlesIntoHistory,
        learnFromCandleHistory,
        drawCandleOverlays,
        drawZigZagOverlays,
        processZigZagLogic,
        detectMagicNumber,
        trackTimeAlgorithm
      ]
    );

  /* =======================================================
     CONTINUOUS LEARNING
     ======================================================= */

  const startContinuousLearning =
    useCallback(
      (
        mediaStream: MediaStream
      ) => {
        /*
          Stop previous loop first.
        */

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
              !mediaStream.active ||
              !videoRef.current
            ) {
              return;
            }

            /*
              500ms vision cycle.
              OCR itself is protected against overlap.
            */

            analyzeCurrentFrame();
          }, 500);

        continuousLearningRef.current =
          learnInterval;
      },
      [analyzeCurrentFrame]
    );

  /* =======================================================
     CONNECT SCREEN
     ======================================================= */

  const connectStream =
    async () => {
      try {
        const mediaStream =
          await navigator.mediaDevices.getDisplayMedia(
            {
              video: {
                displaySurface:
                  'window',

                width: 1280,

                height: 720,

                frameRate: 30
              } as any,

              audio: false
            }
          );

        setStream(
          mediaStream
        );

        setIsStreamActive(
          true
        );

        setStatusMessage(
          'Connected! Candle Vision + Pattern Memory is learning...'
        );

        /*
          If user stops sharing from browser UI.
        */

        mediaStream
          .getVideoTracks()
          .forEach(
            track => {
              track.onended =
                () => {
                  disconnectStream();
                };
            }
          );

        startContinuousLearning(
          mediaStream
        );
      } catch (err) {
        console.error(err);

        setStatusMessage(
          'Connection failed. Share the chart screen.'
        );
      }
    };

  /* =======================================================
     DISCONNECT
     ======================================================= */

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

      if (stream) {
        stream
          .getTracks()
          .forEach(
            track =>
              track.stop()
          );
      }

      setStream(null);

      setIsStreamActive(
        false
      );

      setIsScanning(false);

      setAiSignal('WAIT');

      pendingSignalRef.current =
        null;

      setStatusMessage(
        'Engine paused.'
      );
    };

  /* =======================================================
     46 SECOND ANALYSIS
     ======================================================= */

  const execute46sFullAnalysis =
    async () => {
      if (isScanning)
        return;

      setIsScanning(
        true
      );

      setStatusMessage(
        '46s Deep Candle + Pattern Analysis running...'
      );

      try {
        /*
          Force one fresh frame.
        */

        await analyzeCurrentFrame();

        const recentCandles =
          getRecentCandleSequence(
            20
          );

        if (
          recentCandles.length <
          3
        ) {
          setStatusMessage(
            'Not enough candles detected yet. Keep the chart visible and allow the engine to learn.'
          );

          return;
        }

        const latest =
          recentCandles[
            recentCandles.length -
              1
          ];

        const currentPrice =
          lastPriceRef.current ||
          0;

        const isRound =
          checkIsRoundNumber(
            currentPrice
          );

        const priceRange =
          getPriceRange(
            currentPrice
          );

        /*
          Recent 5-candle pattern.
        */

        const sequence5 =
          recentCandles.slice(
            -PATTERN_SEQUENCE_LENGTH
          );

        const sequenceTokens =
          sequence5.map(
            candleToShortToken
          );

        const matchedCandlePattern =
          findMatchingCandlePattern(
            sequence5
          );

        /*
          ZigZag match.
        */

        const matchedZigZag =
          brainRef.current.zigzagLevels.reduce(
            (
              closest,
              current
            ) => {
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
                currentDiff <
                  0.00150
                ? current
                : closest;
            },
            null as
              | ZigZagLevel
              | null
          );

        /*
          Magic levels.
        */

        const relevantMagicNumbers =
          brainRef.current.magicNumbers.filter(
            mn =>
              mn.priceRange ===
                priceRange &&
              Math.abs(
                mn.priceLevel -
                  currentPrice
              ) <
                0.005
          );

        const now =
          new Date();

        const currentMinute =
          now.getMinutes();

        const currentSecond =
          now.getSeconds();

        const timeKey24H =
          `${String(
            now.getHours()
          ).padStart(
            2,
            '0'
          )}:${String(
            currentMinute
          ).padStart(
            2,
            '0'
          )}:${String(
            Math.floor(
              currentSecond /
                5
            ) * 5
          ).padStart(
            2,
            '0'
          )}`;

        const timeSyncData =
          brainRef.current.timeAlgorithms.find(
            ta =>
              ta.timeKey24H ===
              timeKey24H
          ) || null;

        /* =================================================
           SIGNAL SCORING
           ================================================= */

        let callScore = 0;
        let putScore = 0;

        const reasons: string[] =
          [];

        /*
          A. Latest candle color.
        */

        if (
          latest.color ===
          'GREEN'
        ) {
          callScore += 1;
          reasons.push(
            'LATEST GREEN'
          );
        }

        if (
          latest.color ===
          'RED'
        ) {
          putScore += 1;
          reasons.push(
            'LATEST RED'
          );
        }

        /*
          B. Strong body.
        */

        if (
          latest.bodyClass ===
          'LARGE' ||
          latest.bodyClass ===
          'HUGE'
        ) {
          if (
            latest.color ===
            'GREEN'
          ) {
            callScore += 1.5;
          }

          if (
            latest.color ===
            'RED'
          ) {
            putScore += 1.5;
          }

          reasons.push(
            `STRONG BODY ${latest.bodyClass}`
          );
        }

        /*
          C. Lower wick rejection.
        */

        if (
          latest.lowerWickRatio >=
          1.5
        ) {
          callScore += 2;

          reasons.push(
            'LOWER WICK REJECTION'
          );
        }

        /*
          D. Upper wick rejection.
        */

        if (
          latest.upperWickRatio >=
          1.5
        ) {
          putScore += 2;

          reasons.push(
            'UPPER WICK REJECTION'
          );
        }

        /*
          E. Candle pattern memory.
        */

        if (
          matchedCandlePattern
        ) {
          const p =
            matchedCandlePattern;

          const totalNext =
            p.nextGreen +
            p.nextRed +
            p.nextNeutral;

          if (
            totalNext > 0
          ) {
            const greenProb =
              p.nextGreen /
              totalNext;

            const redProb =
              p.nextRed /
              totalNext;

            /*
              Only use historical pattern
              strongly when enough observations exist.
            */

            if (
              p.occurrences >=
                5 &&
              p.confidence >=
                55
            ) {
              callScore +=
                greenProb * 3;

              putScore +=
                redProb * 3;

              reasons.push(
                `MEMORY ${p.confidence.toFixed(
                  1
                )}%`
              );
            }
          }
        }

        /*
          F. ZigZag rejection.
        */

        if (
          matchedZigZag
        ) {
          if (
            matchedZigZag.type ===
            'HIGH'
          ) {
            putScore += 2;

            reasons.push(
              'ZIGZAG HIGH'
            );
          }

          if (
            matchedZigZag.type ===
            'LOW'
          ) {
            callScore += 2;

            reasons.push(
              'ZIGZAG LOW'
            );
          }
        }

        /*
          G. Round number.
        */

        if (isRound) {
          /*
            Round number by itself is not direction.
            It only becomes meaningful when rejection
            evidence exists.
          */

          if (
            latest.upperWickRatio >=
            1.3
          ) {
            putScore += 1;

            reasons.push(
              'ROUND + UPPER REJECTION'
            );
          }

          if (
            latest.lowerWickRatio >=
            1.3
          ) {
            callScore += 1;

            reasons.push(
              'ROUND + LOWER REJECTION'
            );
          }
        }

        /*
          H. Recent candle momentum.
        */

        const last3 =
          recentCandles.slice(
            -3
          );

        const green3 =
          last3.filter(
            c =>
              c.color ===
              'GREEN'
          ).length;

        const red3 =
          last3.filter(
            c =>
              c.color ===
              'RED'
          ).length;

        if (
          green3 >= 2
        ) {
          callScore += 1;

          reasons.push(
            '3-CANDLE GREEN MOMENTUM'
          );
        }

        if (
          red3 >= 2
        ) {
          putScore += 1;

          reasons.push(
            '3-CANDLE RED MOMENTUM'
          );
        }

        /*
          I. Recent reversal.
        */

        if (
          latest.shape ===
            'BULL_REJECTION' &&
          latest.lowerWick >
            latest.topWick
        ) {
          callScore += 1.5;

          reasons.push(
            'BULL REJECTION'
          );
        }

        if (
          latest.shape ===
            'BEAR_REJECTION' &&
          latest.topWick >
            latest.bottomWick
        ) {
          putScore += 1.5;

          reasons.push(
            'BEAR REJECTION'
          );
        }

        /*
          Final direction.
        */

        let proposedSignal:
          | 'CALL'
          | 'PUT';

        if (
          callScore >
          putScore
        ) {
          proposedSignal =
            'CALL';
        } else if (
          putScore >
          callScore
        ) {
          proposedSignal =
            'PUT';
        } else {
          /*
            If scores are exactly equal,
            use latest candle only as tie breaker.
          */

          proposedSignal =
            latest.color ===
            'GREEN'
              ? 'CALL'
              : 'PUT';
        }

        /*
          Evidence-based confidence.

          This is NOT a guaranteed probability of
          winning a trade. It is an internal evidence
          score.
        */

        const totalScore =
          callScore +
          putScore;

        const winningScore =
          Math.max(
            callScore,
            putScore
          );

        let confidence =
          totalScore > 0
            ? (winningScore /
                totalScore) *
              100
            : 50;

        /*
          Historical pattern can increase confidence,
          but we cap it to avoid fake 100%.
        */

        if (
          matchedCandlePattern &&
          matchedCandlePattern.occurrences >=
            5
        ) {
          confidence +=
            Math.min(
              8,
              matchedCandlePattern.confidence /
                20
            );
        }

        confidence =
          Math.min(
            95,
            Math.max(
              50,
              confidence
            )
          );

        const dominantColor =
          latest.color;

        const patternString =
          [
            `46S CANDLE VISION`,
            `Candles=${recentCandles.length}`,
            `Latest=#${latest.id}`,
            `Shape=${latest.shape}`,
            `Body=${latest.bodyClass}`,
            `UpperWick=${latest.topWickClass}`,
            `LowerWick=${latest.bottomWickClass}`,
            `CALL=${callScore.toFixed(
              2
            )}`,
            `PUT=${putScore.toFixed(
              2
            )}`,
            matchedCandlePattern
              ? `MEMORY=${matchedCandlePattern.confidence.toFixed(
                  1
                )}%/${matchedCandlePattern.occurrences}x`
              : 'MEMORY=NO_MATCH',
            reasons.join(
              ' | '
            )
          ].join(
            ' | '
          );

        const liveData:
          LiveAnalysis = {
            pattern:
              patternString,

            sequence:
              sequenceTokens,

            detectedCandles:
              recentCandles,

            dominantColor,

            strength:
              confidence,

            priceLevel:
              currentPrice,

            isRoundNumber:
              isRound,

            bodySize:
              latest.bodySize,

            topWick:
              latest.topWick,

            bottomWick:
              latest.bottomWick,

            detectedMagicNumbers:
              relevantMagicNumbers,

            matchedZigZag,

            matchedCandlePattern,

            timeKey24H,

            timestampSecond:
              currentSecond,

            currentMinute,

            timeSyncData
          };

        setCurrentAnalysis(
          liveData
        );

        pendingSignalRef.current =
          {
            signal:
              proposedSignal,

            analysis:
              liveData
          };

        setStatusMessage(
          `Signal prepared [${proposedSignal}] | Evidence ${confidence.toFixed(
            1
          )}% | ${latest.shape} | Candle #${latest.id}`
        );
      } catch (err) {
        console.error(
          '46s Analysis Error:',
          err
        );

        setStatusMessage(
          '46s analysis error. Check ROI and chart visibility.'
        );
      } finally {
        setIsScanning(
          false
        );
      }
    };

  /* =======================================================
     MANUAL
     ======================================================= */

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

      execute46sFullAnalysis();
    };

  /* =======================================================
     CANDLE CLOCK
     ======================================================= */

  useEffect(() => {
    const candleSync =
      setInterval(() => {
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

        /*
          New minute.
        */

        if (
          seconds === 0
        ) {
          hasScannedThisCandle.current =
            false;
        }

        /*
          Automatic 46-second analysis.
        */

        if (
          isStreamActive &&
          seconds === 46 &&
          !hasScannedThisCandle.current
        ) {
          hasScannedThisCandle.current =
            true;

          execute46sFullAnalysis();
        }

        /*
          Exact 00:00 entry window.

          We intentionally do NOT use 59 seconds.
        */

        if (
          pendingSignalRef.current &&
          seconds === 0 &&
          milliseconds < 500
        ) {
          setAiSignal(
            pendingSignalRef.current
              .signal
          );

          setStatusMessage(
            `🚀 SIGNAL ACTIVE: ${pendingSignalRef.current.signal} | Entry Time: 00:00`
          );

          pendingSignalRef.current =
            null;
        }
      }, 100);

    return () =>
      clearInterval(
        candleSync
      );
  }, [
    isStreamActive,
    isScanning
  ]);

  /* =======================================================
     TRADE OUTCOME
     ======================================================= */

  const logTradeOutcome =
    (
      result: TradeResult
    ) => {
      if (
        aiSignal === 'WAIT' ||
        !currentAnalysis
      ) {
        return;
      }

      const brain =
        brainRef.current;

      const patternId =
        `${currentAnalysis.bodySize.toFixed(
          0
        )}_${Date.now()}`;

      /*
        Save trade pattern.
      */

      brain.patterns.push({
        id: patternId,

        pattern:
          currentAnalysis.pattern,

        sequenceLength:
          currentAnalysis.sequence
            .length,

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

        timeKey24H:
          currentAnalysis.timeKey24H,

        minuteMarker:
          currentAnalysis.currentMinute,

        confidence:
          currentAnalysis.strength,

        candleSequence:
          currentAnalysis.sequence
      });

      /*
        Update total trade stats.
      */

      brain.totalTrades++;

      const wins =
        brain.patterns.filter(
          p =>
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

      /*
        IMPORTANT:
        Connect trade outcome to the candle pattern.

        This allows the brain to learn:
        "This candle sequence was followed by a
        successful/unsuccessful signal."
      */

      const matchedPattern =
        currentAnalysis.matchedCandlePattern;

      if (
        matchedPattern
      ) {
        if (
          result ===
          'WIN'
        ) {
          matchedPattern.wins++;
        } else {
          matchedPattern.losses++;
        }

        const total =
          matchedPattern.wins +
          matchedPattern.losses;

        /*
          Pattern trade success rate is stored
          indirectly through wins/losses.
        */

        if (total > 0) {
          const patternSuccess =
            (matchedPattern.wins /
              total) *
            100;

          /*
            Blend next-candle confidence and
            trade success into the internal confidence.
          */

          matchedPattern.confidence =
            matchedPattern
              .nextGreen +
              matchedPattern
                .nextRed +
              matchedPattern
                .nextNeutral >
            0
              ? (
                  matchedPattern
                    .confidence *
                    0.70 +
                  patternSuccess *
                    0.30
                )
              : patternSuccess;
        }
      }

      saveBrainToDB();

      setStatusMessage(
        `Outcome logged [${result}] | System Win Rate: ${brain.winRate.toFixed(
          1
        )}% | Candle pattern memory updated.`
      );

      setAiSignal(
        'WAIT'
      );

      setCurrentAnalysis(
        null
      );
    };

  /* =======================================================
     ROI MOUSE
     ======================================================= */

  const handleMouseDown =
    (
      e: React.MouseEvent
    ) => {
      if (isRoiLocked)
        return;

      e.stopPropagation();

      setIsDragging(
        true
      );

      const bounds =
        videoContainerRef.current?.getBoundingClientRect();

      if (!bounds) return;

      setDragStart({
        x:
          e.clientX -
          bounds.left -
          roiBox.x,

        y:
          e.clientY -
          bounds.top -
          roiBox.y
      });
    };

  const handleResizeDown =
    (
      e: React.MouseEvent
    ) => {
      if (isRoiLocked)
        return;

      e.stopPropagation();

      setIsResizing(
        true
      );

      setDragStart({
        x: e.clientX,
        y: e.clientY
      });
    };

  const handleMouseMove =
    (
      e: React.MouseEvent
    ) => {
      if (
        isRoiLocked ||
        (!isDragging &&
          !isResizing)
      ) {
        return;
      }

      if (
        !videoContainerRef.current
      ) {
        return;
      }

      const bounds =
        videoContainerRef.current.getBoundingClientRect();

      if (isDragging) {
        const newX =
          Math.max(
            0,
            Math.min(
              bounds.width -
                roiBox.width,
              e.clientX -
                bounds.left -
                dragStart.x
            )
          );

        const newY =
          Math.max(
            0,
            Math.min(
              bounds.height -
                roiBox.height,
              e.clientY -
                bounds.top -
                dragStart.y
            )
          );

        setRoiBox(
          prev => ({
            ...prev,
            x: newX,
            y: newY
          })
        );
      }

      if (isResizing) {
        const deltaX =
          e.clientX -
          dragStart.x;

        const deltaY =
          e.clientY -
          dragStart.y;

        setDragStart({
          x: e.clientX,
          y: e.clientY
        });

        setRoiBox(
          prev => ({
            ...prev,

            width:
              Math.max(
                180,
                Math.min(
                  bounds.width -
                    prev.x,
                  prev.width +
                    deltaX
                )
              ),

            height:
              Math.max(
                120,
                Math.min(
                  bounds.height -
                    prev.y,
                  prev.height +
                    deltaY
                )
              )
          })
        );
      }
    };

  const handleMouseUp =
    () => {
      setIsDragging(
        false
      );

      setIsResizing(
        false
      );
    };

  /* =======================================================
     UI
     ======================================================= */

  return (
    <div
      className="min-h-screen bg-[#040814] text-slate-100 font-sans"
      onMouseMove={
        handleMouseMove
      }
      onMouseUp={
        handleMouseUp
      }
    >
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-cyan-400 tracking-wider">
              TRADER YODHA X AI
            </h1>

            <p className="text-slate-500 text-sm">
              Candle Vision + Body/Wick Intelligence + Pattern Memory + 46S Engine
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right mr-4">
              <div className="text-xs text-slate-500">
                AI Brain
              </div>

              <div className="text-sm font-mono text-emerald-400">
                {brainStats.candles} Candles |{' '}
                {brainStats.candlePatterns}{' '}
                Patterns
              </div>

              <div className="text-xs font-mono text-slate-400">
                {brainStats.patterns} Trades | WR:{' '}
                {brainStats.winRate.toFixed(
                  1
                )}%
              </div>
            </div>

            {!isStreamActive ? (
              <button
                onClick={
                  connectStream
                }
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-all shadow-md shadow-emerald-600/20"
              >
                Connect Chart Screen
              </button>
            ) : (
              <button
                onClick={
                  disconnectStream
                }
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

          {/* =================================================
              LEFT PANEL
             ================================================= */}

          <div className="space-y-4">

            <div className="bg-[#0f172a] rounded-xl p-5 border border-slate-800 shadow-md">

              <button
                onClick={
                  triggerAnalysis
                }
                disabled={
                  !isStreamActive ||
                  isScanning
                }
                className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
                  !isStreamActive ||
                  isScanning
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/30'
                }`}
              >
                {isScanning ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Analyzing Candles...
                  </span>
                ) : (
                  'FORCE MANUAL 46S SCAN'
                )}
              </button>

              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-slate-500">
                  Next Candle Entry:
                </span>

                <span className="font-mono text-xl text-amber-400">
                  {timeUntilCandle}s
                </span>
              </div>
            </div>

            {/* OCR */}

            <div className="bg-[#0f172a] rounded-xl p-5 border border-slate-800">

              <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wider font-mono">
                OCR Telemetry
              </h3>

              <div className="text-xs space-y-2 font-mono">

                <div className="flex justify-between">
                  <span className="text-slate-500">
                    Price:
                  </span>

                  <span
                    className={`font-bold ${
                      isRealRoundNumber
                        ? 'text-emerald-400'
                        : 'text-cyan-400'
                    }`}
                  >
                    {ocrPriceText}
                  </span>
                </div>

              </div>
            </div>

            {/* BRAIN STATS */}

            <div className="bg-[#0f172a] rounded-xl p-5 border border-slate-800">

              <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wider font-mono">
                Candle Brain
              </h3>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">

                <div className="bg-[#020617] p-3 rounded">
                  <div className="text-slate-500">
                    Candles
                  </div>

                  <div className="text-cyan-400 text-lg font-bold">
                    {brainStats.candles}
                  </div>
                </div>

                <div className="bg-[#020617] p-3 rounded">
                  <div className="text-slate-500">
                    Patterns
                  </div>

                  <div className="text-purple-400 text-lg font-bold">
                    {brainStats.candlePatterns}
                  </div>
                </div>

                <div className="bg-[#020617] p-3 rounded">
                  <div className="text-slate-500">
                    ZigZag
                  </div>

                  <div className="text-amber-400 text-lg font-bold">
                    {brainStats.zigzag}
                  </div>
                </div>

                <div className="bg-[#020617] p-3 rounded">
                  <div className="text-slate-500">
                    Win Rate
                  </div>

                  <div className="text-emerald-400 text-lg font-bold">
                    {brainStats.winRate.toFixed(
                      1
                    )}%
                  </div>
                </div>

              </div>
            </div>

            {/* LIVE ANALYSIS */}

            {currentAnalysis && (
              <div className="bg-[#0f172a] rounded-xl p-5 border border-slate-800">

                <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wider font-mono">
                  Candle Pattern Analysis
                </h3>

                <div className="text-xs text-slate-300 space-y-2 font-mono">

                  <div>
                    <span className="text-slate-500">
                      Latest:
                    </span>{' '}
                    Candle #
                    {
                      currentAnalysis
                        .detectedCandles[
                        currentAnalysis
                          .detectedCandles
                          .length -
                          1
                      ]?.id
                    }
                  </div>

                  <div>
                    <span className="text-slate-500">
                      Body:
                    </span>{' '}
                    {
                      currentAnalysis
                        .detectedCandles[
                        currentAnalysis
                          .detectedCandles
                          .length -
                          1
                      ]?.bodyClass
                    }
                  </div>

                  <div>
                    <span className="text-slate-500">
                      Upper Wick:
                    </span>{' '}
                    {
                      currentAnalysis
                        .detectedCandles[
                        currentAnalysis
                          .detectedCandles
                          .length -
                          1
                      ]?.topWickClass
                    }
                  </div>

                  <div>
                    <span className="text-slate-500">
                      Lower Wick:
                    </span>{' '}
                    {
                      currentAnalysis
                        .detectedCandles[
                        currentAnalysis
                          .detectedCandles
                          .length -
                          1
                      ]?.bottomWickClass
                    }
                  </div>

                  <div>
                    <span className="text-slate-500">
                      Sequence:
                    </span>
                  </div>

                  <div className="break-all text-cyan-300">
                    {currentAnalysis.sequence.join(
                      ' → '
                    )}
                  </div>

                  <div>
                    <span className="text-slate-500">
                      Evidence:
                    </span>{' '}
                    <span className="text-emerald-400 font-bold">
                      {currentAnalysis.strength.toFixed(
                        1
                      )}%
                    </span>
                  </div>

                  {currentAnalysis
                    .matchedCandlePattern && (
                    <div className="mt-3 p-3 bg-purple-900/20 border border-purple-500/20 rounded">
                      <div className="text-purple-300 font-bold">
                        MEMORY MATCH
                      </div>

                      <div className="mt-1 text-slate-400">
                        Occurrences:{' '}
                        {
                          currentAnalysis
                            .matchedCandlePattern
                            .occurrences
                        }
                      </div>

                      <div className="text-slate-400">
                        Historical next-color evidence:{' '}
                        {
                          currentAnalysis
                            .matchedCandlePattern
                            .confidence
                        .toFixed(1)}
                        %
                      </div>
                    </div>
                  )}

                  <p className="break-all pt-2">
                    <span className="text-slate-500">
                      Logic:
                    </span>{' '}
                    {currentAnalysis.pattern}
                  </p>

                </div>
              </div>
            )}
          </div>

          {/* =================================================
              RIGHT PANEL
             ================================================= */}

          <div className="lg:col-span-2 space-y-4">

            {/* CHART */}

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
                    CHART + CANDLE VISION
                  </span>

                </div>

                {isStreamActive && (
                  <button
                    onClick={() =>
                      setIsRoiLocked(
                        !isRoiLocked
                      )
                    }
                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                      isRoiLocked
                        ? 'bg-red-900/60 text-red-400 border border-red-500/40'
                        : 'bg-cyan-900/60 text-cyan-400 border border-cyan-500/40'
                    }`}
                  >
                    {isRoiLocked
                      ? '🔒 ROI Locked'
                      : '🔓 Drag / Resize ROI'}
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
                      ref={
                        videoRef
                      }
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-contain pointer-events-none"
                    />

                    <canvas
                      ref={
                        overlayCanvasRef
                      }
                      className="absolute inset-0 pointer-events-none w-full h-full z-10"
                    />

                    {/* ROI */}

                    <div
                      onMouseDown={
                        handleMouseDown
                      }
                      style={{
                        left: `${roiBox.x}px`,
                        top: `${roiBox.y}px`,
                        width: `${roiBox.width}px`,
                        height: `${roiBox.height}px`
                      }}
                      className={`absolute border-2 ${
                        isRoiLocked
                          ? 'border-amber-400 bg-amber-500/5'
                          : 'border-cyan-400 bg-cyan-500/5 cursor-move'
                      } flex flex-col justify-between p-1 z-20`}
                    >

                      <div className="flex justify-between items-center text-[10px] font-mono text-cyan-300 font-bold bg-slate-950/80 px-1 py-0.5 rounded pointer-events-none">
                        <span>
                          AI CANDLE TARGET
                        </span>

                        <span>
                          {Math.round(
                            roiBox.width
                          )}
                          x
                          {Math.round(
                            roiBox.height
                          )}
                        </span>
                      </div>

                      {!isRoiLocked && (
                        <div
                          onMouseDown={
                            handleResizeDown
                          }
                          className="w-3.5 h-3.5 bg-cyan-400 absolute bottom-0 right-0 cursor-se-resize rounded-tl shadow-md"
                        />
                      )}

                    </div>
                  </>
                ) : (
                  <div className="text-center space-y-2">
                    <p className="text-slate-500 font-medium">
                      Connect chart screen to start Trader Yodha X AI.
                    </p>

                    <p className="text-xs text-slate-600">
                      The AI will number detected candles and learn their sequences.
                    </p>
                  </div>
                )}

              </div>

              <canvas
                ref={
                  canvasRef
                }
                className="hidden"
              />

              <canvas
                ref={
                  ocrCanvasRef
                }
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

            {/* SIGNAL */}

            <div className="bg-[#0f172a] rounded-xl p-6 border border-slate-800">

              <div className="flex items-center justify-between mb-4">

                <span className="px-3 py-1 bg-purple-900/50 text-purple-300 text-xs font-bold rounded tracking-wide">
                  TRADER YODHA X SIGNAL ENGINE
                </span>

                <span className="text-xs text-slate-500 font-mono">
                  1-Min Candle Transition
                </span>

              </div>

              <div className="text-center py-8">

                <div
                  className={`inline-block px-14 py-6 rounded-2xl text-6xl font-black tracking-widest border-4 transition-all duration-300 ${
                    aiSignal ===
                    'CALL'
                      ? 'bg-emerald-500/10 border-emerald-400 text-emerald-400'
                      : aiSignal ===
                        'PUT'
                      ? 'bg-red-500/10 border-red-400 text-red-400'
                      : 'bg-slate-800 border-slate-700 text-slate-600'
                  }`}
                >
                  {aiSignal}
                </div>

              </div>

              {currentAnalysis && (
                <div className="mb-5 grid grid-cols-3 gap-3">

                  <div className="bg-[#020617] rounded-lg p-3 text-center">
                    <div className="text-xs text-slate-500">
                      Candles
                    </div>

                    <div className="text-cyan-400 font-bold text-lg">
                      {
                        currentAnalysis
                          .detectedCandles
                          .length
                      }
                    </div>
                  </div>

                  <div className="bg-[#020617] rounded-lg p-3 text-center">
                    <div className="text-xs text-slate-500">
                      Latest #
                    </div>

                    <div className="text-purple-400 font-bold text-lg">
                      {
                        currentAnalysis
                          .detectedCandles[
                          currentAnalysis
                            .detectedCandles
                            .length -
                            1
                        ]?.id
                      }
                    </div>
                  </div>

                  <div className="bg-[#020617] rounded-lg p-3 text-center">
                    <div className="text-xs text-slate-500">
                      Evidence
                    </div>

                    <div className="text-emerald-400 font-bold text-lg">
                      {currentAnalysis.strength.toFixed(
                        1
                      )}%
                    </div>
                  </div>

                </div>
              )}

              {aiSignal !==
                'WAIT' && (
                <div className="mt-4 pt-4 border-t border-slate-800">

                  <p className="text-xs text-slate-400 text-center mb-3">
                    Log outcome to train the candle-pattern brain:
                  </p>

                  <div className="grid grid-cols-2 gap-3">

                    <button
                      onClick={() =>
                        logTradeOutcome(
                          'WIN'
                        )
                      }
                      className="py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-all tracking-wide"
                    >
                      WIN
                    </button>

                    <button
                      onClick={() =>
                        logTradeOutcome(
                          'LOSS'
                        )
                      }
                      className="py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-all tracking-wide"
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