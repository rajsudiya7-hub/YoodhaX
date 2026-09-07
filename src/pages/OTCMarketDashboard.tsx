import { useState, useEffect, useRef, useCallback } from "react";
import { screenCaptureController, type ScreenCaptureStatus, type ViewportAnalysis } from "@/lib/screen-capture-controller";
import { voiceController } from "@/lib/voice-controller";
import { memoryBuffer } from "@/lib/memory-buffer";
import { generateDecisionEngineSignal, recordPatternFailure, getLastFailureAnalysis, type TradeSignal } from "@/lib/decision-engine";
import { candleTimerService, type CandleTimerState } from "@/lib/candle-timer";
import { executionTimer, type ExecutionState } from "@/lib/execution-timer";
import { patternLearning } from "@/lib/pattern-learning";
import { sequenceMemory } from "@/lib/sequence-memory";
import { ScreenVisionEngine, type VisionAnalysis } from "@/lib/vision-ai-engine";
import { parseVoiceIntent, buildSignalMessage, buildAnalysisStartMessage, buildTimerMessage, buildWinMessage, buildLossMessage, type Lang } from "@/lib/language-engine";
import { OTC_ASSETS } from "@/lib/trading-assets";
import {
  Activity, Monitor, ChevronDown, Brain, Zap, Mic, MicOff,
  Volume2, VolumeX, Database, TrendingUp, TrendingDown,
  Clock, Radio, Shield, BookOpen, ChevronRight,
  Search, Target, AlertCircle, Eye, Layers, Loader2
} from "lucide-react";

type SignalType = "CALL" | "PUT" | "WAIT";

function candleKey(timeframe: 1 | 5, now = Date.now()): number {
  return Math.floor(now / (timeframe * 60 * 1000));
}

function isEntryWindow(timeframe: 1 | 5, now = Date.now()): boolean {
  const elapsed = now % (timeframe * 60 * 1000);
  return elapsed < 5_000;
}

