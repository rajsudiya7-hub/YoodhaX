import React, {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import { createWorker, Worker } from "tesseract.js";

/* =========================================================
   TRADER YODHA X
   Candle Vision + Candle Numbering + Pattern Memory
   + 46 Second Analysis + 00:00 Signal
   ========================================================= */

type CandleColor = "GREEN" | "RED" | "NEUTRAL";
type Signal = "WAIT" | "CALL" | "PUT";

interface CandleFeature {
  number: number;

  color: CandleColor;

  // Pixel coordinates inside ROI
  x: number;
  centerX: number;

  highY: number;
  lowY: number;

  bodyTopY: number;
  bodyBottomY: number;

  bodySize: number;
  upperWick: number;
  lowerWick: number;

  // Normalized values
  bodyRatio: number;
  upperWickRatio: number;
  lowerWickRatio: number;

  // Human-readable candle classification
  type: string;

  timestamp: number;
}

interface CandlePatternMemory {
  id: string;

  sequence: string;

  sequenceLength: number;

  lastCandle: string;

  patternType: string;

  bodyProfile: string;

  wickProfile: string;

  direction: "UP" | "DOWN" | "NEUTRAL";

  result: "WIN" | "LOSS";

  confidence: number;

  timestamp: number;

  occurrences: number;
}

interface ZigZagLevel {
  price: number;
  type: "HIGH" | "LOW";
  occurrences: number;
  timestamp: number;
}

interface BrainState {
  patterns: CandlePatternMemory[];

  zigzagLevels: ZigZagLevel[];

  totalTrades: number;

  wins: number;

  losses: number;

  winRate: number;

  lastUpdated: number;
}

interface LiveAnalysis {
  candles: CandleFeature[];

  sequence: string[];

  patternName: string;

  bodyProfile: string;

  wickProfile: string;

  dominantColor: CandleColor;

  strength: number;

  priceLevel: number;

  isRoundNumber: boolean;

  matchedPattern: CandlePatternMemory | null;

  matchedZigZag: ZigZagLevel | null;

  timestamp: number;
}

interface ROI {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DB_NAME = "TraderYodhaX_CandleBrain";

const DB_VERSION = 2;

const STORE_NAME = "brain";

/* =========================================================
   MAIN COMPONENT
   ========================================================= */

export default function TraderYodhaXEngine() {
  /* ---------------- STREAM ---------------- */

  const [stream, setStream] = useState<MediaStream | null>(null);

  const [isStreamActive, setIsStreamActive] =
    useState(false);

  const videoRef =
    useRef<HTMLVideoElement>(null);

  /* ---------------- CANVAS ---------------- */

  const canvasRef =
    useRef<HTMLCanvasElement>(null);

  const overlayCanvasRef =
    useRef<HTMLCanvasElement>(null);

  const ocrCanvasRef =
    useRef<HTMLCanvasElement>(null);

  /* ---------------- OCR ---------------- */

  const ocrWorkerRef =
    useRef<Worker | null>(null);

  const ocrBusyRef =
    useRef(false);

  /* ---------------- ROI ---------------- */

  const videoContainerRef =
    useRef<HTMLDivElement>(null);

  const [roi, setRoi] = useState<ROI>({
    x: 50,
    y: 30,
    width: 650,
    height: 350
  });

  const [roiLocked, setRoiLocked] =
    useState(false);

  const [dragging, setDragging] =
    useState(false);

  const [resizing, setResizing] =
    useState(false);

  const dragOffsetRef =
    useRef({ x: 0, y: 0 });

  /* ---------------- ENGINE ---------------- */

  const [signal, setSignal] =
    useState<Signal>("WAIT");

  const [status, setStatus] =
    useState("Trader Yodha X ready.");

  const [isAnalyzing, setIsAnalyzing] =
    useState(false);

  const [secondsToCandle, setSecondsToCandle] =
    useState(60);

  /* ---------------- UI ---------------- */

  const [ocrPrice, setOcrPrice] =
    useState("Searching...");

  const [currentAnalysis, setCurrentAnalysis] =
    useState<LiveAnalysis | null>(null);

  const [detectedCandles, setDetectedCandles] =
    useState<CandleFeature[]>([]);

  const [brainStats, setBrainStats] =
    useState({
      patterns: 0,
      zigzag: 0,
      winRate: 0
    });

  /* =========================================================
     BRAIN
     ========================================================= */

  const brainRef = useRef<BrainState>({
    patterns: [],
    zigzagLevels: [],
    totalTrades: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    lastUpdated: Date.now()
  });

  const lastSignalRef =
    useRef<LiveAnalysis | null>(null);

  const pendingSignalRef =
    useRef<Signal>("WAIT");

  const learningTimerRef =
    useRef<ReturnType<typeof setInterval> | null>(null);

  const lastScanMinuteRef =
    useRef<number>(-1);

  /* =========================================================
     DATABASE
     ========================================================= */

  const openDB = useCallback((): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(
        DB_NAME,
        DB_VERSION
      );

      request.onupgradeneeded = () => {
        const db = request.result;

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

  const updateStats = useCallback(() => {
    const brain = brainRef.current;

    setBrainStats({
      patterns: brain.patterns.length,
      zigzag: brain.zigzagLevels.length,
      winRate: brain.winRate
    });
  }, []);

  const saveBrain = useCallback(async () => {
    try {
      const db = await openDB();

      const tx =
        db.transaction(STORE_NAME, "readwrite");

      tx.objectStore(STORE_NAME).put(
        brainRef.current,
        "main"
      );

      brainRef.current.lastUpdated =
        Date.now();

      updateStats();
    } catch (error) {
      console.error("Brain save error:", error);
    }
  }, [openDB, updateStats]);

  const loadBrain = useCallback(async () => {
    try {
      const db = await openDB();

      const tx =
        db.transaction(STORE_NAME, "readonly");

      const request =
        tx.objectStore(STORE_NAME).get("main");

      request.onsuccess = () => {
        if (request.result) {
          brainRef.current =
            request.result as BrainState;

          updateStats();

          setStatus(
            `Brain loaded: ${brainRef.current.patterns.length} learned patterns`
          );
        }
      };
    } catch (error) {
      console.error("Brain load error:", error);
    }
  }, [openDB, updateStats]);

  /* =========================================================
     OCR INITIALIZATION
     ========================================================= */

  useEffect(() => {
    let cancelled = false;

    const initOCR = async () => {
      try {
        setStatus("Starting OCR engine...");

        const worker =
          await createWorker("eng");

        if (cancelled) {
          await worker.terminate();
          return;
        }

        ocrWorkerRef.current = worker;

        setStatus(
          "Vision engine ready. Connect chart."
        );
      } catch (error) {
        console.error("OCR error:", error);

        setStatus(
          "Vision engine ready without OCR."
        );
      }
    };

    initOCR();

    loadBrain();

    return () => {
      cancelled = true;

      if (ocrWorkerRef.current) {
        ocrWorkerRef.current
          .terminate()
          .catch(() => {});

        ocrWorkerRef.current = null;
      }
    };
  }, [loadBrain]);

  /* =========================================================
     VIDEO CONNECTION
     ========================================================= */

  useEffect(() => {
    if (
      videoRef.current &&
      stream
    ) {
      videoRef.current.srcObject =
        stream;

      videoRef.current
        .play()
        .catch(() => {});
    }
  }, [stream]);

  const connectScreen = async () => {
    try {
      if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getDisplayMedia
      ) {
        setStatus(
          "Screen sharing is not supported in this browser."
        );

        return;
      }

      setStatus(
        "Select the chart/window to share..."
      );

      const media =
        await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: {
              ideal: 15,
              max: 30
            }
          },
          audio: false
        });

      media.getVideoTracks()[0].addEventListener(
        "ended",
        () => {
          disconnectScreen();
        }
      );

      setStream(media);
      setIsStreamActive(true);

      setStatus(
        "Chart connected. Position ROI over candles."
      );
    } catch (error) {
      console.error(error);

      setStatus(
        "Screen sharing cancelled/failed."
      );
    }
  };

  const disconnectScreen = () => {
    if (learningTimerRef.current) {
      clearInterval(
        learningTimerRef.current
      );

      learningTimerRef.current = null;
    }

    if (stream) {
      stream
        .getTracks()
        .forEach(track => track.stop());
    }

    setStream(null);

    setIsStreamActive(false);

    setSignal("WAIT");

    setCurrentAnalysis(null);

    setDetectedCandles([]);

    setStatus("Engine paused.");
  };

  /* =========================================================
     PRICE HELPERS
     ========================================================= */

  const getPriceRange = (
    price: number
  ) => {
    if (!price) return "UNKNOWN";

    const base =
      Math.floor(price * 1000) / 1000;

    return `${base.toFixed(3)}-${(
      base + 0.001
    ).toFixed(3)}`;
  };

  const isRoundNumber = (
    price: number
  ) => {
    if (!price) return false;

    const scaled =
      Math.round(price * 10000);

    return (
      scaled % 1000 === 0 ||
      scaled % 500 === 0
    );
  };

  /* =========================================================
     OCR
     ========================================================= */

  const readPrice = async (
    ctx: CanvasRenderingContext2D
  ): Promise<number> => {
    const worker =
      ocrWorkerRef.current;

    const ocrCanvas =
      ocrCanvasRef.current;

    if (
      !worker ||
      !ocrCanvas ||
      ocrBusyRef.current
    ) {
      return 0;
    }

    ocrBusyRef.current = true;

    try {
      const width =
        Math.min(500, ctx.canvas.width);

      const height =
        Math.min(180, ctx.canvas.height);

      ocrCanvas.width = width;
      ocrCanvas.height = height;

      const ocrCtx =
        ocrCanvas.getContext("2d");

      if (!ocrCtx) return 0;

      ocrCtx.filter =
        "contrast(180%) brightness(130%)";

      ocrCtx.drawImage(
        ctx.canvas,
        0,
        0,
        width,
        height,
        0,
        0,
        width,
        height
      );

      const result =
        await worker.recognize(
          ocrCanvas
        );

      const text =
        result.data.text
          .replace(/,/g, "")
          .replace(/\s+/g, " ");

      const matches =
        text.match(
          /\d+\.\d{2,6}/g
        );

      if (!matches?.length) {
        return 0;
      }

      const prices =
        matches
          .map(Number)
          .filter(
            n =>
              Number.isFinite(n) &&
              n > 0
          );

      if (!prices.length) {
        return 0;
      }

      const price =
        prices[prices.length - 1];

      setOcrPrice(
        `${price.toFixed(5)} ${
          isRoundNumber(price)
            ? "🎯 ROUND"
            : ""
        }`
      );

      return price;
    } catch (error) {
      console.warn(
        "OCR read failed",
        error
      );

      return 0;
    } finally {
      ocrBusyRef.current = false;
    }
  };

  /* =========================================================
     FRAME CAPTURE
     ========================================================= */

  const captureROI =
    useCallback((): {
      imageData: ImageData;
      ctx: CanvasRenderingContext2D;
    } | null => {
      const video =
        videoRef.current;

      const canvas =
        canvasRef.current;

      if (
        !video ||
        !canvas ||
        video.readyState < 2
      ) {
        return null;
      }

      const width =
        video.videoWidth;

      const height =
        video.videoHeight;

      if (!width || !height) {
        return null;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx =
        canvas.getContext(
          "2d",
          {
            willReadFrequently: true
          }
        );

      if (!ctx) return null;

      ctx.drawImage(
        video,
        0,
        0,
        width,
        height
      );

      const container =
        videoContainerRef.current;

      if (!container) return null;

      const cw =
        container.clientWidth;

      const ch =
        container.clientHeight;

      const scaleX =
        width / cw;

      const scaleY =
        height / ch;

      const x =
        Math.max(
          0,
          Math.min(
            width - 1,
            roi.x * scaleX
          )
        );

      const y =
        Math.max(
          0,
          Math.min(
            height - 1,
            roi.y * scaleY
          )
        );

      const rw =
        Math.max(
          10,
          Math.min(
            width - x,
            roi.width * scaleX
          )
        );

      const rh =
        Math.max(
          10,
          Math.min(
            height - y,
            roi.height * scaleY
          )
        );

      const imageData =
        ctx.getImageData(
          Math.floor(x),
          Math.floor(y),
          Math.floor(rw),
          Math.floor(rh)
        );

      return {
        imageData,
        ctx
      };
    }, [roi]);

  /* =========================================================
     COLOR CLASSIFICATION
     ========================================================= */

  const getPixelColor = (
    r: number,
    g: number,
    b: number
  ): CandleColor => {
    const green =
      g > r * 1.18 &&
      g > b * 1.05 &&
      g - r > 20;

    const red =
      r > g * 1.18 &&
      r > b * 1.05 &&
      r - g > 20;

    if (green) return "GREEN";

    if (red) return "RED";

    return "NEUTRAL";
  };

  /* =========================================================
     CANDLE DETECTION
     
     IMPORTANT:
     Instead of looking at whole ROI as one candle,
     divide it into X columns and find individual candle
     bodies/wicks.
     ========================================================= */

  const detectCandles = (
    data: Uint8ClampedArray,
    width: number,
    height: number
  ): CandleFeature[] => {
    const columnStats = Array.from(
      { length: width },
      () => ({
        green: 0,
        red: 0,
        minY: height,
        maxY: -1,
        bodyCandidates: [] as number[]
      })
    );

    /* -------- scan pixels -------- */

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i =
          (y * width + x) * 4;

        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const color =
          getPixelColor(r, g, b);

        if (color === "GREEN") {
          columnStats[x].green++;
        }

        if (color === "RED") {
          columnStats[x].red++;
        }

        if (
          color !== "NEUTRAL"
        ) {
          columnStats[x].minY =
            Math.min(
              columnStats[x].minY,
              y
            );

          columnStats[x].maxY =
            Math.max(
              columnStats[x].maxY,
              y
            );
        }
      }
    }

    /* -------- identify active columns -------- */

    const active =
      columnStats.map(s => {
        const color =
          s.green > s.red * 1.12
            ? "GREEN"
            : s.red > s.green * 1.12
            ? "RED"
            : "NEUTRAL";

        const pixels =
          s.green + s.red;

        return {
          color: color as CandleColor,
          pixels
        };
      });

    /*
      Merge neighboring active columns into candle bodies.
      This makes detection much more stable than treating
      every X column as a candle.
    */

    const groups: {
      start: number;
      end: number;
      color: CandleColor;
    }[] = [];

    let start = -1;
    let lastColor: CandleColor =
      "NEUTRAL";

    for (
      let x = 0;
      x < width;
      x++
    ) {
      const current =
        active[x];

      const usable =
        current.pixels > height * 0.025 &&
        current.color !== "NEUTRAL";

      if (
        usable &&
        start === -1
      ) {
        start = x;
        lastColor =
          current.color;
      } else if (
        usable &&
        start !== -1
      ) {
        /*
          If color changes or gap becomes large,
          close current group.
        */

        if (
          current.color !==
          lastColor
        ) {
          if (
            x - start >= 3
          ) {
            groups.push({
              start,
              end: x - 1,
              color: lastColor
            });
          }

          start = x;
          lastColor =
            current.color;
        }
      } else if (
        !usable &&
        start !== -1
      ) {
        if (
          x - start >= 3
        ) {
          groups.push({
            start,
            end: x - 1,
            color: lastColor
          });
        }

        start = -1;
        lastColor =
          "NEUTRAL";
      }
    }

    if (
      start !== -1 &&
      width - start >= 3
    ) {
      groups.push({
        start,
        end: width - 1,
        color: lastColor
      });
    }

    /* -------- filter realistic candle groups -------- */

    const realistic =
      groups.filter(g => {
        const w =
          g.end - g.start + 1;

        return (
          w >= 3 &&
          w <= Math.max(40, width * 0.16)
        );
      });

    /*
      If there are too many tiny pieces, merge close groups.
    */

    const merged: typeof realistic =
      [];

    for (const group of realistic) {
      const previous =
        merged[merged.length - 1];

      if (
        previous &&
        group.start -
          previous.end <= 3 &&
        group.color ===
          previous.color
      ) {
        previous.end =
          group.end;
      } else {
        merged.push({
          ...group
        });
      }
    }

    const candles: CandleFeature[] =
      [];

    merged.forEach(
      (group, index) => {
        const centerX =
          Math.floor(
            (group.start +
              group.end) /
              2
          );

        let minY = height;
        let maxY = 0;

        let bodyTop =
          height;

        let bodyBottom = 0;

        /*
          Find vertical candle pixels around center.
        */

        for (
          let x =
            group.start;
          x <= group.end;
          x++
        ) {
          for (
            let y = 0;
            y < height;
            y++
          ) {
            const i =
              (y * width +
                x) *
              4;

            const r =
              data[i];

            const g =
              data[i + 1];

            const b =
              data[i + 2];

            const c =
              getPixelColor(
                r,
                g,
                b
              );

            if (
              c !== "NEUTRAL"
            ) {
              minY =
                Math.min(
                  minY,
                  y
                );

              maxY =
                Math.max(
                  maxY,
                  y
                );
            }
          }
        }

        if (
          minY >= height ||
          maxY <= 0
        ) {
          return;
        }

        /*
          Body is estimated from dense horizontal
          colored pixels.
        */

        const rowDensity: number[] =
          [];

        for (
          let y = minY;
          y <= maxY;
          y++
        ) {
          let count = 0;

          for (
            let x =
              group.start;
            x <= group.end;
            x++
          ) {
            const i =
              (y * width +
                x) *
              4;

            const c =
              getPixelColor(
                data[i],
                data[i + 1],
                data[i + 2]
              );

            if (
              c !== "NEUTRAL"
            ) {
              count++;
            }
          }

          rowDensity.push(
            count
          );
        }

        const threshold =
          Math.max(
            2,
            Math.floor(
              (group.end -
                group.start +
                1) *
                0.35
            )
          );

        const denseRows =
          rowDensity
            .map(
              (v, i) =>
                ({
                  value: v,
                  y: minY + i
                })
            )
            .filter(
              r =>
                r.value >=
                threshold
            );

        if (
          denseRows.length
        ) {
          bodyTop =
            denseRows[0].y;

          bodyBottom =
            denseRows[
              denseRows.length -
                1
            ].y;
        } else {
          bodyTop = minY;
          bodyBottom = maxY;
        }

        const bodySize =
          Math.max(
            1,
            bodyBottom -
              bodyTop
          );

        const upperWick =
          Math.max(
            0,
            bodyTop - minY
          );

        const lowerWick =
          Math.max(
            0,
            maxY -
              bodyBottom
          );

        const totalRange =
          Math.max(
            1,
            maxY - minY
          );

        let type =
          "NORMAL";

        if (
          bodySize <
          totalRange * 0.15
        ) {
          type =
            "DOJI / INDECISION";
        } else if (
          lowerWick >
            bodySize * 1.8 &&
          upperWick <
            bodySize * 0.8
        ) {
          type =
            "HAMMER / LOWER REJECTION";
        } else if (
          upperWick >
            bodySize * 1.8 &&
          lowerWick <
            bodySize * 0.8
        ) {
          type =
            "SHOOTING STAR / UPPER REJECTION";
        } else if (
          upperWick >
              bodySize &&
          lowerWick >
              bodySize
        ) {
          type =
            "SPINNING TOP";
        } else if (
          bodySize >
            totalRange * 0.70
        ) {
          type =
            "STRONG BODY";
        }

        candles.push({
          number: index + 1,

          color:
            group.color,

          x: group.start,

          centerX,

          highY: minY,

          lowY: maxY,

          bodyTopY: bodyTop,

          bodyBottomY:
            bodyBottom,

          bodySize,

          upperWick,

          lowerWick,

          bodyRatio:
            bodySize /
            totalRange,

          upperWickRatio:
            upperWick /
            totalRange,

          lowerWickRatio:
            lowerWick /
            totalRange,

          type,

          timestamp:
            Date.now()
        });
      }
    );

    return candles;
  };

  /* =========================================================
     CANDLE PROFILE
     ========================================================= */

  const getBodyProfile = (
    candle: CandleFeature
  ) => {
    if (
      candle.bodyRatio >= 0.7
    )
      return "LARGE_BODY";

    if (
      candle.bodyRatio >= 0.45
    )
      return "MEDIUM_BODY";

    if (
      candle.bodyRatio >= 0.2
    )
      return "SMALL_BODY";

    return "TINY_BODY";
  };

  const getWickProfile = (
    candle: CandleFeature
  ) => {
    const upper =
      candle.upperWickRatio;

    const lower =
      candle.lowerWickRatio;

    if (
      upper >
        candle.bodyRatio * 1.5 &&
      lower >
        candle.bodyRatio * 1.5
    ) {
      return "BOTH_WICKS";
    }

    if (
      upper >
      candle.bodyRatio * 1.5
    ) {
      return "UPPER_REJECTION";
    }

    if (
      lower >
      candle.bodyRatio * 1.5
    ) {
      return "LOWER_REJECTION";
    }

    return "BALANCED";
  };

  /* =========================================================
     CANDLE SEQUENCE
     ========================================================= */

  const makeCandleCode = (
    candle: CandleFeature
  ) => {
    const color =
      candle.color === "GREEN"
        ? "G"
        : candle.color === "RED"
        ? "R"
        : "N";

    const body =
      getBodyProfile(candle);

    const wick =
      getWickProfile(candle);

    return `${color}-${body}-${wick}`;
  };

  const makeSequence = (
    candles: CandleFeature[],
    count = 5
  ) => {
    return candles
      .slice(-count)
      .map(makeCandleCode);
  };

  /* =========================================================
     PATTERN RECOGNITION
     ========================================================= */

  const recognizePattern = (
    candles: CandleFeature[]
  ) => {
    if (candles.length < 2) {
      return "INSUFFICIENT CANDLES";
    }

    const last =
      candles[candles.length - 1];

    const prev =
      candles[candles.length - 2];

    const lastBody =
      getBodyProfile(last);

    const lastWick =
      getWickProfile(last);

    /* Hammer */
    if (
      last.lowerWick >
        last.bodySize * 1.8 &&
      last.upperWick <
        last.bodySize
    ) {
      return "LOWER REJECTION";
    }

    /* Shooting star */
    if (
      last.upperWick >
        last.bodySize * 1.8 &&
      last.lowerWick <
        last.bodySize
    ) {
      return "UPPER REJECTION";
    }

    /* Green after strong red */
    if (
      prev.color === "RED" &&
      last.color === "GREEN" &&
      last.bodySize >
        prev.bodySize * 0.7
    ) {
      return "BULLISH REVERSAL ATTEMPT";
    }

    /* Red after strong green */
    if (
      prev.color === "GREEN" &&
      last.color === "RED" &&
      last.bodySize >
        prev.bodySize * 0.7
    ) {
      return "BEARISH REVERSAL ATTEMPT";
    }

    /* Same direction momentum */
    if (
      prev.color === last.color &&
      lastBody === "LARGE_BODY"
    ) {
      return last.color === "GREEN"
        ? "BULLISH MOMENTUM"
        : "BEARISH MOMENTUM";
    }

    if (
      lastBody === "TINY_BODY"
    ) {
      return "INDECISION";
    }

    if (
      lastWick ===
      "BOTH_WICKS"
    ) {
      return "HIGH VOLATILITY / INDECISION";
    }

    return `${last.color} ${lastBody}`;
  };

  /* =========================================================
     MATCH LEARNED PATTERN
     ========================================================= */

  const findMatchingPattern = (
    sequence: string[]
  ) => {
    const key =
      sequence.join("|");

    const patterns =
      brainRef.current.patterns;

    let best:
      CandlePatternMemory | null =
      null;

    let bestScore = 0;

    for (const pattern of patterns) {
      const learned =
        pattern.sequence.split("|");

      let same = 0;

      const length =
        Math.min(
          learned.length,
          sequence.length
        );

      for (
        let i = 0;
        i < length;
        i++
      ) {
        if (
          learned[
            learned.length -
              length +
              i
          ] ===
          sequence[
            sequence.length -
              length +
              i
          ]
        ) {
          same++;
        }
      }

      const score =
        length
          ? same / length
          : 0;

      if (
        score > bestScore &&
        score >= 0.60
      ) {
        bestScore = score;
        best = pattern;
      }
    }

    return best;
  };

  /* =========================================================
     ZIGZAG
     ========================================================= */

  const updateZigZag = (
    candles: CandleFeature[]
  ) => {
    if (
      candles.length < 3
    )
      return;

    const last =
      candles[
        candles.length - 1
      ];

    const prev =
      candles[
        candles.length - 2
      ];

    const prev2 =
      candles[
        candles.length - 3
      ];

    /*
      Local high
    */

    if (
      prev.highY <
        prev2.highY &&
      prev.highY <
        last.highY
    ) {
      addZigZag(
        prev,
        "HIGH"
      );
    }

    /*
      Local low
    */

    if (
      prev.lowY >
        prev2.lowY &&
      prev.lowY >
        last.lowY
    ) {
      addZigZag(
        prev,
        "LOW"
      );
    }
  };

  const addZigZag = (
    candle: CandleFeature,
    type: "HIGH" | "LOW"
  ) => {
    /*
      Without reliable OCR price for every candle,
      use candle geometry as temporary level ID.
    */

    const levelValue =
      type === "HIGH"
        ? candle.highY
        : candle.lowY;

    const existing =
      brainRef.current.zigzagLevels.find(
        z =>
          z.type === type &&
          Math.abs(
            z.price -
              levelValue
          ) < 5
      );

    if (existing) {
      existing.occurrences++;
      existing.timestamp =
        Date.now();
    } else {
      brainRef.current.zigzagLevels.push(
        {
          price: levelValue,
          type,
          occurrences: 1,
          timestamp:
            Date.now()
        }
      );
    }

    if (
      brainRef.current
        .zigzagLevels.length >
      100
    ) {
      brainRef.current.zigzagLevels =
        brainRef.current.zigzagLevels.slice(
          -100
        );
    }
  };

  /* =========================================================
     DRAW CANDLE NUMBERS
     ========================================================= */

  const drawCandleOverlay = (
    candles: CandleFeature[]
  ) => {
    const overlay =
      overlayCanvasRef.current;

    const container =
      videoContainerRef.current;

    const video =
      videoRef.current;

    if (
      !overlay ||
      !container ||
      !video
    ) {
      return;
    }

    const cw =
      container.clientWidth;

    const ch =
      container.clientHeight;

    overlay.width = cw;
    overlay.height = ch;

    const ctx =
      overlay.getContext("2d");

    if (!ctx) return;

    ctx.clearRect(
      0,
      0,
      cw,
      ch
    );

    if (
      !candles.length
    )
      return;

    /*
      The candle coordinates are inside ROI.
      Convert ROI coordinates to displayed coordinates.
    */

    const sx =
      roi.width /
      video.videoWidth;

    const sy =
      roi.height /
      video.videoHeight;

    /*
      candles are ROI image coordinates.
      Need normalize based on ROI canvas dimensions.
      */

    const videoROIWidth =
      Math.max(
        1,
        video.videoWidth *
          (roi.width /
            cw)
      );

    const videoROIHeight =
      Math.max(
        1,
        video.videoHeight *
          (roi.height /
            ch)
      );

    /*
      Better direct mapping from detected ROI
      to visible ROI.
    */

    const ratioX =
      roi.width /
      Math.max(
        1,
        candles.reduce(
          (m, c) =>
            Math.max(
              m,
              c.centerX
            ),
          1
        )
      );

    void sx;
    void sy;
    void videoROIWidth;
    void videoROIHeight;
    void ratioX;

    candles.forEach(
      candle => {
        const x =
          roi.x +
          (candle.centerX /
            Math.max(
              1,
              video.videoWidth
            )) *
            roi.width;

        /*
          Because ROI image width is proportional
          to source video ROI, this approximation
          keeps labels aligned on normal object-fit.
        */

        const y =
          roi.y +
          (candle.highY /
            Math.max(
              1,
              video.videoHeight
            )) *
            roi.height;

        const isGreen =
          candle.color ===
          "GREEN";

        ctx.font =
          "bold 13px Arial";

        ctx.textAlign =
          "center";

        ctx.fillStyle =
          isGreen
            ? "#22c55e"
            : candle.color ===
              "RED"
            ? "#ef4444"
            : "#facc15";

        ctx.fillText(
          String(candle.number),
          x,
          Math.max(
            16,
            y - 5
          )
        );
      }
    );
  };

  /* =========================================================
     ANALYZE CURRENT FRAME
     ========================================================= */

  const analyzeCurrentFrame =
    useCallback(
      async (
        fullAnalysis = false
      ) => {
        const captured =
          captureROI();

        if (!captured) {
          setStatus(
            "Waiting for chart video..."
          );

          return null;
        }

        const {
          imageData,
          ctx
        } = captured;

        const candles =
          detectCandles(
            imageData.data,
            imageData.width,
            imageData.height
          );

        setDetectedCandles(
          candles
        );

        drawCandleOverlay(
          candles
        );

        if (
          candles.length <
          2
        ) {
          setStatus(
            "ROI me candles clearly detect nahi ho rahi. ROI ko candles ke upar rakho."
          );

          return null;
        }

        updateZigZag(
          candles
        );

        const sequence =
          makeSequence(
            candles,
            5
          );

        const patternName =
          recognizePattern(
            candles
          );

        const last =
          candles[
            candles.length - 1
          ];

        const matchedPattern =
          findMatchingPattern(
            sequence
          );

        const dominantColor =
          last.color;

        const bodyProfile =
          getBodyProfile(
            last
          );

        const wickProfile =
          getWickProfile(
            last
          );

        /*
          OCR is used only during deep analysis,
          NOT every 500ms.
        */

        let price = 0;

        if (fullAnalysis) {
          price =
            await readPrice(
              ctx
            );
        }

        const round =
          isRoundNumber(
            price
          );

        /*
          Base confidence comes from visual agreement,
          not fake 90% confidence.
        */

        let score = 50;

        if (
          dominantColor !==
          "NEUTRAL"
        ) {
          score += 10;
        }

        if (
          patternName.includes(
            "REVERSAL"
          ) ||
          patternName.includes(
            "REJECTION"
          )
        ) {
          score += 12;
        }

        if (
          matchedPattern
        ) {
          score +=
            Math.min(
              20,
              matchedPattern.confidence *
                0.20
            );
        }

        if (
          round
        ) {
          score += 5;
        }

        score =
          Math.min(
            95,
            Math.max(
              0,
              score
            )
          );

        const analysis: LiveAnalysis =
          {
            candles,
            sequence,
            patternName,
            bodyProfile,
            wickProfile,
            dominantColor,
            strength: score,
            priceLevel: price,
            isRoundNumber: round,
            matchedPattern,
            matchedZigZag:
              null,
            timestamp:
              Date.now()
          };

        /*
          Decide direction from candle structure.
        */

        let proposed:
          Signal =
          "WAIT";

        if (
          patternName ===
          "LOWER REJECTION"
        ) {
          proposed =
            "CALL";
        } else if (
          patternName ===
          "UPPER REJECTION"
        ) {
          proposed =
            "PUT";
        } else if (
          patternName.includes(
            "BULLISH"
          ) ||
          patternName.includes(
            "BULLISH MOMENTUM"
          )
        ) {
          proposed =
            "CALL";
        } else if (
          patternName.includes(
            "BEARISH"
          ) ||
          patternName.includes(
            "BEARISH MOMENTUM"
          )
        ) {
          proposed =
            "PUT";
        } else if (
          dominantColor ===
          "GREEN"
        ) {
          proposed =
            "CALL";
        } else if (
          dominantColor ===
          "RED"
        ) {
          proposed =
            "PUT";
        }

        /*
          If learned pattern has history,
          let historical result influence direction.
        */

        if (
          matchedPattern
        ) {
          if (
            matchedPattern.result ===
            "WIN"
          ) {
            proposed =
              matchedPattern.direction ===
              "UP"
                ? "CALL"
                : matchedPattern.direction ===
                  "DOWN"
                ? "PUT"
                : proposed;
          }
        }

        lastSignalRef.current =
          analysis;

        pendingSignalRef.current =
          proposed;

        setCurrentAnalysis(
          analysis
        );

        if (
          fullAnalysis
        ) {
          setStatus(
            `46s analysis complete | ${candles.length} candles | ${patternName} | ${proposed}`
          );
        }

        return {
          analysis,
          proposed
        };
      },
      [
        captureROI,
        drawCandleOverlay,
        updateZigZag
      ]
    );

  /* =========================================================
     CONTINUOUS CANDLE MONITOR
     ========================================================= */

  const startLearning =
    useCallback(() => {
      if (
        learningTimerRef.current
      ) {
        clearInterval(
          learningTimerRef.current
        );
      }

      /*
        1000ms instead of 500ms.
        OCR is NOT called here.
      */

      learningTimerRef.current =
        setInterval(() => {
          if (
            !isStreamActive
          ) {
            return;
          }

          analyzeCurrentFrame(
            false
          ).catch(error => {
            console.error(
              "Frame analysis:",
              error
            );
          });
        }, 1000);
    }, [
      isStreamActive,
      analyzeCurrentFrame
    ]);

  useEffect(() => {
    if (
      isStreamActive
    ) {
      startLearning();
    }

    return () => {
      if (
        learningTimerRef.current
      ) {
        clearInterval(
          learningTimerRef.current
        );

        learningTimerRef.current =
          null;
      }
    };
  }, [
    isStreamActive,
    startLearning
  ]);

  /* =========================================================
     46 SECOND DEEP ANALYSIS
     ========================================================= */

  const run46SecondAnalysis =
    useCallback(async () => {
      if (
        !isStreamActive ||
        isAnalyzing
      ) {
        return;
      }

      setIsAnalyzing(true);

      setStatus(
        "🔎 46-second deep candle analysis..."
      );

      try {
        const result =
          await analyzeCurrentFrame(
            true
          );

        if (!result) {
          return;
        }

        const {
          analysis,
          proposed
        } = result;

        /*
          Keep signal pending until 00:00.
        */

        pendingSignalRef.current =
          proposed;

        setStatus(
          `🧠 46s LOCKED | ${analysis.sequence.join(
            " → "
          )} | ${analysis.patternName} | ${proposed}`
        );

        await saveBrain();
      } catch (error) {
        console.error(
          "46s analysis:",
          error
        );

        setStatus(
          "46s analysis error."
        );
      } finally {
        setIsAnalyzing(false);
      }
    }, [
      isStreamActive,
      isAnalyzing,
      analyzeCurrentFrame,
      saveBrain
    ]);

  /* =========================================================
     CLOCK + EXACT CANDLE TRANSITION
     ========================================================= */

  useEffect(() => {
    const timer =
      setInterval(() => {
        const now =
          new Date();

        const seconds =
          now.getSeconds();

        const milliseconds =
          now.getMilliseconds();

        const remaining =
          60 -
          seconds -
          milliseconds /
            1000;

        setSecondsToCandle(
          Math.ceil(
            remaining
          )
        );

        /*
          Automatic 46s analysis.
        */

        if (
          seconds === 46 &&
          lastScanMinuteRef.current !==
            now.getMinutes()
        ) {
          lastScanMinuteRef.current =
            now.getMinutes();

          run46SecondAnalysis();
        }

        /*
          EXACT transition.
        */

        if (
          seconds === 0 &&
          milliseconds < 500 &&
          pendingSignalRef.current !==
            "WAIT"
        ) {
          const nextSignal =
            pendingSignalRef.current;

          setSignal(
            nextSignal
          );

          setStatus(
            `🚀 SIGNAL ACTIVE: ${nextSignal} | Entry: 00:00`
          );

          pendingSignalRef.current =
            "WAIT";
        }
      }, 100);

    return () =>
      clearInterval(
        timer
      );
  }, [
    run46SecondAnalysis
  ]);

  /* =========================================================
     MANUAL SCAN
     ========================================================= */

  const manualScan = () => {
    if (
      !isStreamActive
    ) {
      setStatus(
        "Pehle Connect Chart Screen karo."
      );

      return;
    }

    run46SecondAnalysis();
  };

  /* =========================================================
     TRADE RESULT LEARNING
     ========================================================= */

  const logOutcome = (
    result: "WIN" | "LOSS"
  ) => {
    const analysis =
      lastSignalRef.current;

    if (
      !analysis ||
      signal === "WAIT"
    ) {
      return;
    }

    const sequence =
      analysis.sequence.join(
        "|"
      );

    const last =
      analysis.candles[
        analysis.candles.length -
          1
      ];

    const direction =
      signal === "CALL"
        ? "UP"
        : "DOWN";

    const existing =
      brainRef.current.patterns.find(
        p =>
          p.sequence ===
            sequence &&
          p.patternType ===
            analysis.patternName &&
          p.direction ===
            direction
      );

    if (existing) {
      existing.occurrences++;

      /*
        Keep latest outcome.
      */

      existing.result =
        result;

      existing.timestamp =
        Date.now();

      existing.confidence =
        analysis.strength;
    } else {
      brainRef.current.patterns.push(
        {
          id:
            `${Date.now()}_${Math.random()
              .toString(36)
              .slice(2)}`,

          sequence,

          sequenceLength:
            analysis.sequence
              .length,

          lastCandle:
            makeCandleCode(
              last
            ),

          patternType:
            analysis.patternName,

          bodyProfile:
            analysis.bodyProfile,

          wickProfile:
            analysis.wickProfile,

          direction,

          result,

          confidence:
            analysis.strength,

          timestamp:
            Date.now(),

          occurrences: 1
        }
      );
    }

    const brain =
      brainRef.current;

    brain.totalTrades++;

    if (
      result === "WIN"
    ) {
      brain.wins++;
    } else {
      brain.losses++;
    }

    brain.winRate =
      brain.totalTrades >
      0
        ? (brain.wins /
            brain.totalTrades) *
          100
        : 0;

    brain.lastUpdated =
      Date.now();

    saveBrain();

    setStatus(
      `🧠 ${result} learned | Pattern: ${analysis.patternName} | Sequence: ${sequence}`
    );

    setSignal("WAIT");

    lastSignalRef.current =
      null;
  };

  /* =========================================================
     ROI MOUSE CONTROLS
     ========================================================= */

  const handleMouseDown = (
    e: React.MouseEvent
  ) => {
    if (roiLocked) return;

    const bounds =
      videoContainerRef.current?.getBoundingClientRect();

    if (!bounds) return;

    dragOffsetRef.current =
      {
        x:
          e.clientX -
          bounds.left -
          roi.x,

        y:
          e.clientY -
          bounds.top -
          roi.y
      };

    setDragging(true);
  };

  const handleResizeMouseDown = (
    e: React.MouseEvent
  ) => {
    if (roiLocked) return;

    e.stopPropagation();

    setResizing(true);
  };

  const handleMouseMove = (
    e: React.MouseEvent
  ) => {
    if (
      roiLocked ||
      (!dragging &&
        !resizing)
    ) {
      return;
    }

    const bounds =
      videoContainerRef.current?.getBoundingClientRect();

    if (!bounds) return;

    if (dragging) {
      const x =
        Math.max(
          0,
          Math.min(
            bounds.width -
              roi.width,
            e.clientX -
              bounds.left -
              dragOffsetRef.current
                .x
          )
        );

      const y =
        Math.max(
          0,
          Math.min(
            bounds.height -
              roi.height,
            e.clientY -
              bounds.top -
              dragOffsetRef.current
                .y
          )
        );

      setRoi(prev => ({
        ...prev,
        x,
        y
      }));
    }

    if (resizing) {
      const newWidth =
        Math.max(
          150,
          Math.min(
            bounds.width -
              roi.x,
            e.clientX -
              bounds.left -
              roi.x
          )
        );

      const newHeight =
        Math.max(
          120,
          Math.min(
            bounds.height -
              roi.y,
            e.clientY -
              bounds.top -
              roi.y
          )
        );

      setRoi(prev => ({
        ...prev,
        width:
          newWidth,
        height:
          newHeight
      }));
    }
  };

  const stopMouse =
    () => {
      setDragging(false);
      setResizing(false);
    };

  /* =========================================================
     UI
     ========================================================= */

  return (
    <div
      className="min-h-screen bg-[#030712] text-white"
      onMouseMove={
        handleMouseMove
      }
      onMouseUp={
        stopMouse
      }
      onMouseLeave={
        stopMouse
      }
    >
      {/* HEADER */}

      <header className="border-b border-slate-800 px-5 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-cyan-400">
              TRADER YODHA X AI
            </h1>

            <p className="text-xs text-slate-500">
              Candle Vision • Body • Wick •
              Sequence • Pattern Memory •
              46S Analysis
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={
                connectScreen
              }
              disabled={
                isStreamActive
              }
              className="px-4 py-2 rounded-lg bg-emerald-600 disabled:bg-slate-700 font-bold"
            >
              CONNECT SCREEN
            </button>

            <button
              onClick={
                disconnectScreen
              }
              disabled={
                !isStreamActive
              }
              className="px-4 py-2 rounded-lg bg-red-600 disabled:bg-slate-700 font-bold"
            >
              DISCONNECT
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-5">
        <div className="grid lg:grid-cols-3 gap-5">
          {/* LEFT */}

          <div className="space-y-5">
            <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5">
              <button
                onClick={
                  manualScan
                }
                disabled={
                  !isStreamActive ||
                  isAnalyzing
                }
                className="w-full py-4 rounded-xl bg-cyan-600 disabled:bg-slate-700 font-black"
              >
                {isAnalyzing
                  ? "ANALYZING..."
                  : "FORCE 46S ANALYSIS"}
              </button>

              <div className="mt-4 flex justify-between">
                <span className="text-slate-500">
                  Next candle:
                </span>

                <span className="text-amber-400 font-mono text-xl">
                  {
                    secondsToCandle
                  }
                  s
                </span>
              </div>
            </div>

            {/* BRAIN */}

            <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5">
              <h2 className="font-bold text-cyan-400 mb-4">
                🧠 AI BRAIN
              </h2>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-xl font-bold">
                    {
                      brainStats.patterns
                    }
                  </div>

                  <div className="text-[10px] text-slate-500">
                    PATTERNS
                  </div>
                </div>

                <div>
                  <div className="text-xl font-bold">
                    {
                      brainStats.zigzag
                    }
                  </div>

                  <div className="text-[10px] text-slate-500">
                    ZIGZAG
                  </div>
                </div>

                <div>
                  <div className="text-xl font-bold text-emerald-400">
                    {brainStats.winRate.toFixed(
                      1
                    )}
                    %
                  </div>

                  <div className="text-[10px] text-slate-500">
                    WIN RATE
                  </div>
                </div>
              </div>
            </div>

            {/* OCR */}

            <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5">
              <div className="text-xs text-slate-500">
                OCR PRICE
              </div>

              <div className="font-mono text-cyan-400 mt-1">
                {ocrPrice}
              </div>
            </div>

            {/* CANDLE DATA */}

            {currentAnalysis && (
              <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5">
                <h2 className="font-bold text-purple-400 mb-3">
                  CANDLE ANALYSIS
                </h2>

                <div className="text-xs space-y-2 font-mono">
                  <div>
                    Pattern:{" "}
                    <b>
                      {
                        currentAnalysis.patternName
                      }
                    </b>
                  </div>

                  <div>
                    Body:{" "}
                    {
                      currentAnalysis.bodyProfile
                    }
                  </div>

                  <div>
                    Wick:{" "}
                    {
                      currentAnalysis.wickProfile
                    }
                  </div>

                  <div>
                    Sequence:
                  </div>

                  <div className="text-cyan-300 break-all">
                    {currentAnalysis.sequence.join(
                      " → "
                    )}
                  </div>

                  <div>
                    Strength:{" "}
                    <b>
                      {
                        currentAnalysis.strength
                      }
                      %
                    </b>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT */}

          <div className="lg:col-span-2 space-y-5">
            {/* VIDEO */}

            <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-bold text-slate-400">
                  LIVE CHART VISION
                </span>

                <button
                  onClick={() =>
                    setRoiLocked(
                      v => !v
                    )
                  }
                  disabled={
                    !isStreamActive
                  }
                  className="text-xs px-3 py-1 rounded bg-slate-800"
                >
                  {roiLocked
                    ? "🔒 ROI LOCKED"
                    : "🔓 ROI EDIT"}
                </button>
              </div>

              <div
                ref={
                  videoContainerRef
                }
                className="relative w-full aspect-video bg-black rounded-lg overflow-hidden"
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
                      className="absolute inset-0 w-full h-full object-contain"
                    />

                    <canvas
                      ref={
                        overlayCanvasRef
                      }
                      className="absolute inset-0 w-full h-full pointer-events-none"
                    />

                    {/* ROI */}

                    <div
                      onMouseDown={
                        handleMouseDown
                      }
                      style={{
                        left:
                          roi.x,
                        top:
                          roi.y,
                        width:
                          roi.width,
                        height:
                          roi.height
                      }}
                      className={`absolute border-2 ${
                        roiLocked
                          ? "border-amber-400 bg-amber-400/5"
                          : "border-cyan-400 bg-cyan-400/10 cursor-move"
                      }`}
                    >
                      <div className="absolute -top-6 left-0 text-[10px] bg-cyan-500 text-black font-bold px-2 py-1 rounded">
                        CANDLE AI ROI
                      </div>

                      {!roiLocked && (
                        <div
                          onMouseDown={
                            handleResizeMouseDown
                          }
                          className="absolute -right-1 -bottom-1 w-4 h-4 bg-cyan-400 cursor-se-resize"
                        />
                      )}
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-center p-5">
                    CONNECT SCREEN dabao aur
                    chart/window select karo.
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

              <div className="mt-3 p-3 bg-black rounded-lg text-xs text-slate-400">
                <span className="text-cyan-400 font-bold">
                  STATUS:
                </span>{" "}
                {status}
              </div>
            </div>

            {/* CANDLE TABLE */}

            <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5">
              <h2 className="font-bold text-cyan-400 mb-4">
                🔢 DETECTED CANDLES
              </h2>

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {detectedCandles
                  .slice(-10)
                  .map(candle => (
                    <div
                      key={
                        candle.number
                      }
                      className="rounded-lg bg-black border border-slate-800 p-3"
                    >
                      <div
                        className={`text-2xl font-black ${
                          candle.color ===
                          "GREEN"
                            ? "text-emerald-400"
                            : candle.color ===
                              "RED"
                            ? "text-red-400"
                            : "text-yellow-400"
                        }`}
                      >
                        #
                        {
                          candle.number
                        }
                      </div>

                      <div className="text-[10px] text-slate-400">
                        {
                          candle.type
                        }
                      </div>

                      <div className="text-[10px] mt-2">
                        Body:{" "}
                        {
                          candle.bodySize
                        }
                      </div>

                      <div className="text-[10px]">
                        ↑ Wick:{" "}
                        {
                          candle.upperWick
                        }
                      </div>

                      <div className="text-[10px]">
                        ↓ Wick:{" "}
                        {
                          candle.lowerWick
                        }
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* SIGNAL */}

            <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-6 text-center">
              <div className="text-xs text-slate-500 mb-3">
                00:00 SIGNAL
              </div>

              <div
                className={`inline-block px-12 py-5 rounded-2xl border-4 text-5xl font-black ${
                  signal ===
                  "CALL"
                    ? "border-emerald-400 text-emerald-400"
                    : signal ===
                      "PUT"
                    ? "border-red-400 text-red-400"
                    : "border-slate-700 text-slate-600"
                }`}
              >
                {signal}
              </div>

              {signal !==
                "WAIT" && (
                <div className="grid grid-cols-2 gap-3 mt-6">
                  <button
                    onClick={() =>
                      logOutcome(
                        "WIN"
                      )
                    }
                    className="py-3 bg-emerald-600 rounded-lg font-bold"
                  >
                    WIN
                  </button>

                  <button
                    onClick={() =>
                      logOutcome(
                        "LOSS"
                      )
                    }
                    className="py-3 bg-red-600 rounded-lg font-bold"
                  >
                    LOSS
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}