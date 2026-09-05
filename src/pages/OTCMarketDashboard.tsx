import { useState, useEffect, useRef, useCallback } from 'react';
import { createWorker } from 'tesseract.js';

// Brain Memory Types - TRADER YODHA X AI Systems
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
  timeKey24H: string;
  minuteMarker: number;
  confidence: number;
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
  dominantColor: 'GREEN' | 'RED' | 'NEUTRAL';
  strength: number;
  priceLevel: number;
  isRoundNumber: boolean;
  bodySize: number;
  topWick: number;
  bottomWick: number;
  detectedMagicNumbers: MagicNumber[];
  matchedZigZag: ZigZagLevel | null;
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

const DB_NAME = 'TraderYodhaX_AI_Database';
const DB_VERSION = 1;
const STORE_NAME = 'trader_yodha_x_brain_store';

export default function TraderYodhaXEngine() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isStreamActive, setIsStreamActive] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [aiSignal, setAiSignal] = useState<'WAIT' | 'CALL' | 'PUT'>('WAIT');
  const [statusMessage, setStatusMessage] = useState("Trader Yodha X OTC Engine Ready. Connect Quotex Screen.");
  const [brainStats, setBrainStats] = useState({ patterns: 0, magicNumbers: 0, timeSyncs: 0, zigzag: 0, winRate: 0 });
  const [currentAnalysis, setCurrentAnalysis] = useState<LiveAnalysis | null>(null);
  const [timeUntilCandle, setTimeUntilCandle] = useState(60);

  // Real-time OCR & ROI Dynamic States
  const [ocrPriceText, setOcrPriceText] = useState<string>("Searching...");
  const [isRealRoundNumber, setIsRealRoundNumber] = useState<boolean>(false);
  
  const [roiBox, setRoiBox] = useState<CropRegion>({ x: 100, y: 50, width: 250, height: 250 });
  const [isRoiLocked, setIsRoiLocked] = useState<boolean>(false);

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const ocrCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const ocrWorkerRef = useRef<any>(null);

  const brainRef = useRef<BrainState>({
    patterns: [],
    magicNumbers: [],
    timeAlgorithms: [],
    zigzagLevels: [],
    totalTrades: 0,
    winRate: 0,
    lastUpdated: Date.now()
  });
  
  const pendingSignalRef = useRef<{ signal: 'CALL' | 'PUT'; analysis: LiveAnalysis } | null>(null);
  const continuousLearningRef = useRef<NodeJS.Timeout | null>(null);
  const lastPriceRef = useRef<number>(0);
  const lastColorRef = useRef<'GREEN' | 'RED' | 'NEUTRAL'>('NEUTRAL');
  const priceHistoryRef = useRef<{price: number, time: number}[]>([]);

  useEffect(() => {
    if (isStreamActive && stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [isStreamActive, stream]);

  useEffect(() => {
    const initOCR = async () => {
      try {
        const worker = await createWorker('eng');
        ocrWorkerRef.current = worker;
        setStatusMessage("Trader Yodha X Vision Engine Initialized.");
      } catch (err) {
        console.error("OCR Init Error:", err);
      }
    };
    initOCR();

    return () => {
      if (ocrWorkerRef.current) ocrWorkerRef.current.terminate();
    };
  }, []);

  const updateBrainStats = useCallback(() => {
    const brain = brainRef.current;
    setBrainStats({
      patterns: brain.patterns.length,
      magicNumbers: brain.magicNumbers.length,
      timeSyncs: brain.timeAlgorithms.length,
      zigzag: brain.zigzagLevels?.length || 0,
      winRate: brain.winRate
    });
  }, []);

  const initIndexedDB = useCallback((): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
      request.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);
    });
  }, []);

  const saveBrainToDB = useCallback(async () => {
    try {
      const db = await initIndexedDB();
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      brainRef.current.lastUpdated = Date.now();
      store.put(brainRef.current, 'trader_yodha_x_brain_state');
      updateBrainStats();
    } catch (err) {
      console.error("IndexedDB Save Failure:", err);
    }
  }, [initIndexedDB, updateBrainStats]);

  const loadBrainFromDB = useCallback(async () => {
    try {
      const db = await initIndexedDB();
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get('trader_yodha_x_brain_state');

      request.onsuccess = () => {
        if (request.result) {
          const parsed: BrainState = request.result;
          if (!parsed.zigzagLevels) parsed.zigzagLevels = [];
          if (!parsed.timeAlgorithms) parsed.timeAlgorithms = [];
          brainRef.current = parsed;
          updateBrainStats();
          setStatusMessage(`Trader Yodha X Brain Active: ${parsed.patterns.length} patterns loaded.`);
        }
      };
    } catch (err) {
      console.error("IndexedDB Load Failure:", err);
    }
  }, [initIndexedDB, updateBrainStats]);

  useEffect(() => {
    loadBrainFromDB();
  }, [loadBrainFromDB]);

  const getPriceRange = (price: number): string => {
    const base = Math.floor(price * 1000);
    return `${(base / 1000).toFixed(3)}-${((base + 1) / 1000).toFixed(3)}`;
  };

  const checkIsRoundNumber = (price: number): boolean => {
    const priceStr = price.toFixed(5);
    return priceStr.endsWith('000') || priceStr.endsWith('500') || priceStr.endsWith('0000') || priceStr.endsWith('5000');
  };

  const drawZigZagOverlays = useCallback(() => {
    if (!overlayCanvasRef.current || !videoRef.current) return;
    const canvas = overlayCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = videoRef.current.clientWidth || 800;
    canvas.height = videoRef.current.clientHeight || 450;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const levels = brainRef.current.zigzagLevels;
    if (levels.length === 0) return;

    levels.slice(-5).forEach((level) => {
      const y = level.screenY || Math.floor(canvas.height * 0.4);
      ctx.beginPath();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = level.type === 'HIGH' ? '#f43f5e' : '#10b981';
      ctx.lineWidth = 2;
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();

      ctx.fillStyle = level.type === 'HIGH' ? '#f43f5e' : '#10b981';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`ZIGZAG ${level.type}: ${level.price.toFixed(5)}`, 15, y - 5);
    });
  }, []);

  const processZigZagLogic = useCallback((currentPrice: number) => {
    const history = priceHistoryRef.current;
    history.push({ price: currentPrice, time: Date.now() });
    if (history.length > 50) history.shift();
    if (history.length < 10) return;

    const prices = history.map(h => h.price);
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const lastIndex = history.length - 1;

    let detectedPeak: 'HIGH' | 'LOW' | null = null;
    let peakPrice = 0;

    if (history[lastIndex].price === maxPrice && maxPrice - history[0].price > 0.00030) {
      detectedPeak = 'HIGH';
      peakPrice = maxPrice;
    } else if (history[lastIndex].price === minPrice && history[0].price - minPrice > 0.00030) {
      detectedPeak = 'LOW';
      peakPrice = minPrice;
    }

    if (detectedPeak) {
      const brain = brainRef.current;
      const existingLevel = brain.zigzagLevels.find(zl => Math.abs(zl.price - peakPrice) < 0.00020);

      if (existingLevel) {
        existingLevel.occurrences++;
        existingLevel.timestamp = Date.now();
      } else {
        brain.zigzagLevels.push({
          price: peakPrice,
          type: detectedPeak,
          occurrences: 1,
          timestamp: Date.now(),
          screenY: Math.floor(Math.random() * 200) + 100
        });
      }
      drawZigZagOverlays();
    }
  }, [drawZigZagOverlays]);

  const detectMagicNumber = useCallback((currentPrice: number, currentColor: 'GREEN' | 'RED' | 'NEUTRAL', lastPrice: number, lastColor: 'GREEN' | 'RED' | 'NEUTRAL') => {
    if (lastColor === currentColor || currentColor === 'NEUTRAL' || lastColor === 'NEUTRAL') return;

    const isRound = checkIsRoundNumber(currentPrice);
    const priceRange = getPriceRange(currentPrice);
    const direction = lastColor === 'GREEN' ? 'GREEN_TO_RED' : 'RED_TO_GREEN';

    const existing = brainRef.current.magicNumbers.find(
      mn => Math.abs(mn.priceLevel - currentPrice) < 0.0003 && mn.priceRange === priceRange
    );

    if (existing) {
      existing.occurrences++;
      existing.lastSeen = Date.now();
      existing.isRoundNumber = isRound;
    } else {
      brainRef.current.magicNumbers.push({
        priceLevel: currentPrice,
        isRoundNumber: isRound,
        priceRange,
        direction,
        occurrences: 1,
        successRate: 0.5,
        lastSeen: Date.now()
      });
    }
  }, []);

  const trackTimeAlgorithm = useCallback((currentMinute: number, currentSecond: number, color: 'GREEN' | 'RED' | 'NEUTRAL') => {
    const brain = brainRef.current;
    const now = new Date();
    const timeKey24H = `${String(now.getHours()).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}:${String(currentSecond).padStart(2, '0')}`;
    
    let timeAlgo = brain.timeAlgorithms.find(ta => ta.timeKey24H === timeKey24H);
    const direction = color === 'GREEN' ? 'UP' : color === 'RED' ? 'DOWN' : 'NEUTRAL';

    if (!timeAlgo) {
      timeAlgo = {
        timeKey24H,
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
      if (timeAlgo.direction !== direction && direction !== 'NEUTRAL') {
        timeAlgo.direction = direction;
      }
    }
    if (currentSecond % 15 === 0) saveBrainToDB();
  }, [saveBrainToDB]);

  const getScaledROI = useCallback(() => {
    if (!videoRef.current || !videoContainerRef.current) return roiBox;

    const containerWidth = videoContainerRef.current.clientWidth || 800;
    const containerHeight = videoContainerRef.current.clientHeight || 450;
    const actualWidth = videoRef.current.videoWidth || containerWidth;
    const actualHeight = videoRef.current.videoHeight || containerHeight;

    const scaleX = actualWidth / containerWidth;
    const scaleY = actualHeight / containerHeight;

    return {
      x: Math.max(0, Math.floor(roiBox.x * scaleX)),
      y: Math.max(0, Math.floor(roiBox.y * scaleY)),
      width: Math.min(actualWidth, Math.floor(roiBox.width * scaleX)),
      height: Math.min(actualHeight, Math.floor(roiBox.height * scaleY))
    };
  }, [roiBox]);

  const extractPriceLevelWithOCR = async (ctx: CanvasRenderingContext2D): Promise<number> => {
    if (ocrWorkerRef.current && ocrCanvasRef.current) {
      const ocrCtx = ocrCanvasRef.current.getContext('2d');
      if (ocrCtx) {
        const targetROI = getScaledROI();
        ocrCanvasRef.current.width = Math.max(1, targetROI.width);
        ocrCanvasRef.current.height = Math.max(1, targetROI.height);

        ocrCtx.drawImage(
          ctx.canvas,
          targetROI.x, targetROI.y, targetROI.width, targetROI.height,
          0, 0, targetROI.width, targetROI.height
        );

        try {
          const { data: { text } } = await ocrWorkerRef.current.recognize(ocrCanvasRef.current);
          const matched = text.match(/\d+\.\d+/);
          if (matched) {
            const parsedPrice = parseFloat(matched[0]);
            if (!isNaN(parsedPrice) && parsedPrice > 0) {
              const isRound = checkIsRoundNumber(parsedPrice);
              setOcrPriceText(`${parsedPrice.toFixed(5)} ${isRound ? '🎯 [ROUND SNR]' : ''}`);
              setIsRealRoundNumber(isRound);
              return parsedPrice;
            }
          }
        } catch (e) {}
      }
    }
    return lastPriceRef.current || 0;
  };

  const analyzePixelDistribution = (frameData: Uint8ClampedArray, width: number, height: number) => {
    let greenPixels = 0;
    let redPixels = 0;
    const candleRegions: { x: number; color: 'GREEN' | 'RED' }[] = [];
    
    let globalYMin = height; 
    let globalYMax = 0;   
    let bodyTopCoord = height;
    let bodyBottomCoord = 0;

    const chunkSize = Math.floor(width / 20); 
    for (let chunk = 0; chunk < 20; chunk++) {
      let chunkGreen = 0;
      let chunkRed = 0;

      for (let x = chunk * chunkSize; x < (chunk + 1) * chunkSize; x++) {
        for (let y = 0; y < height; y++) {
          const i = (y * width + x) * 4;
          const r = frameData[i];
          const g = frameData[i + 1];
          const b = frameData[i + 2];

          const isGreen = g > r + 30 && g > b + 30;
          const isRed = r > g + 30 && r > b + 30;

          if (isGreen || isRed) {
            if (y < globalYMin) globalYMin = y;
            if (y > globalYMax) globalYMax = y;
            if (isGreen) chunkGreen++;
            if (isRed) chunkRed++;
          }
        }
      }

      if (chunkGreen > 100 || chunkRed > 100) {
        candleRegions.push({
          x: chunk,
          color: chunkGreen > chunkRed ? 'GREEN' : 'RED'
        });
        
        if (chunk === 19 || chunk === 18) { 
          bodyTopCoord = globalYMin + 15;
          bodyBottomCoord = globalYMax - 15;
        }
      }

      greenPixels += chunkGreen;
      redPixels += chunkRed;
    }

    const actualBodySize = Math.max(0, bodyBottomCoord - bodyTopCoord);
    const actualTopWickSize = Math.max(0, bodyTopCoord - globalYMin);
    const actualBottomWickSize = Math.max(0, globalYMax - bodyBottomCoord);

    return { 
      greenPixels, 
      redPixels, 
      candleRegions,
      actualBodySize,
      actualTopWickSize,
      actualBottomWickSize
    };
  };

  const startContinuousLearning = useCallback((mediaStream: MediaStream) => {
    const learnInterval = setInterval(async () => {
      if (!canvasRef.current || !videoRef.current) return;
      const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      const vWidth = videoRef.current.videoWidth || 800;
      const vHeight = videoRef.current.videoHeight || 400;
      canvasRef.current.width = vWidth;
      canvasRef.current.height = vHeight;

      ctx.drawImage(videoRef.current, 0, 0, vWidth, vHeight);
      
      const targetROI = getScaledROI();
      const croppedImageData = ctx.getImageData(
        targetROI.x, targetROI.y, 
        Math.max(1, targetROI.width), Math.max(1, targetROI.height)
      );

      const { greenPixels, redPixels } = analyzePixelDistribution(
        croppedImageData.data, Math.max(1, targetROI.width), Math.max(1, targetROI.height)
      );
      
      const currentColor = greenPixels > redPixels * 1.05 ? 'GREEN' : redPixels > greenPixels * 1.05 ? 'RED' : 'NEUTRAL';
      const currentPrice = await extractPriceLevelWithOCR(ctx);
      
      if (currentPrice > 0) {
        processZigZagLogic(currentPrice);
        detectMagicNumber(currentPrice, currentColor, lastPriceRef.current, lastColorRef.current);
        lastPriceRef.current = currentPrice;
      }

      const now = new Date();
      trackTimeAlgorithm(now.getMinutes(), now.getSeconds(), currentColor);
      lastColorRef.current = currentColor;
    }, 500);

    continuousLearningRef.current = learnInterval;
  }, [getScaledROI, processZigZagLogic, detectMagicNumber, trackTimeAlgorithm]);

  const connectStream = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "window", width: 1280, height: 720, frameRate: 30 } as any,
        audio: false
      });
      setStream(mediaStream);
      setIsStreamActive(true);
      setStatusMessage("Connected! Trader Yodha X OTC Engine live...");
      startContinuousLearning(mediaStream);
    } catch (err) {
      console.error(err);
      setStatusMessage("Connection failed. Share Quotex screen.");
    }
  };

  const disconnectStream = () => {
    if (continuousLearningRef.current) clearInterval(continuousLearningRef.current);
    if (stream) stream.getTracks().forEach(track => track.stop());
    setStream(null);
    setIsStreamActive(false);
    setIsScanning(false);
    setAiSignal('WAIT');
    setStatusMessage("Engine paused.");
  };

  // Instant OTC Fast Engine (Runs within 2 seconds instead of 46s)
  const executeFastScan = async () => {
    if (!canvasRef.current || !videoRef.current) return;
    const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const vWidth = videoRef.current.videoWidth || 800;
    const vHeight = videoRef.current.videoHeight || 400;
    canvasRef.current.width = vWidth;
    canvasRef.current.height = vHeight;
    ctx.drawImage(videoRef.current, 0, 0, vWidth, vHeight);

    const targetROI = getScaledROI();
    const croppedImageData = ctx.getImageData(
      targetROI.x, targetROI.y, 
      Math.max(1, targetROI.width), Math.max(1, targetROI.height)
    );

    const analysisRes = analyzePixelDistribution(
      croppedImageData.data, Math.max(1, targetROI.width), Math.max(1, targetROI.height)
    );

    const currentPrice = await extractPriceLevelWithOCR(ctx);
    const isRound = checkIsRoundNumber(currentPrice);
    const priceRange = getPriceRange(currentPrice);

    const matchedZigZag = brainRef.current.zigzagLevels.reduce((closest, current) => {
      const currentDiff = Math.abs(current.price - currentPrice);
      const closestDiff = closest ? Math.abs(closest.price - currentPrice) : Infinity;
      return currentDiff < closestDiff && currentDiff < 0.00150 ? current : closest;
    }, null as ZigZagLevel | null);

    const relevantMagicNumbers = brainRef.current.magicNumbers.filter(
      mn => mn.priceRange === priceRange && Math.abs(mn.priceLevel - currentPrice) < 0.005
    );

    const now = new Date();
    const currentMinute = now.getMinutes();
    const currentSecond = now.getSeconds();
    const timeKey24H = `${String(now.getHours()).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}:${String(currentSecond).padStart(2, '0')}`;
    const timeSyncData = brainRef.current.timeAlgorithms.find(ta => ta.timeKey24H === timeKey24H);

    const dominantColor: 'GREEN' | 'RED' | 'NEUTRAL' = 
      analysisRes.greenPixels > analysisRes.redPixels * 1.05 ? 'GREEN' : analysisRes.redPixels > analysisRes.greenPixels * 1.05 ? 'RED' : 'NEUTRAL';

    let proposedSignal: 'CALL' | 'PUT' = dominantColor === 'GREEN' ? 'CALL' : 'PUT';
    let confidence = 0.85;
    let patternString = `Dominant Candle: ${dominantColor}`;

    if (analysisRes.actualTopWickSize > analysisRes.actualBodySize * 1.8) {
      proposedSignal = 'PUT';
      patternString += ` | REVERSAL: TOP WICK EXHAUSTION`;
    } else if (analysisRes.actualBottomWickSize > analysisRes.actualBodySize * 1.8) {
      proposedSignal = 'CALL';
      patternString += ` | REVERSAL: BOTTOM WICK EXHAUSTION`;
    }

    if (matchedZigZag) {
      if (matchedZigZag.type === 'HIGH' && proposedSignal === 'CALL') {
        proposedSignal = 'PUT';
        patternString += ` | ZIGZAG RESISTANCE`;
      } else if (matchedZigZag.type === 'LOW' && proposedSignal === 'PUT') {
        proposedSignal = 'CALL';
        patternString += ` | ZIGZAG SUPPORT`;
      }
    }

    if (isRound) {
      patternString += ` | SNR ROUND LEVEL`;
    }

    const liveData: LiveAnalysis = {
      pattern: patternString,
      sequence: [dominantColor === 'GREEN' ? 'G' : 'R'],
      dominantColor,
      strength: confidence,
      priceLevel: currentPrice,
      isRoundNumber: isRound,
      bodySize: analysisRes.actualBodySize,
      topWick: analysisRes.actualTopWickSize,
      bottomWick: analysisRes.actualBottomWickSize,
      detectedMagicNumbers: relevantMagicNumbers,
      matchedZigZag,
      timeKey24H,
      timestampSecond: currentSecond,
      currentMinute,
      timeSyncData: timeSyncData || null
    };

    setCurrentAnalysis(liveData);
    pendingSignalRef.current = { signal: proposedSignal, analysis: liveData };
    setIsScanning(false);
    setStatusMessage(`Signal Prepared for Next 1-Min Candle! Lock time: 00:00`);
  };

  const triggerAnalysis = () => {
    if (!isStreamActive || !videoRef.current) {
      setStatusMessage("Error: Connect screen first!");
      return;
    }
    setIsScanning(true);
    setStatusMessage("Trader Yodha X Fast Scan: Analyzing OTC Candle Setup...");
    setAiSignal('WAIT');
    setTimeout(() => {
      executeFastScan();
    }, 1500);
  };

  // Candle Sync Loop for 00:00 Exact Second Lock
  useEffect(() => {
    const candleSync = setInterval(() => {
      const now = new Date();
      const seconds = now.getSeconds();
      const milliseconds = now.getMilliseconds();
      const timeUntilNext = 60 - seconds - (milliseconds / 1000);
      setTimeUntilCandle(Math.ceil(timeUntilNext));

      // Auto trigger fast scan at :52 seconds
      if (isStreamActive && seconds === 52 && !isScanning && !pendingSignalRef.current) {
        executeFastScan();
      }

      // Execute Signal exactly at :00 entry
      if (pendingSignalRef.current && (seconds === 0 || seconds === 59) && milliseconds < 400) {
        setAiSignal(pendingSignalRef.current.signal);
        setStatusMessage(`🚀 SIGNAL ACTIVE (${pendingSignalRef.current.signal}) | Entry: 00:00`);
        pendingSignalRef.current = null;
      }
    }, 100);

    return () => clearInterval(candleSync);
  }, [isStreamActive, isScanning]);

  const logTradeOutcome = (result: 'WIN' | 'LOSS') => {
    if (aiSignal === 'WAIT' || !currentAnalysis) return;

    const brain = brainRef.current;
    const patternId = `${currentAnalysis.bodySize.toFixed(0)}_${Date.now()}`;

    brain.patterns.push({
      id: patternId,
      pattern: currentAnalysis.pattern,
      sequenceLength: currentAnalysis.sequence.length,
      priceLevel: currentAnalysis.priceLevel,
      priceRange: getPriceRange(currentAnalysis.priceLevel),
      bodySize: currentAnalysis.bodySize,
      topWickSize: currentAnalysis.topWick,
      bottomWickSize: currentAnalysis.bottomWick,
      result,
      timestamp: Date.now(),
      timeSync: currentAnalysis.timestampSecond,
      timeKey24H: currentAnalysis.timeKey24H,
      minuteMarker: currentAnalysis.currentMinute,
      confidence: currentAnalysis.strength
    });

    brain.totalTrades++;
    const wins = brain.patterns.filter(p => p.result === 'WIN').length;
    brain.winRate = brain.patterns.length > 0 ? (wins / brain.patterns.length) * 100 : 0;

    saveBrainToDB();
    setStatusMessage(`Outcome logged [${result}]. System Win Rate: ${brain.winRate.toFixed(1)}%`);
    setAiSignal('WAIT');
    setCurrentAnalysis(null);
  };

  const clearBrain = async () => {
    const password = prompt('Enter Master Password:');
    if (password === 'YODDHAX_REBORN') {
      brainRef.current = {
        patterns: [],
        magicNumbers: [],
        timeAlgorithms: [],
        zigzagLevels: [],
        totalTrades: 0,
        winRate: 0,
        lastUpdated: Date.now()
      };
      await saveBrainToDB();
      setStatusMessage("Trader Yodha X Memory Reset.");
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isRoiLocked) return;
    e.stopPropagation();
    setIsDragging(true);
    setDragStart({ x: e.clientX - roiBox.x, y: e.clientY - roiBox.y });
  };

  const handleResizeDown = (e: React.MouseEvent) => {
    if (isRoiLocked) return;
    e.stopPropagation();
    setIsResizing(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isRoiLocked || (!isDragging && !isResizing)) return;

    if (videoContainerRef.current) {
      const bounds = videoContainerRef.current.getBoundingClientRect();

      if (isDragging) {
        const newX = Math.max(0, Math.min(bounds.width - roiBox.width, e.clientX - bounds.left - dragStart.x));
        const newY = Math.max(0, Math.min(bounds.height - roiBox.height, e.clientY - bounds.top - dragStart.y));
        setRoiBox(prev => ({ ...prev, x: newX, y: newY }));
      } else if (isResizing) {
        const deltaX = e.clientX - dragStart.x;
        const deltaY = e.clientY - dragStart.y;
        setDragStart({ x: e.clientX, y: e.clientY });
        setRoiBox(prev => ({
          ...prev,
          width: Math.max(80, Math.min(bounds.width - prev.x, prev.width + deltaX)),
          height: Math.max(80, Math.min(bounds.height - prev.y, prev.height + deltaY))
        }));
      }
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsResizing(false);
  };

  return (
    <div className="min-h-screen bg-[#040814] text-slate-100 font-sans" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-cyan-400 tracking-wider">TRADER YODHA X AI (OTC FAST ENGINE)</h1>
            <p className="text-slate-500 text-sm">Candle-to-Candle Direct Signal Generator</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right mr-4">
              <div className="text-xs text-slate-500">Intelligence Nodes</div>
              <div className="text-sm font-mono text-emerald-400">
                {brainStats.patterns} Patterns | Win Rate: {brainStats.winRate.toFixed(1)}%
              </div>
            </div>
            {!isStreamActive ? (
              <button onClick={connectStream} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-all shadow-md shadow-emerald-600/20">
                Connect Quotex Screen
              </button>
            ) : (
              <button onClick={disconnectStream} className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-all">
                Disconnect
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4">
            <div className="bg-[#0f172a] rounded-xl p-5 border border-slate-800 shadow-md">
              <button
                onClick={triggerAnalysis}
                disabled={!isStreamActive || isScanning}
                className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
                  !isStreamActive || isScanning
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/30'
                }`}
              >
                {isScanning ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Scanning OTC Candle...
                  </span>
                ) : (
                  'INSTANT OTC SCAN'
                )}
              </button>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-slate-500">Next Candle Entry In:</span>
                <span className="font-mono text-xl text-amber-400">{timeUntilCandle}s</span>
              </div>
            </div>

            <div className="bg-[#0f172a] rounded-xl p-5 border border-slate-800">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wider font-mono">OCR Telemetry</h3>
              <div className="text-xs space-y-2 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">OCR Level:</span>
                  <span className={`font-bold ${isRealRoundNumber ? 'text-emerald-400' : 'text-cyan-400'}`}>{ocrPriceText}</span>
                </div>
              </div>
            </div>

            {currentAnalysis && (
              <div className="bg-[#0f172a] rounded-xl p-5 border border-slate-800 animate-fadeIn">
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wider font-mono font-bold">OTC Live Pattern</h3>
                <div className="text-xs text-slate-300 space-y-2 font-mono">
                  <p className="break-all"><span className="text-slate-500">Logic:</span> {currentAnalysis.pattern}</p>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="bg-[#0f172a] rounded-xl p-5 border border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isStreamActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                  <span className="text-xs font-bold text-slate-400">QUOTEX CHART STREAM</span>
                </div>
                {isStreamActive && (
                  <button
                    onClick={() => setIsRoiLocked(!isRoiLocked)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                      isRoiLocked ? 'bg-red-900/60 text-red-400 border border-red-500/40' : 'bg-cyan-900/60 text-cyan-400 border border-cyan-500/40'
                    }`}
                  >
                    {isRoiLocked ? '🔒 ROI Box Locked' : '🔓 Drag/Resize Box Active'}
                  </button>
                )}
              </div>
              
              <div ref={videoContainerRef} className="bg-[#020617] rounded-lg aspect-video flex items-center justify-center overflow-hidden border border-slate-900 relative select-none">
                {isStreamActive ? (
                  <>
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain pointer-events-none" />
                    <canvas ref={overlayCanvasRef} className="absolute inset-0 pointer-events-none w-full h-full" />
                    
                    <div
                      onMouseDown={handleMouseDown}
                      style={{
                        left: `${roiBox.x}px`,
                        top: `${roiBox.y}px`,
                        width: `${roiBox.width}px`,
                        height: `${roiBox.height}px`
                      }}
                      className={`absolute border-2 ${
                        isRoiLocked ? 'border-amber-400 bg-amber-500/10' : 'border-cyan-400 bg-cyan-500/10 cursor-move'
                      } flex flex-col justify-between p-1 z-20 shadow-[0_0_15px_rgba(6,182,212,0.3)]`}
                    >
                      <div className="flex justify-between items-center text-[10px] font-mono text-cyan-300 font-bold bg-slate-950/80 px-1 py-0.5 rounded pointer-events-none">
                        <span>AI OCR TARGET</span>
                        <span>{roiBox.width}x{roiBox.height}</span>
                      </div>
                      
                      {!isRoiLocked && (
                        <div
                          onMouseDown={handleResizeDown}
                          className="w-3.5 h-3.5 bg-cyan-400 absolute bottom-0 right-0 cursor-se-resize rounded-tl shadow-md"
                        />
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-center space-y-2">
                    <p className="text-slate-500 font-medium">Connect chart screen to start TRADER YODHA X AI.</p>
                  </div>
                )}
              </div>
              <canvas ref={canvasRef} className="hidden" />
              <canvas ref={ocrCanvasRef} className="hidden" />
              
              <div className="mt-3 px-4 py-2 bg-[#020617] rounded-lg border-l-4 border-cyan-500">
                <p className="text-xs text-slate-400"><strong className="text-cyan-400">Status:</strong> {statusMessage}</p>
              </div>
            </div>

            <div className="bg-[#0f172a] rounded-xl p-6 border border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <span className="px-3 py-1 bg-purple-900/50 text-purple-300 text-xs font-bold rounded tracking-wide">TRADER YODHA X SIGNAL EXECUTOR</span>
                <span className="text-xs text-slate-500 font-mono">1-Min Candle Transition</span>
              </div>
              <div className="text-center py-8">
                <div className={`inline-block px-14 py-6 rounded-2xl text-6xl font-black tracking-widest border-4 transition-all duration-300 ${
                  aiSignal === 'CALL'
                    ? 'bg-emerald-500/10 border-emerald-400 text-emerald-400 shadow-[0_0_30px_rgba(52,211,153,0.2)]'
                    : aiSignal === 'PUT'
                    ? 'bg-red-500/10 border-red-400 text-red-400 shadow-[0_0_30px_rgba(248,113,113,0.2)]'
                    : 'bg-slate-800 border-slate-700 text-slate-600'
                }`}>
                  {aiSignal}
                </div>
              </div>
              {aiSignal !== 'WAIT' && (
                <div className="mt-4 pt-4 border-t border-slate-800">
                  <p className="text-xs text-slate-400 text-center mb-3">Log outcome to train TRADER YODHA X AI:</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => logTradeOutcome('WIN')} className="py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-all tracking-wide">
                      WIN
                    </button>
                    <button onClick={() => logTradeOutcome('LOSS')} className="py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-all tracking-wide">
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