export default function OTCMarketPage() {
  const [selectedAsset, setSelectedAsset] = useState(OTC_ASSETS[0]);
  const [selectedTimeframe, setSelectedTimeframe] = useState<1 | 5>(1);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [captureStatus, setCaptureStatus] = useState<ScreenCaptureStatus | null>(null);
  const [viewportAnalysis, setViewportAnalysis] = useState<ViewportAnalysis | null>(null);
  const [signal, setSignal] = useState<TradeSignal | null>(null);
  const [isVoiceMonitorOn, setIsVoiceMonitorOn] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [voiceLog, setVoiceLog] = useState<{ text: string; dir: "in" | "out"; ts: number; lang?: Lang }[]>([]);
  const [memoryCount, setMemoryCount] = useState(0);
  const [winRate, setWinRate] = useState(0);
  const [timerState, setTimerState] = useState<CandleTimerState | null>(null);
  const [execState, setExecState] = useState<ExecutionState | null>(null);
  const [activeLang, setActiveLang] = useState<Lang>("en");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [failureNote, setFailureNote] = useState<string | null>(null);
  const [learnedSequences, setLearnedSequences] = useState(sequenceMemory.getLearnedSequences());
  const [viewportSignal, setViewportSignal] = useState<{ dir: "UP" | "DOWN" | null; accuracy: number }>({ dir: null, accuracy: 0 });
  const [visionAnalysis, setVisionAnalysis] = useState<VisionAnalysis | null>(null);
  const [visionReady, setVisionReady] = useState(false);
  const [isDeepScanning, setIsDeepScanning] = useState(false);
  const [deepScanMessage, setDeepScanMessage] = useState("Automatic OTC scan arms at 46s.");

  // Stable refs
  const observationStart = useRef<number>(Date.now());
  const analysisInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const viewportInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevSignalRef = useRef<string>("WAIT");
  const assetRef = useRef(selectedAsset);
  const tfRef = useRef(selectedTimeframe);
  const mutedRef = useRef(isMuted);
  const langRef = useRef<Lang>("en");
  const isAnalyzingRef = useRef(false);
  const timerUnsubRef = useRef<(() => void) | null>(null);
  const execUnsubRef = useRef<(() => void) | null>(null);
  const timerAlertedRef = useRef(false);
  const timerSecondsRef = useRef<number>(60);
  const lastCandlesRef = useRef<Array<{ type: "GREEN" | "RED" | "DOJI" }>>([]);
  const visionEngineRef = useRef<ScreenVisionEngine | null>(null);
  const visionAnalysisRef = useRef<VisionAnalysis | null>(null);
  const visionInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const visionBusyRef = useRef(false);
  const deepScanFnRef = useRef<((manual: boolean) => Promise<void>) | null>(null);
  const releasePendingRef = useRef<(() => void) | null>(null);
  const pendingSignalRef = useRef<TradeSignal | null>(null);
  const pendingCandleRef = useRef<number | null>(null);
  const lastDeepScanCandleRef = useRef<number | null>(null);
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  assetRef.current = selectedAsset;
  tfRef.current = selectedTimeframe;
  mutedRef.current = isMuted;
  langRef.current = activeLang;
  isAnalyzingRef.current = isAnalyzing;
  visionAnalysisRef.current = visionAnalysis;

  const addVoiceLog = useCallback((text: string, dir: "in" | "out", lang?: Lang) => {
    setVoiceLog(prev => [...prev.slice(-39), { text, dir, ts: Date.now(), lang }]);
  }, []);

  const speak = useCallback((msg: string) => {
    if (mutedRef.current) return;
    voiceController.speak(msg, true);
    addVoiceLog(msg, "out", langRef.current);
  }, [addVoiceLog]);

  // ─── Viewport loop (every 2s) ────────────────────────────────────────────
  const startViewportLoop = useCallback(() => {
    if (viewportInterval.current) clearInterval(viewportInterval.current);
    viewportInterval.current = setInterval(() => {
      const vp = screenCaptureController.getViewportAnalysis();
      if (vp) {
        setViewportAnalysis(vp);
        if (vp.direction !== "NEUTRAL" && vp.accuracy >= 75) {
          setViewportSignal({ dir: vp.direction, accuracy: vp.accuracy });
        }
      }
    }, 2000);
  }, []);

  const stopViewportLoop = useCallback(() => {
    if (viewportInterval.current) { clearInterval(viewportInterval.current); viewportInterval.current = null; }
    setViewportAnalysis(null);
    setViewportSignal({ dir: null, accuracy: 0 });
  }, []);

  // ─── Screen vision loop (every 1.5s) ─────────────────────────────────────
  const startVisionLoop = useCallback(() => {
    if (visionInterval.current) clearInterval(visionInterval.current);

    const scan = async () => {
      if (!isAnalyzingRef.current || visionBusyRef.current) return;
      const frame = screenCaptureController.getLatestFrame();
      const engine = visionEngineRef.current;
      if (!frame || !engine) return;

      visionBusyRef.current = true;
      try {
        const result = await engine.analyzeFrame(frame);
        if (result) setVisionAnalysis(result);
      } finally {
        visionBusyRef.current = false;
      }
    };

    void scan();
    visionInterval.current = setInterval(() => void scan(), 1500);
  }, []);

  const stopVisionLoop = useCallback(() => {
    if (visionInterval.current) {
      clearInterval(visionInterval.current);
      visionInterval.current = null;
    }
    visionBusyRef.current = false;
    setVisionAnalysis(null);
  }, []);

  // Draw the captured chart plus candle IDs, ZigZag legs, and structure labels.
  useEffect(() => {
    const canvas = screenCanvasRef.current;
    const frame = screenCaptureController.getLatestFrame();
    if (!canvas || !frame) return;

    canvas.width = frame.width;
    canvas.height = frame.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.putImageData(frame, 0, 0);

    if (!visionAnalysis) return;
    context.lineWidth = Math.max(1, frame.width / 900);
    context.font = `${Math.max(10, frame.width / 110)}px monospace`;

    visionAnalysis.candles.forEach(candle => {
      context.strokeStyle = candle.color === "GREEN" ? "#4ade80" : "#f87171";
      context.fillStyle = context.strokeStyle;
      context.strokeRect(candle.x, candle.top, candle.width, Math.max(2, candle.bottom - candle.top));
      context.fillText(`#${candle.id}`, candle.x, Math.max(12, candle.top - 4));
    });

    if (visionAnalysis.zigzag.length > 1) {
      context.beginPath();
      visionAnalysis.zigzag.forEach((point, index) => {
        const candle = visionAnalysis.candles.find(item => item.id === point.candleId);
        const x = (candle?.x ?? 0) + (candle?.width ?? 0) / 2;
        if (index === 0) context.moveTo(x, point.y);
        else context.lineTo(x, point.y);
      });
      context.strokeStyle = "#facc15";
      context.lineWidth = Math.max(2, frame.width / 500);
      context.stroke();

      visionAnalysis.zigzag.forEach(point => {
        const candle = visionAnalysis.candles.find(item => item.id === point.candleId);
        const x = (candle?.x ?? 0) + (candle?.width ?? 0) / 2;
        context.fillStyle = "#facc15";
        context.fillText(point.label, x + 4, point.y + (point.type === "HIGH" ? -6 : 14));
      });
    }
  }, [captureStatus?.frameCount, visionAnalysis]);

  // ─── Deep scan scheduler (automatic trigger near 46s) ────────────────────
  const startSignalLoop = useCallback(() => {
    if (analysisInterval.current) clearInterval(analysisInterval.current);
    analysisInterval.current = setInterval(async () => {
      if (!isAnalyzingRef.current) return;
      if (executionTimer.isLocked) return;
      if (timerSecondsRef.current <= 46 && timerSecondsRef.current >= 44) {
        void deepScanFnRef.current?.(false);
      }
    }, 2000);
  }, []);

  const stopSignalLoop = useCallback(() => {
    if (analysisInterval.current) { clearInterval(analysisInterval.current); analysisInterval.current = null; }
  }, []);

  const releasePendingSignal = useCallback(() => {
    const pending = pendingSignalRef.current;
    if (!pending || pending.signal === "WAIT" || executionTimer.isLocked) return;
    if (!isEntryWindow(tfRef.current)) return;

    pendingSignalRef.current = null;
    pendingCandleRef.current = null;
    setSignal(pending);
    setDeepScanMessage(`Released ${pending.signal} in the 00–05s OTC entry window.`);

    if (pending.currentSequence && pending.currentSequence !== "—") {
      lastCandlesRef.current = pending.currentSequence.split("").reverse().map(c => ({
        type: c === "G" ? "GREEN" as const : "RED" as const,
      }));
    }

    if (pending.signal !== prevSignalRef.current && pending.confidence >= 45) {
      const displayName = pending.isMemoryRecall
        ? `Memory Recall [${pending.matchedSequence}]`
        : pending.patternName;
      speak(buildSignalMessage(pending.signal, pending.confidence, displayName, langRef.current));
      prevSignalRef.current = pending.signal;
      executionTimer.startSignal(pending.signal, tfRef.current, () => {
        speak(langRef.current === "hi"
          ? "कूलडाउन खत्म। अगला सिग्नल तैयार।"
          : "Cooldown complete. Ready for the next OTC signal.");
        prevSignalRef.current = "WAIT";
      });
    }
  }, [speak]);

  const runDeepScan = useCallback(async (manual: boolean) => {
    if (!isAnalyzingRef.current) {
      setDeepScanMessage("Start live screen sharing before running a deep scan.");
      return;
    }
    if (executionTimer.isLocked) {
      setDeepScanMessage("Deep scan paused during the active trade/cooldown lock.");
      return;
    }

    const key = candleKey(tfRef.current);
    if (!manual && lastDeepScanCandleRef.current === key) return;
    lastDeepScanCandleRef.current = key;
    setIsDeepScanning(true);
    setDeepScanMessage(manual ? "Manual 46s deep OTC scan running…" : "Automatic 46s deep OTC scan running…");

    try {
      const candidate = await generateDecisionEngineSignal(
        assetRef.current,
        tfRef.current,
        "otc",
        observationStart.current,
        timerSecondsRef.current,
        visionAnalysisRef.current
          ? {
              signal: visionAnalysisRef.current.signal,
              confidence: visionAnalysisRef.current.confidence,
              reasoning: visionAnalysisRef.current.reasoning,
              patternName: visionAnalysisRef.current.patternName,
              sequence: visionAnalysisRef.current.sequence,
              price: visionAnalysisRef.current.price,
              reverse: visionAnalysisRef.current.advanced.reverse,
            }
          : undefined,
      );
      pendingSignalRef.current = candidate;
      pendingCandleRef.current = key;

      if (candidate.signal === "WAIT") {
        setDeepScanMessage(`Deep scan found a doji/flat condition — no entry pending.`);
      } else {
        setDeepScanMessage(`Pending ${candidate.signal} · ${candidate.confidence}% · releases at 00–05s.`);
        if (isEntryWindow(tfRef.current)) releasePendingSignal();
      }
    } catch (error) {
      pendingSignalRef.current = null;
      setDeepScanMessage(error instanceof Error ? `Deep scan failed: ${error.message}` : "Deep scan failed.");
    } finally {
      setIsDeepScanning(false);
    }
  }, [releasePendingSignal]);

  deepScanFnRef.current = runDeepScan;
  releasePendingRef.current = releasePendingSignal;

  // ─── Candle timer ────────────────────────────────────────────────────────
  const subscribeToTimer = useCallback((tf: 1 | 5) => {
    if (timerUnsubRef.current) timerUnsubRef.current();
    timerAlertedRef.current = false;
    timerUnsubRef.current = candleTimerService.subscribe(tf, (state) => {
      setTimerState(state);
      timerSecondsRef.current = state.secondsRemaining;
      if (state.secondsRemaining <= 46 && state.secondsRemaining >= 44) {
        void deepScanFnRef.current?.(false);
      }
      if (isEntryWindow(tf)) {
        releasePendingRef.current?.();
      }
      if (state.isAtClose && !timerAlertedRef.current && isAnalyzingRef.current) {
        timerAlertedRef.current = true;
        setSignal(prev => {
          if (prev && prev.signal !== "WAIT") {
            speak(buildTimerMessage(state.secondsRemaining, prev.signal as "CALL" | "PUT", langRef.current));
          }
          return prev;
        });
      }
      if (!state.isAtClose) timerAlertedRef.current = false;
    });
  }, [speak]);

  // ─── Subscriptions ───────────────────────────────────────────────────────
  useEffect(() => {
    const engine = new ScreenVisionEngine();
    visionEngineRef.current = engine;
    let cancelled = false;

    void engine.initialize().then(() => {
      if (!cancelled) setVisionReady(true);
    });

    return () => {
      cancelled = true;
      void engine.dispose();
      visionEngineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const unsub = screenCaptureController.subscribe(s => {
      setCaptureStatus(s);
      if (s.viewport) setViewportAnalysis(s.viewport);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    execUnsubRef.current = executionTimer.subscribe(setExecState);
    return () => { execUnsubRef.current?.(); };
  }, []);

  useEffect(() => {
    const unsub = voiceController.subscribe((event) => {
      if (event.type !== "result" || !event.isFinal || !event.transcript) return;
      const { intent, lang } = parseVoiceIntent(event.transcript);
      setActiveLang(lang);
      langRef.current = lang;
      addVoiceLog(event.transcript, "in", lang);
      memoryBuffer.add({ type: "voice_command", content: event.transcript, tags: ["voice", lang] });
      setMemoryCount(memoryBuffer.size());

      if (intent === "win") {
        const lastSig = signal;
        if (lastSig && lastSig.signal !== "WAIT") {
          patternLearning.recordOutcome(lastSig.patternName, lastSig.signal, assetRef.current, tfRef.current, "win");
          // Record the candle sequence outcome for memory learning
          if (lastCandlesRef.current.length >= 4) {
            sequenceMemory.recordOutcome(lastCandlesRef.current, lastSig.signal as "CALL" | "PUT", "win");
            setLearnedSequences(sequenceMemory.getLearnedSequences());
          }
          visionEngineRef.current?.recordOutcome(
            lastSig.signal as "CALL" | "PUT",
            "WIN",
            visionAnalysisRef.current?.price ?? null,
          );
        }
        memoryBuffer.add({ type: "signal_result", content: `Win on ${assetRef.current}`, asset: assetRef.current, timeframe: tfRef.current, outcome: "win", tags: [] });
        setWinRate(memoryBuffer.getWinRate());
        setFailureNote(null);
        speak(buildWinMessage(lang));

      } else if (intent === "loss") {
        const lastSig = signal;
        if (lastSig && lastSig.signal !== "WAIT") {
          patternLearning.recordOutcome(lastSig.patternName, lastSig.signal, assetRef.current, tfRef.current, "loss");
          // Record sequence outcome
          if (lastCandlesRef.current.length >= 4) {
            sequenceMemory.recordOutcome(lastCandlesRef.current, lastSig.signal as "CALL" | "PUT", "loss");
            setLearnedSequences(sequenceMemory.getLearnedSequences());
          }
          visionEngineRef.current?.recordOutcome(
            lastSig.signal as "CALL" | "PUT",
            "LOSS",
            visionAnalysisRef.current?.price ?? null,
          );
          recordPatternFailure(lastSig.patternName, assetRef.current, []);
          const fa = getLastFailureAnalysis();
          if (fa) {
            setFailureNote(`⚠️ ${fa.reason} → ${fa.adjustment}`);
            speak(lang === "hi" ? "समझ गया। अगली बार सुधार होगा।" : "Noted. Adjusting next signal logic.");
          }
        }
        memoryBuffer.add({ type: "signal_result", content: `Loss on ${assetRef.current}`, asset: assetRef.current, timeframe: tfRef.current, outcome: "loss", tags: [] });
        memoryBuffer.add({ type: "mistake", content: `Avoid: ${assetRef.current} ${tfRef.current}m`, asset: assetRef.current, tags: ["mistake"] });
        setWinRate(memoryBuffer.getWinRate());
        speak(buildLossMessage(lang));
      }
    });
    return () => unsub();
  }, [signal]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setMemoryCount(memoryBuffer.size());
    setWinRate(memoryBuffer.getWinRate());
    subscribeToTimer(selectedTimeframe);
    return () => {
      stopSignalLoop(); stopViewportLoop(); stopVisionLoop();
      if (timerUnsubRef.current) timerUnsubRef.current();
      if (execUnsubRef.current) execUnsubRef.current();
      executionTimer.reset();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { subscribeToTimer(selectedTimeframe); }, [selectedTimeframe, subscribeToTimer]);

  // ─── Handlers ────────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    observationStart.current = Date.now();
    screenCaptureController.setMode("OTC");
    const ok = await screenCaptureController.initializeScreenCapture();
    if (ok) {
      setIsAnalyzing(true);
      isAnalyzingRef.current = true;
      prevSignalRef.current = "WAIT";
      executionTimer.reset();
      visionEngineRef.current?.resetSession();
      setVisionAnalysis(null);
      pendingSignalRef.current = null;
      pendingCandleRef.current = null;
      lastDeepScanCandleRef.current = null;
      setDeepScanMessage("Automatic OTC scan arms at 46s.");
      startSignalLoop();
      startViewportLoop();
      startVisionLoop();
      speak(buildAnalysisStartMessage(assetRef.current, tfRef.current, langRef.current));
    }
  }, [startSignalLoop, startViewportLoop, startVisionLoop, speak]);

  const handleStop = useCallback(() => {
    screenCaptureController.stopScreenCapture();
    stopSignalLoop(); stopViewportLoop(); stopVisionLoop();
    executionTimer.reset();
    setIsAnalyzing(false);
    isAnalyzingRef.current = false;
    setSignal(null);
    setVisionAnalysis(null);
    pendingSignalRef.current = null;
    pendingCandleRef.current = null;
    lastDeepScanCandleRef.current = null;
    setIsDeepScanning(false);
    setDeepScanMessage("Automatic OTC scan arms at 46s.");
    prevSignalRef.current = "WAIT";
  }, [stopSignalLoop, stopViewportLoop, stopVisionLoop]);

  const toggleVoice = useCallback(() => {
    if (isVoiceMonitorOn) {
      voiceController.stopListening(); voiceController.stopSpeaking();
      setIsVoiceMonitorOn(false);
    } else {
      const ok = voiceController.startListening();
      setIsVoiceMonitorOn(ok);
      if (ok) addVoiceLog(activeLang === "hi" ? "वॉयस मॉनिटर चालू..." : "Voice monitor ON...", "out");
    }
  }, [isVoiceMonitorOn, activeLang, addVoiceLog]);

  // ─── Derived state ───────────────────────────────────────────────────────
  const currentSignal: SignalType = (signal?.signal as SignalType) || "WAIT";
  const phase = execState?.phase ?? "IDLE";
  const isCandleSyncReady = signal?.candleSyncBlocked === false;
  const isStreamActive = captureStatus?.isStreamActive ?? false;
  const isMemoryRecall = signal?.isMemoryRecall === true;
  const isStrictCooldown = execState?.isStrictCooldown === true;

  const glowDir: "UP" | "DOWN" | null =
    (currentSignal === "CALL" && phase !== "COOLDOWN") ? "UP" :
    (currentSignal === "PUT"  && phase !== "COOLDOWN") ? "DOWN" :
    viewportSignal.dir;

  return (
    <div className="min-h-screen bg-[#0a0a14] text-white p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">

        {/* ── LIVE VIEWPORT BANNER ─────────────────────────────────────────── */}
        {isStreamActive && (
          <div className={`relative overflow-hidden rounded-2xl border-2 p-5 transition-all ${
            viewportSignal.dir === "UP"   ? "border-green-500/70 bg-green-500/5 shadow-[0_0_30px_rgba(34,197,94,0.2)]" :
            viewportSignal.dir === "DOWN" ? "border-red-500/70 bg-red-500/5 shadow-[0_0_30px_rgba(239,68,68,0.2)]" :
                                            "border-cyan-500/50 bg-cyan-500/5"
          }`}>
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-pulse" />
            <div className="flex items-center gap-3 flex-wrap">
              <span className="w-3 h-3 rounded-full bg-cyan-400 animate-ping flex-shrink-0" />
              <span className="font-black text-cyan-400 text-sm tracking-widest uppercase">
                AI LIVE SCREEN SHARING: ANALYZING VIEWPORT
              </span>
              <span className="ml-auto text-xs font-mono text-gray-500">{captureStatus?.frameCount ?? 0} frames</span>
            </div>
            {viewportSignal.dir ? (
              <div className="mt-4 flex items-center gap-6">
                <div className={`text-4xl font-black flex items-center gap-3 ${viewportSignal.dir === "UP" ? "text-green-400" : "text-red-400"}`}>
                  {viewportSignal.dir === "UP"
                    ? <><TrendingUp className="w-10 h-10" />CALL (UP) NOW</>
                    : <><TrendingDown className="w-10 h-10" />PUT (DOWN) NOW</>}
                </div>
                <div className="ml-auto text-center">
                  <div className={`text-3xl font-black ${viewportSignal.dir === "UP" ? "text-green-400" : "text-red-400"}`}>
                    {viewportSignal.accuracy}%
                  </div>
                  <div className="text-xs text-gray-500">Viewport Accuracy</div>
                </div>
              </div>
            ) : (
              <div className="mt-2 text-sm text-cyan-400/60 font-mono animate-pulse">Scanning viewport for directional signals...</div>
            )}
          </div>
        )}

        {/* ── HIGHER / LOWER PREDICTIVE BUTTONS ───────────────────────────── */}
        {isStreamActive && (
          <div className="grid grid-cols-2 gap-4">
            <button className={`relative overflow-hidden rounded-2xl py-6 text-center font-black text-xl transition-all duration-300 border-2 ${
              glowDir === "UP"
                ? "border-green-400 bg-green-500/15 text-green-300 shadow-[0_0_40px_rgba(34,197,94,0.5),inset_0_0_30px_rgba(34,197,94,0.1)] scale-[1.02] animate-pulse"
                : "border-white/10 bg-[#12121f] text-gray-500"
            }`}>
              {glowDir === "UP" && <span className="absolute inset-0 rounded-2xl border-2 border-green-400 animate-ping opacity-20" />}
              <TrendingUp className="w-7 h-7 mx-auto mb-1" />
              HIGHER ↑
              {glowDir === "UP" && <div className="text-sm font-normal mt-1 text-green-400/80">{viewportSignal.accuracy > 0 ? `${viewportSignal.accuracy}% UP` : "CALL Active"}</div>}
            </button>
            <button className={`relative overflow-hidden rounded-2xl py-6 text-center font-black text-xl transition-all duration-300 border-2 ${
              glowDir === "DOWN"
                ? "border-red-400 bg-red-500/15 text-red-300 shadow-[0_0_40px_rgba(239,68,68,0.5),inset_0_0_30px_rgba(239,68,68,0.1)] scale-[1.02] animate-pulse"
                : "border-white/10 bg-[#12121f] text-gray-500"
            }`}>
              {glowDir === "DOWN" && <span className="absolute inset-0 rounded-2xl border-2 border-red-400 animate-ping opacity-20" />}
              <TrendingDown className="w-7 h-7 mx-auto mb-1" />
              LOWER ↓
              {glowDir === "DOWN" && <div className="text-sm font-normal mt-1 text-red-400/80">{viewportSignal.accuracy > 0 ? `${viewportSignal.accuracy}% DOWN` : "PUT Active"}</div>}
            </button>
          </div>
        )}

        {/* Header */}
        <header className="flex justify-between items-center bg-[#12121f] p-5 rounded-2xl border border-white/5">
          <div>
            <h1 className="text-xl font-black flex items-center gap-2">
              <Activity className="text-pink-500 w-5 h-5" />
              YODHA X — TRADING ARENA · OTC
            </h1>
            <p className="text-gray-500 text-xs mt-0.5">
               2R-1G-2R Core · 46s Deep Scan · 00–05s Entry · Strict {selectedTimeframe === 1 ? "60s" : "5m"} Cooldown
              {activeLang === "hi" && <span className="ml-2 text-pink-400/70">· हिंदी</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isStreamActive && (
              <span className="flex items-center gap-1.5 text-xs text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-1 rounded-full">
                <Eye className="w-3 h-3" /> VIEWPORT
              </span>
            )}
            {isAnalyzing && (
              <span className="flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-1.5 rounded-full animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />LIVE
              </span>
            )}
          </div>
        </header>

        {/* Failure Analysis */}
        {failureNote && (
          <div className="bg-[#12121f] border border-orange-500/30 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-xs font-bold text-orange-400 mb-1">Adaptive Failure Analysis</div>
              <p className="text-xs text-gray-400 leading-relaxed">{failureNote}</p>
            </div>
            <button onClick={() => setFailureNote(null)} className="text-gray-600 hover:text-gray-400 text-lg leading-none flex-shrink-0">×</button>
          </div>
        )}

        {/* Execution Timer — STRICT 60s FREEZE banner */}
        {execState && phase !== "IDLE" && (
          <div className={`rounded-2xl border-2 p-4 transition-all ${
            phase === "ACTIVE"
              ? (currentSignal === "CALL" ? "border-green-500/60 bg-green-500/5" : "border-red-500/60 bg-red-500/5")
              : isStrictCooldown
              ? "border-orange-500/60 bg-orange-500/5"
              : "border-yellow-500/50 bg-yellow-500/5"
          }`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                {phase === "ACTIVE" ? (
                  <>
                    <span className={`w-3 h-3 rounded-full animate-pulse ${currentSignal === "CALL" ? "bg-green-400" : "bg-red-400"}`} />
                    <span className={`font-black text-lg tracking-wide ${currentSignal === "CALL" ? "text-green-400" : "text-red-400"}`}>
                      SIGNAL ACTIVE — {execState.signal}
                    </span>
                  </>
                ) : (
                  <>
                    <Shield className={`w-5 h-5 animate-pulse ${isStrictCooldown ? "text-orange-400" : "text-yellow-400"}`} />
                    <span className={`font-black text-lg tracking-wide ${isStrictCooldown ? "text-orange-400" : "text-yellow-400"}`}>
                      {isStrictCooldown ? "⏸ STRICT 60s FREEZE" : "COOLING DOWN..."}
                    </span>
                    {isStrictCooldown && (
                      <span className="text-xs text-gray-500 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full">
                        Signal generator paused — no overlaps
                      </span>
                    )}
                  </>
                )}
              </div>
              <span className={`font-black text-2xl font-mono ${
                phase === "ACTIVE" ? (currentSignal === "CALL" ? "text-green-400" : "text-red-400")
                : isStrictCooldown ? "text-orange-400" : "text-yellow-400"
              }`}>{execState.formattedTime}</span>
            </div>
            <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-1000 ${
                phase === "ACTIVE" ? (currentSignal === "CALL" ? "bg-green-400" : "bg-red-400")
                : isStrictCooldown ? "bg-orange-400" : "bg-yellow-400"
              }`} style={{ width: `${execState.progressPercent}%` }} />
            </div>
            <div className="mt-1.5 text-xs text-gray-600 font-mono">
              {phase === "ACTIVE"
                ? `${selectedTimeframe}m trade in progress · ${execState.secondsRemaining}s remaining`
                : isStrictCooldown
                ? `Strict 60s freeze · ${execState.secondsRemaining}s · Signal engine completely paused`
                : `${selectedTimeframe === 1 ? "60s" : "5m"} cooldown · ${execState.secondsRemaining}s remaining`}
            </div>
          </div>
        )}

        {/* Candle Timer + Searching Status */}
        {timerState && (
          <div className={`bg-[#12121f] border rounded-2xl p-4 transition-all ${timerState.isAtClose ? "border-yellow-500/40 bg-yellow-500/5" : "border-white/5"}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Clock className={`w-4 h-4 flex-shrink-0 ${timerState.isAtClose ? "text-yellow-400 animate-pulse" : "text-gray-500"}`} />
                  <span className="text-sm font-medium text-gray-300">{selectedTimeframe}m Candle</span>
                  {timerState.isAtClose && <span className="text-xs text-yellow-400 animate-pulse">⚠️ Closing!</span>}
                  {/* Live sequence display */}
                  {signal?.currentSequence && signal.currentSequence !== "—" && (
                    <span className="text-xs font-mono bg-white/5 px-2 py-0.5 rounded-full text-gray-500">
                      [{signal.currentSequence}]
                    </span>
                  )}
                </div>
                {isAnalyzing && signal?.searchingStatus && (
                  <div className={`text-[11px] font-mono mt-0.5 truncate pl-6 ${
                    isMemoryRecall ? "text-purple-400" :
                    isCandleSyncReady ? "text-cyan-400" : "text-gray-600"
                  }`}>
                    <Search className="w-2.5 h-2.5 inline mr-1 opacity-60" />
                    {signal.searchingStatus}
                  </div>
                )}
              </div>
              <span className={`font-black text-xl font-mono flex-shrink-0 ${timerState.isAtClose ? "text-yellow-400" : "text-white"}`}>
                {timerState.formattedTime}
              </span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-1000 ${
                timerState.isAtClose ? "bg-yellow-400" :
                isCandleSyncReady ? "bg-cyan-400" :
                "bg-gradient-to-r from-pink-500 to-purple-500"
              }`} style={{ width: `${timerState.progressPercent}%` }} />
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="relative">
            <button onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="w-full bg-[#12121f] border border-white/10 p-3.5 rounded-xl flex justify-between items-center text-sm font-medium hover:border-pink-500/30 transition-colors">
              <span>{selectedAsset}</span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`} />
            </button>
            {isDropdownOpen && (
              <div className="absolute w-full mt-2 bg-[#1a1a2e] border border-white/10 rounded-xl z-20 shadow-2xl max-h-64 overflow-y-auto">
                {OTC_ASSETS.map(asset => (
                  <button key={asset} onClick={() => { setSelectedAsset(asset); setIsDropdownOpen(false); }}
                    className={`block w-full px-4 py-2.5 text-left text-sm hover:bg-pink-500/10 transition-colors ${asset === selectedAsset ? "text-pink-400" : "text-gray-300"}`}>
                    {asset}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {([1, 5] as const).map(t => (
              <button key={t} onClick={() => setSelectedTimeframe(t)}
                className={`flex-1 rounded-xl py-3.5 font-bold text-sm transition-all ${selectedTimeframe === t ? "bg-pink-500/20 border border-pink-500/40 text-pink-400" : "bg-[#12121f] border border-white/10 text-gray-400"}`}>
                {t}m {t === 1 ? "(60s freeze)" : "(5m CD)"}
              </button>
            ))}
          </div>
          <button onClick={() => isAnalyzing ? handleStop() : handleStart()}
            className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
              isAnalyzing
                ? "bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30"
                : "bg-gradient-to-r from-cyan-500 to-pink-600 text-white shadow-lg shadow-cyan-500/20"
            }`}>
            <Monitor className="w-4 h-4" />
            {isAnalyzing ? "Stop Live Screen" : "START LIVE SCREEN SHARING"}
          </button>
          <button
            onClick={() => void runDeepScan(true)}
            disabled={!isAnalyzing || isDeepScanning}
            className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
              isDeepScanning
                ? "bg-yellow-500/20 border border-yellow-500/40 text-yellow-300"
                : "bg-[#12121f] border border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/10"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <Loader2 className={`w-4 h-4 ${isDeepScanning ? "animate-spin" : ""}`} />
            {isDeepScanning ? "SCANNING 46s…" : "FORCE MANUAL 46s SCAN"}
          </button>
        </div>
        <div className="flex items-center gap-2 px-1 text-xs font-mono text-gray-500">
          {isDeepScanning && <Loader2 className="w-3.5 h-3.5 text-yellow-300 animate-spin flex-shrink-0" />}
          <span>{deepScanMessage}</span>
          {pendingSignalRef.current && pendingSignalRef.current.signal !== "WAIT" && (
            <span className="text-yellow-300">
              · Pending {pendingSignalRef.current.signal} until candle transition
            </span>
          )}
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">

            {/* Decision Engine Signal Box */}
            <div className={`rounded-2xl border-2 p-6 transition-all bg-[#12121f] ${
              isMemoryRecall && currentSignal !== "WAIT"
                ? "border-purple-500/60 shadow-[0_0_20px_rgba(168,85,247,0.2)]"
                : phase === "ACTIVE"
                ? (currentSignal === "CALL" ? "border-green-500/60" : "border-red-500/60")
                : phase === "COOLDOWN" ? "border-orange-500/40"
                 : currentSignal === "CALL" ? "border-green-500/30"
                : currentSignal === "PUT"  ? "border-red-500/30"
                 : isCandleSyncReady ? "border-cyan-500/50"
                : "border-white/10"
            }`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-yellow-400 text-sm flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  {isMemoryRecall ? "SEQUENCE MEMORY RECALL" : "PATTERN ENGINE · 2R-1G-2R CORE"}
                </h3>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {isMemoryRecall && (
                    <span className="text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-1 rounded-full flex items-center gap-1 animate-pulse">
                      <Layers className="w-3 h-3" /> Memory Recall
                    </span>
                  )}
                  {isCandleSyncReady && (
                    <span className="text-xs bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-1 rounded-full animate-pulse flex items-center gap-1">
                      <Target className="w-3 h-3" /> Syncing to Close
                    </span>
                  )}
                  {signal?.levelType && (
                    <span className="text-xs bg-purple-500/20 text-purple-300 border border-purple-500/20 px-2 py-1 rounded-full">
                      {signal.levelType} Level
                    </span>
                  )}
                  {signal?.isStrongLevel && (
                    <span className="text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-500/20 px-2 py-1 rounded-full">
                      50% Strong ✓
                    </span>
                  )}
                </div>
              </div>

              {/* Pattern / sequence name */}
              <div className="mb-3 flex items-center gap-2 p-2 bg-white/5 rounded-lg">
                {isMemoryRecall
                  ? <Layers className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                  : <BookOpen className="w-3.5 h-3.5 text-pink-400 flex-shrink-0" />}
                <span className={`text-xs font-mono font-bold ${
                  isMemoryRecall ? "text-purple-400" :
                  signal?.patternName?.includes("2R-1G-2R") ? "text-cyan-400" : "text-pink-400"
                }`}>
                  {signal?.patternName || "Scanning..."}
                </span>
                {signal?.matchedSequence && (
                  <>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
                    <span className="text-xs text-purple-400/70 font-mono">
                      [{signal.matchedSequence}] · {signal.sequenceOccurrences} occurrences
                    </span>
                  </>
                )}
                {!signal?.matchedSequence && signal?.structureLabel && (
                  <>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
                    <span className="text-xs text-gray-500 truncate">{signal.structureLabel}</span>
                  </>
                )}
              </div>

              {/* Signal display */}
              <div className="flex items-center gap-6 mb-4">
                <div className={`font-black flex items-center ${
                  currentSignal === "CALL" ? (isMemoryRecall ? "text-purple-300" : "text-green-400") :
                   currentSignal === "PUT"  ? (isMemoryRecall ? "text-purple-300" : "text-red-400") :
                   isCandleSyncReady ? "text-cyan-400" : "text-gray-600"
                }`}>
                  {currentSignal === "CALL" && <TrendingUp className="w-12 h-12 mr-2" />}
                  {currentSignal === "PUT"  && <TrendingDown className="w-12 h-12 mr-2" />}
                  {currentSignal === "WAIT" && !isCandleSyncReady && <Clock className="w-10 h-10 mr-2" />}
                  {currentSignal === "WAIT" && isCandleSyncReady && <Target className="w-10 h-10 mr-2" />}
                   <span className="text-5xl">{currentSignal}</span>
                </div>
                 {currentSignal !== "WAIT" && (
                  <div className="flex-1">
                    <div className="text-2xl font-bold mb-1">{signal?.confidence ? `${signal.confidence}%` : "—"}</div>
                    <div className="text-xs text-gray-500 mb-2">{isMemoryRecall ? "Memory Confidence" : "Pattern Confidence"}</div>
                    {(signal?.confidence ?? 0) > 0 && (
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${
                          isMemoryRecall ? "bg-purple-400" :
                          (signal?.confidence ?? 0) >= 80 ? "bg-green-400" :
                          (signal?.confidence ?? 0) >= 60 ? "bg-yellow-400" : "bg-gray-500"
                        }`} style={{ width: `${signal?.confidence ?? 0}%` }} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Reasoning */}
              <div className={`p-3 rounded-xl text-xs font-mono flex items-start gap-2 ${
                isMemoryRecall ? "bg-purple-500/10 border border-purple-500/20" :
                isCandleSyncReady ? "bg-cyan-500/10 border border-cyan-500/20" : "bg-white/5"
              }`}>
                {isMemoryRecall
                  ? <Layers className="w-3.5 h-3.5 text-purple-400 flex-shrink-0 mt-0.5" />
                  : isCandleSyncReady
                  ? <Target className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 mt-0.5" />
                  : currentSignal === "WAIT"
                  ? <Search className="w-3.5 h-3.5 text-gray-500 flex-shrink-0 mt-0.5" />
                  : <Brain className="w-3.5 h-3.5 text-pink-400 flex-shrink-0 mt-0.5" />}
                <span className={isMemoryRecall ? "text-purple-300" : isCandleSyncReady ? "text-cyan-300" : "text-gray-400"}>
                  {signal?.reasoning || "Looking for: [2 Red → 1 Green → 2 Red] + sequence patterns"}
                </span>
              </div>

              {/* Cooldown lock */}
              {phase === "COOLDOWN" && (
                <div className={`mt-3 flex items-center gap-2 p-2 rounded-lg border ${
                  isStrictCooldown
                    ? "bg-orange-500/10 border-orange-500/20"
                    : "bg-yellow-500/10 border-yellow-500/20"
                }`}>
                  <Shield className={`w-3.5 h-3.5 ${isStrictCooldown ? "text-orange-400" : "text-yellow-400"}`} />
                  <span className={`text-xs ${isStrictCooldown ? "text-orange-400" : "text-yellow-400"}`}>
                    {isStrictCooldown
                      ? `⏸ Strict 60s freeze — signal engine paused. ${execState?.secondsRemaining}s remaining.`
                      : `${selectedTimeframe === 1 ? "60s" : "5m"} cooldown — ${execState?.secondsRemaining}s.`}
                  </span>
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Frames",   value: captureStatus?.frameCount || 0,  color: "text-blue-400" },
                { label: "Win Rate", value: `${winRate}%`,                    color: "text-green-400" },
                { label: "Memory",   value: memoryCount,                       color: "text-yellow-400" },
                { label: "TF",       value: `${selectedTimeframe}m`,           color: "text-pink-400" },
              ].map(s => (
                <div key={s.label} className="bg-[#12121f] border border-white/5 p-4 rounded-xl text-center">
                  <div className="text-[10px] text-gray-600 uppercase mb-1">{s.label}</div>
                  <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Voice Log */}
            <div className="bg-[#12121f] border border-white/5 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                  <Radio className="w-4 h-4 text-pink-400" />
                  {activeLang === "hi" ? "वॉयस लॉग" : "Voice Log"}
                </h3>
                <div className="flex gap-2">
                  <button onClick={toggleVoice}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all ${
                      isVoiceMonitorOn ? "border-pink-500/50 bg-pink-500/15 text-pink-400" : "border-white/10 text-gray-500"
                    }`}>
                    {isVoiceMonitorOn ? <><Mic className="w-3.5 h-3.5 animate-pulse" />ON</> : <><MicOff className="w-3.5 h-3.5" />OFF</>}
                  </button>
                  <button onClick={() => setIsMuted(!isMuted)}
                    className={`p-2 rounded-lg border text-xs transition-all ${isMuted ? "border-white/10 text-gray-600" : "border-purple-500/30 bg-purple-500/10 text-purple-400"}`}>
                    {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              {isVoiceMonitorOn && (
                <div className="mb-2 flex items-center gap-2 p-2 bg-pink-500/10 border border-pink-500/20 rounded-lg">
                  <span className="w-2 h-2 rounded-full bg-pink-400 animate-ping" />
                  <span className="text-xs text-pink-400">
                    {activeLang === "hi" ? '"जीत" / "नुकसान" बोलें — sequence memory updates' : '"win" / "loss" — updates sequence memory'}
                  </span>
                </div>
              )}
              <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                {voiceLog.length === 0 ? (
                  <p className="text-gray-600 text-xs font-mono">
                    {activeLang === "hi" ? '"जीत" / "नुकसान" / "कॉल" / "पुट"' : '"win" / "loss" / "call" / "put"'}
                  </p>
                ) : voiceLog.slice().reverse().map(log => (
                  <div key={log.ts} className={`flex items-start gap-2 text-xs font-mono ${log.dir === "in" ? "text-blue-300" : "text-purple-300"}`}>
                    <span className="text-gray-600 flex-shrink-0">{log.dir === "in" ? "YOU" : "AI "}</span>
                    {log.lang && <span className="text-[10px] text-gray-700">[{log.lang.toUpperCase()}]</span>}
                    <span>{log.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Panel */}
          <div className="space-y-4">

            {/* Screen Feed */}
            <div className="bg-[#12121f] border border-white/5 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
                <Monitor className="w-4 h-4 text-pink-400" />Screen Feed
              </h3>
              <div className={`aspect-video rounded-xl border relative overflow-hidden ${isStreamActive ? "border-green-500/20" : "border-white/5"} bg-[#0a0a14]`}>
                {isStreamActive ? (
                  <>
                    <canvas ref={screenCanvasRef} className="w-full h-full object-contain" />
                    <div className="absolute top-2 left-2 flex items-center gap-2 rounded-lg bg-black/65 px-2 py-1 text-[10px] font-mono text-green-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      CAPTURING · {captureStatus?.frameCount ?? 0} frames
                    </div>
                    {visionAnalysis && (
                      <div className="absolute bottom-2 left-2 rounded-lg bg-black/70 px-2 py-1 text-[10px] font-mono text-yellow-300">
                        ZigZag {visionAnalysis.zigzag.length} points · IDs preserved
                      </div>
                    )}
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-center text-gray-600">
                    <div>
                      <Monitor className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <div className="text-xs">Share your Quotex chart tab</div>
                    </div>
                  </div>
                )}
              </div>
              {viewportAnalysis && isStreamActive && (
                <div className="mt-3">
                  <div className="flex justify-between text-[10px] text-gray-600 mb-1">
                    <span className="text-red-400">PUT ({Math.round((1 - viewportAnalysis.ratio) * 100)}%)</span>
                    <span className="text-green-400">CALL ({Math.round(viewportAnalysis.ratio * 100)}%)</span>
                  </div>
                  <div className="h-2 bg-red-500/20 rounded-full overflow-hidden">
                    <div className="h-full bg-green-400/70 rounded-full transition-all duration-500"
                      style={{ width: `${viewportAnalysis.ratio * 100}%` }} />
                  </div>
                </div>
              )}
            </div>

            {/* ── SCREEN CANDLE VISION ──────────────────────────────────────── */}
            {visionAnalysis && (
              <div className={`bg-[#12121f] border rounded-2xl p-5 ${
                visionAnalysis.signal === "CALL"
                  ? "border-green-500/20"
                  : visionAnalysis.signal === "PUT"
                  ? "border-red-500/20"
                  : "border-cyan-500/20"
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-cyan-400 flex items-center gap-2">
                    <Eye className="w-4 h-4" />Screen Candle Vision
                  </h3>
                  <span className={`text-[10px] font-mono ${
                    visionReady ? "text-green-400" : "text-yellow-400"
                  }`}>
                    {visionReady ? "OCR + PIXEL MODEL READY" : "STARTING VISION MODEL"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className={`text-2xl font-black ${
                    visionAnalysis.signal === "CALL" ? "text-green-400" :
                    visionAnalysis.signal === "PUT" ? "text-red-400" : "text-gray-500"
                  }`}>
                    {visionAnalysis.signal}
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black text-white">{visionAnalysis.confidence}%</div>
                    <div className="text-[10px] text-gray-600 uppercase">Vision confidence</div>
                  </div>
                </div>
                {visionAnalysis.sequence !== "—" && (
                  <div className="flex gap-1 mb-3">
                    {visionAnalysis.sequence.split("").map((color, index) => (
                      <div key={`${color}-${index}`} className={`flex-1 h-7 rounded text-[10px] font-black flex items-center justify-center ${
                        color === "G"
                          ? "bg-green-500/25 text-green-400 border border-green-500/30"
                          : "bg-red-500/25 text-red-400 border border-red-500/30"
                      }`}>
                        {color}
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div className="bg-[#0a0a14] rounded-lg p-2">
                    <div className="text-gray-600">OCR price</div>
                    <div className="text-cyan-300">{visionAnalysis.price?.toFixed(5) ?? "—"}</div>
                  </div>
                  <div className="bg-[#0a0a14] rounded-lg p-2">
                    <div className="text-gray-600">Detected candles</div>
                    <div className="text-purple-300">{visionAnalysis.candles.length}</div>
                  </div>
                  <div className="bg-[#0a0a14] rounded-lg p-2">
                    <div className="text-gray-600">Structure</div>
                    <div className="text-yellow-300">{visionAnalysis.structure ?? "Building"}</div>
                  </div>
                  <div className="bg-[#0a0a14] rounded-lg p-2">
                    <div className="text-gray-600">Persistent trades</div>
                    <div className="text-green-300">{visionAnalysis.brain.trades}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2 text-[11px] font-mono">
                  <div className="bg-[#0a0a14] rounded-lg p-2">
                    <div className="text-gray-600">RSI14</div>
                    <div className="text-blue-300">{visionAnalysis.indicators.rsi14?.toFixed(0) ?? "—"}</div>
                  </div>
                  <div className="bg-[#0a0a14] rounded-lg p-2">
                    <div className="text-gray-600">OTC confluence</div>
                    <div className="text-yellow-300">{visionAnalysis.advanced.confluence}/3</div>
                  </div>
                  <div className="bg-[#0a0a14] rounded-lg p-2">
                    <div className="text-gray-600">Trap / reverse</div>
                    <div className={visionAnalysis.advanced.trap || visionAnalysis.advanced.reverse ? "text-orange-300" : "text-gray-500"}>
                      {visionAnalysis.advanced.trap || visionAnalysis.advanced.reverse ? "ACTIVE" : "CLEAR"}
                    </div>
                  </div>
                  <div className="bg-[#0a0a14] rounded-lg p-2">
                    <div className="text-gray-600">7-candle model</div>
                    <div className="text-purple-300">{visionAnalysis.advanced.sequential7 ? "MATCH" : "WATCH"}</div>
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-gray-500 font-mono leading-relaxed">
                  {visionAnalysis.reasoning}
                </p>
              </div>
            )}

            {/* ── SEQUENCE MEMORY LOG ─────────────────────────────────────── */}
            <div className="bg-[#12121f] border border-purple-500/20 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-purple-400 mb-3 flex items-center gap-2">
                <Layers className="w-4 h-4" />Sequence Memory
                <span className="text-xs text-gray-600 font-normal ml-auto">4–5 candle patterns</span>
              </h3>

              {/* Current live sequence */}
              {signal?.currentSequence && signal.currentSequence !== "—" && (
                <div className="mb-3 p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                  <div className="text-[10px] text-gray-500 mb-1">Current sequence (oldest→newest):</div>
                  <div className="flex gap-1">
                    {signal.currentSequence.split("").map((c, i) => (
                      <div key={i} className={`flex-1 h-7 rounded text-[10px] font-black flex items-center justify-center ${
                        c === "G"
                          ? "bg-green-500/30 text-green-400 border border-green-500/30"
                          : "bg-red-500/30 text-red-400 border border-red-500/30"
                      }`}>{c}</div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {learnedSequences.length === 0 ? (
                  <p className="text-xs text-gray-600">No sequences learned yet.<br />Say "win"/"loss" after trades to build memory.</p>
                ) : learnedSequences.map(seq => (
                  <div key={seq.sequence} className={`p-2 rounded-lg border text-xs flex items-center gap-2 ${
                    signal?.matchedSequence === seq.sequence
                      ? "border-purple-500/50 bg-purple-500/10"
                      : "border-white/5 bg-[#0a0a14]"
                  }`}>
                    <span className="font-mono font-black text-purple-300 w-14 flex-shrink-0">[{seq.sequence}]</span>
                    <span className={`font-bold flex-shrink-0 ${seq.bestSignal === "CALL" ? "text-green-400" : "text-red-400"}`}>
                      {seq.bestSignal}
                    </span>
                    <span className={`flex-shrink-0 ${seq.winRate >= 65 ? "text-green-400" : seq.winRate >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                      {seq.winRate}%
                    </span>
                    <span className="text-gray-600 text-[10px] truncate">{seq.occurrences}× seen</span>
                    {signal?.matchedSequence === seq.sequence && (
                      <span className="text-purple-400 text-[10px] ml-auto flex-shrink-0">← MATCH</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Core Pattern Guide */}
            <div className="bg-[#12121f] border border-cyan-500/20 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-cyan-400 mb-3 flex items-center gap-2">
                <Target className="w-4 h-4" />Core: 2R-1G-2R
              </h3>
              <div className="flex items-center gap-1 mb-2">
                {["R","R","G","R","R"].map((c, i) => (
                  <div key={i} className={`flex-1 h-9 rounded flex items-center justify-center text-[9px] font-black ${
                    c === "G" ? "bg-green-500/30 text-green-400 border border-green-500/30" : "bg-red-500/30 text-red-400 border border-red-500/30"
                  }`}>{c}</div>
                ))}
              </div>
              <p className="text-[11px] text-gray-500">
                2R→1G→2R = <span className="text-green-400 font-bold">CALL ↑</span> · Fires in last <span className="text-yellow-400 font-bold">5s</span> of candle.<br />
                After signal: <span className="text-orange-400 font-bold">strict 60s freeze</span> for 1m trades.
              </p>
            </div>

            {/* Memory stats */}
            <div className="bg-[#12121f] border border-white/5 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
                <Database className="w-4 h-4 text-yellow-400" />Adaptive Memory
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-gray-500">Entries</span><span className="text-yellow-400 font-bold">{memoryCount}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Win rate</span><span className="text-green-400 font-bold">{winRate}%</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Sequences</span><span className="text-purple-400 font-bold">{learnedSequences.length}</span></div>
                <div className="h-px bg-white/5 my-1" />
                <div className="text-gray-600 font-mono text-[11px]">{memoryBuffer.getContextSummary().slice(0, 80)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
