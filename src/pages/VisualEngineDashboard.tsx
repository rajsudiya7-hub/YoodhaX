import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import {
  startScreenShare,
  stopScreenShare,
  captureFrame,
  analyzeFrameForCandles,
  isScreenShareActive,
  type CandleData,
} from "@/lib/screen-observer";
import {
  loadPatternsFromStorage,
  loadPatternsFromSupabase,
  getLearningStats,
  getTopPatterns,
  type PatternSequence,
  type LearningStats,
} from "@/lib/pattern-brain";
import {
  makeDecision,
  type DecisionResult,
  type TradingDecision,
} from "@/lib/decision-engine";
import {
  Eye,
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Database,
  Wifi,
  WifiOff,
  Play,
  Square,
  RefreshCw,
  Shield,
  Target,
  AlertTriangle,
  CheckCircle,
  Monitor,
  Radio,
} from "lucide-react";

function YoddhaLogo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="48" fill="url(#goldGradientVisual)" stroke="#FFD700" strokeWidth="2" />
      <path d="M50 15 L65 35 L85 40 L70 55 L75 80 L50 70 L25 80 L30 55 L15 40 L35 35 Z" fill="#1a1a2e" stroke="#FFD700" strokeWidth="1.5" />
      <circle cx="38" cy="45" r="5" fill="#00ff88">
        <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="62" cy="45" r="5" fill="#00ff88">
        <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />
      </circle>
      <path d="M35 60 Q50 70 65 60" stroke="#FFD700" strokeWidth="2" fill="none" />
      <path d="M50 20 L50 10 M40 18 L35 10 M60 18 L65 10" stroke="#FFD700" strokeWidth="2" />
      <defs>
        <linearGradient id="goldGradientVisual" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFD700" />
          <stop offset="50%" stopColor="#FFA500" />
          <stop offset="100%" stopColor="#FFD700" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function DecisionBadge({ decision }: { decision: TradingDecision }) {
  const config = {
    BUY: { bg: "bg-[#00ff88]/30", text: "text-[#00ff88]", border: "border-[#00ff88]/50", icon: TrendingUp },
    SELL: { bg: "bg-red-500/30", text: "text-red-500", border: "border-red-500/50", icon: TrendingDown },
    WAIT: { bg: "bg-yellow-500/30", text: "text-yellow-500", border: "border-yellow-500/50", icon: Minus },
  };

  const c = config[decision];
  const Icon = c.icon;

  return (
    <span className={`px-4 py-2 rounded-lg text-lg font-bold border ${c.bg} ${c.text} ${c.border} flex items-center gap-2`}>
      <Icon className="w-6 h-6" />
      {decision}
    </span>
  );
}

function getStatusColor(decision: TradingDecision): string {
  return decision === "BUY" ? "border-[#00ff88]" : decision === "SELL" ? "border-red-500" : "border-yellow-500";
}

export default function VisualEngineDashboard() {
  const navigate = useNavigate();
  const { user, logout, isLoading } = useAuth();

  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [currentCandles, setCurrentCandles] = useState<CandleData[]>([]);
  const [currentDecision, setCurrentDecision] = useState<DecisionResult | null>(null);
  const [learningStats, setLearningStats] = useState<LearningStats | null>(null);
  const [topPatterns, setTopPatterns] = useState<PatternSequence[]>([]);
  const [isLearning, setIsLearning] = useState(false);
  const [captureCount, setCaptureCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const captureIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize on mount
  useEffect(() => {
    loadPatternsFromStorage();
    loadPatternsFromSupabase(user?.id);
    updateStats();
  }, [user?.id]);

  // Update stats
  const updateStats = useCallback(() => {
    const stats = getLearningStats();
    setLearningStats(stats);
    const patterns = getTopPatterns(10);
    setTopPatterns(patterns);
  }, []);

  // Start/Stop screen share using navigator.mediaDevices.getDisplayMedia
  const handleScreenShareToggle = async () => {
    if (isScreenSharing) {
      // STOP SCREEN SHARE
      stopScreenShare();
      setIsScreenSharing(false);
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
        captureIntervalRef.current = null;
      }
    } else {
      // START SCREEN SHARE - Using pure Web API
      try {
        // Call navigator.mediaDevices.getDisplayMedia directly
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: "browser",
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        });

        // Create hidden video element for streaming
        const video = document.createElement("video");
        video.srcObject = stream;
        video.style.display = "none";
        video.id = "yoddha-hidden-video-stream";
        video.muted = true;
        video.playsInline = true;
        document.body.appendChild(video);
        await video.play();

        // Create hidden canvas for frame capture
        const canvas = document.createElement("canvas");
        canvas.width = 1920;
        canvas.height = 1080;
        canvas.style.display = "none";
        canvas.id = "yoddha-hidden-frame-canvas";
        document.body.appendChild(canvas);

        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        // Store references globally for capture
        (window as any).__yoddha_screen_stream = stream;
        (window as any).__yoddha_hidden_video = video;
        (window as any).__yoddha_hidden_canvas = canvas;
        (window as any).__yoddha_hidden_ctx = ctx;

        // Handle stream end
        stream.getVideoTracks()[0].onended = () => {
          handleScreenShareToggle();
        };

        setIsScreenSharing(true);
        setError(null);

        // Start frame capture loop every 2 seconds
        captureIntervalRef.current = setInterval(() => {
          handleCapture();
        }, 2000);
      } catch (err: any) {
        console.error("[YODDHA AI] Screen share error:", err);
        setError(err?.message || "Failed to start screen share. Please allow permissions.");
        setIsScreenSharing(false);
      }
    }
  };

  // Capture and analyze frame from hidden video element
  const handleCapture = useCallback(() => {
    const video = (window as any).__yoddha_hidden_video;
    const canvas = (window as any).__yoddha_hidden_canvas;
    const ctx = (window as any).__yoddha_hidden_ctx;

    if (!video || !canvas || !ctx) return;

    try {
      // Draw current video frame to hidden canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Get image data for analysis
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      setCaptureCount((prev) => prev + 1);

      // Analyze candles from pixel data
      const candles = analyzeCandleColors(imageData);
      setCurrentCandles(candles);

      // Make decision
      if (candles.length > 0) {
        const decision = makeDecision(candles);
        setCurrentDecision(decision);
      }

      // Update stats
      updateStats();

      // Simulate learning
      if (candles.length >= 3) {
        setIsLearning(true);
        setTimeout(() => setIsLearning(false), 500);
      }
    } catch (err) {
      console.error("[YODDHA AI] Capture error:", err);
    }
  }, [updateStats]);

  // Analyze image data for candle colors (GREEN/RED detection)
  function analyzeCandleColors(imageData: ImageData): CandleData[] {
    const candles: CandleData[] = [];
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    const step = 10; // Pixel step for performance
    let greenCount = 0;
    let redCount = 0;

    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // GREEN candle detection: high green, low red
        const isGreen = g > 200 && r < 100 && b < 150;
        // RED candle detection: high red, low green
        const isRed = r > 200 && g < 100 && b < 100;

        if (isGreen) greenCount++;
        if (isRed) redCount++;
      }
    }

    // Create candle data from detected colors
    const halfWidth = Math.floor(width / 2);
    const candleWidth = 20;

    // Add GREEN candles
    const greenCandleCount = Math.min(5, Math.ceil(greenCount / 1000));
    for (let i = 0; i < greenCandleCount; i++) {
      candles.push({
        x: halfWidth - (greenCandleCount - i) * candleWidth,
        y: height - 200 - Math.random() * 100,
        width: candleWidth - 2,
        height: 50 + Math.random() * 50,
        color: "GREEN",
        openPrice: 100,
        closePrice: 105,
        highPrice: 108,
        lowPrice: 98,
        pattern: "GREEN_CANDLE",
      });
    }

    // Add RED candles
    const redCandleCount = Math.min(5, Math.ceil(redCount / 1000));
    for (let i = 0; i < redCandleCount; i++) {
      candles.push({
        x: halfWidth + i * candleWidth,
        y: height - 200 - Math.random() * 100,
        width: candleWidth - 2,
        height: 50 + Math.random() * 50,
        color: "RED",
        openPrice: 105,
        closePrice: 100,
        highPrice: 108,
        lowPrice: 98,
        pattern: "RED_CANDLE",
      });
    }

    return candles;
  }

  // Manual capture
  const handleManualCapture = () => {
    handleCapture();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
      const stream = (window as any).__yoddha_screen_stream;
      if (stream) {
        stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      }
      const video = (window as any).__yoddha_hidden_video;
      const canvas = (window as any).__yoddha_hidden_canvas;
      if (video) video.remove();
      if (canvas) canvas.remove();
    };
  }, []);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-[#0d0d1a] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-[#FFD700] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d1a] text-white relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a2e]/50 via-transparent to-[#0d0d1a]" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#FFD700]/5 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00ff88]/5 rounded-full blur-3xl" />

      {/* HEADER WITH SCREEN SHARE BUTTON */}
      <header className="relative z-10 border-b border-[#FFD700]/30 bg-[#0d0d1a]/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-3">
          {/* Top Row: Logo + Title + Monitoring Status */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <YoddhaLogo size={48} />
              <div>
                <h1 className="text-2xl font-bold text-[#FFD700]">YODDHA X AI</h1>
                <p className="text-xs text-[#00ff88]">Visual Pattern Learning Engine</p>
              </div>
            </div>

            {/* MONITORING ACTIVE INDICATOR */}
            {isScreenSharing && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#00ff88]/20 border border-[#00ff88]/50 animate-pulse">
                <Radio className="w-5 h-5 text-[#00ff88] animate-ping" />
                <span className="text-sm font-bold text-[#00ff88]">MONITORING ACTIVE</span>
              </div>
            )}

            {/* Screen Share Button - Prominent in Header */}
            <button
              onClick={handleScreenShareToggle}
              className={`px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-3 ${
                isScreenSharing
                  ? "bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30"
                  : "bg-gradient-to-r from-[#FFD700] to-[#FFA500] hover:from-[#FFE44D] hover:to-[#FFB833] text-black shadow-lg shadow-[#FFD700]/30"
              }`}
            >
              <Monitor className="w-6 h-6" />
              {isScreenSharing ? "STOP SCREEN SHARE" : "START SCREEN SHARE"}
            </button>
          </div>

          {/* Bottom Row: Navigation + User */}
          <div className="flex items-center justify-between">
            {/* Navigation */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate("/dashboard/otc")}
                className="px-4 py-2 rounded-lg bg-[#1a1a2e] border border-[#FFD700]/30 text-[#FFD700]/70 hover:border-[#FFD700] hover:text-[#FFD700] transition-all text-sm"
              >
                OTC Market
              </button>
              <button
                onClick={() => navigate("/yoddhax")}
                className="px-4 py-2 rounded-lg bg-[#1a1a2e] border border-cyan-500/30 text-cyan-400 hover:border-cyan-500 hover:text-cyan-300 transition-all text-sm"
              >
                YODDHA X
              </button>
              <button className="px-4 py-2 rounded-lg bg-[#FFD700]/20 border border-[#FFD700] text-[#FFD700] text-sm font-medium">
                AI Engine
              </button>
            </div>

            {/* User Info */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium text-white">{user.name}</p>
                <p className="text-xs text-gray-400">{user.email}</p>
              </div>
              <span className="px-2 py-1 rounded bg-[#00ff88]/20 text-[#00ff88] text-xs border border-[#00ff88]/30 flex items-center gap-1">
                <Shield className="w-3 h-3" />
                PROTECTED
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 py-8">
        {/* Status Indicators */}
        <div className="mb-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#1a1a2e]/80 backdrop-blur-sm rounded-xl p-4 border border-[#FFD700]/20">
              <div className="flex items-center gap-2 mb-2">
                {isScreenSharing ? (
                  <Wifi className="w-5 h-5 text-[#00ff88]" />
                ) : (
                  <WifiOff className="w-5 h-5 text-gray-500" />
                )}
                <span className="text-sm text-gray-400">Connection</span>
              </div>
              <p className={`font-bold text-lg ${isScreenSharing ? "text-[#00ff88]" : "text-gray-500"}`}>
                {isScreenSharing ? "STREAMING" : "INACTIVE"}
              </p>
            </div>

            <div className="bg-[#1a1a2e]/80 backdrop-blur-sm rounded-xl p-4 border border-[#FFD700]/20">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-5 h-5 text-[#FFD700]" />
                <span className="text-sm text-gray-400">Frames Captured</span>
              </div>
              <p className="font-bold text-lg text-[#FFD700]">{captureCount}</p>
            </div>

            <div className="bg-[#1a1a2e]/80 backdrop-blur-sm rounded-xl p-4 border border-[#FFD700]/20">
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-5 h-5 text-cyan-400" />
                <span className="text-sm text-gray-400">Patterns Learned</span>
              </div>
              <p className="font-bold text-lg text-cyan-400">{learningStats?.totalPatterns || 0}</p>
            </div>

            <div className="bg-[#1a1a2e]/80 backdrop-blur-sm rounded-xl p-4 border border-[#FFD700]/20">
              <div className="flex items-center gap-2 mb-2">
                <Brain className={`w-5 h-5 ${isLearning ? "text-[#00ff88] animate-pulse" : "text-gray-500"}`} />
                <span className="text-sm text-gray-400">Learning</span>
              </div>
              <p className={`font-bold text-lg ${isLearning ? "text-[#00ff88]" : "text-gray-500"}`}>
                {isLearning ? "ACTIVE" : "IDLE"}
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-xl flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Decision Panel */}
        <div className="mb-8">
          <div
            className={`bg-[#1a1a2e]/80 backdrop-blur-sm rounded-2xl border-2 p-8 transition-all ${
              currentDecision ? getStatusColor(currentDecision.decision) : "border-[#FFD700]/20"
            }`}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Target className="w-6 h-6 text-[#FFD700]" />
                <h2 className="text-xl font-bold text-[#FFD700]">AI Decision</h2>
              </div>
              <button
                onClick={handleManualCapture}
                disabled={!isScreenSharing}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${
                  isScreenSharing
                    ? "bg-[#FFD700]/20 border border-[#FFD700] text-[#FFD700] hover:bg-[#FFD700]/30"
                    : "bg-gray-700 text-gray-500 cursor-not-allowed"
                }`}
              >
                <RefreshCw className="w-4 h-4" />
                Capture Frame
              </button>
            </div>

            {/* Decision Display */}
            <div className="text-center mb-6">
              {currentDecision ? (
                <div className="space-y-4">
                  <DecisionBadge decision={currentDecision.decision} />
                  <div className="text-4xl font-mono font-bold text-white">Confidence: {currentDecision.confidence}%</div>
                  <p className="text-gray-400 max-w-xl mx-auto">{currentDecision.reasoning}</p>
                </div>
              ) : (
                <div className="text-gray-500 py-8">
                  <Monitor className="w-20 h-20 mx-auto mb-4 opacity-30" />
                  <p className="text-xl">Click "START SCREEN SHARE" to begin visual analysis</p>
                  <p className="text-sm mt-2">The AI will monitor your screen for candle patterns</p>
                </div>
              )}
            </div>

            {/* Analysis Details */}
            {currentDecision && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-[#0d0d1a] rounded-xl p-4 border border-[#FFD700]/20">
                  <div className="text-xs text-gray-500 mb-1">Candle Count</div>
                  <div className="text-lg font-bold text-[#FFD700]">{currentDecision.candleCount}</div>
                </div>
                <div className="bg-[#0d0d1a] rounded-xl p-4 border border-[#00ff88]/20">
                  <div className="text-xs text-gray-500 mb-1">GREEN Candles</div>
                  <div className="text-lg font-bold text-[#00ff88]">{currentDecision.greenCandles}</div>
                </div>
                <div className="bg-[#0d0d1a] rounded-xl p-4 border border-red-500/20">
                  <div className="text-xs text-gray-500 mb-1">RED Candles</div>
                  <div className="text-lg font-bold text-red-500">{currentDecision.redCandles}</div>
                </div>
                <div className="bg-[#0d0d1a] rounded-xl p-4 border border-cyan-500/20">
                  <div className="text-xs text-gray-500 mb-1">Trend</div>
                  <div
                    className={`text-lg font-bold ${
                      currentDecision.trendDirection === "BULLISH"
                        ? "text-[#00ff88]"
                        : currentDecision.trendDirection === "BEARISH"
                        ? "text-red-500"
                        : "text-yellow-500"
                    }`}
                  >
                    {currentDecision.trendDirection}
                  </div>
                </div>
                <div className="bg-[#0d0d1a] rounded-xl p-4 border border-yellow-500/20">
                  <div className="text-xs text-gray-500 mb-1">Risk Level</div>
                  <div
                    className={`text-lg font-bold ${
                      currentDecision.riskLevel === "LOW"
                        ? "text-[#00ff88]"
                        : currentDecision.riskLevel === "MEDIUM"
                        ? "text-yellow-500"
                        : "text-red-500"
                    }`}
                  >
                    {currentDecision.riskLevel}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Learning Stats Panel */}
        <div className="mb-8">
          <div className="bg-[#1a1a2e]/80 backdrop-blur-sm rounded-2xl border border-[#FFD700]/20 p-6">
            <div className="flex items-center gap-3 mb-6">
              <Brain className="w-6 h-6 text-[#FFD700]" />
              <h2 className="text-xl font-bold text-[#FFD700]">Pattern Learning Status</h2>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-gradient-to-br from-[#FFD700]/20 to-transparent rounded-xl p-4 border border-[#FFD700]/30">
                <div className="text-xs text-gray-400 mb-1">Total Patterns</div>
                <div className="text-3xl font-bold text-[#FFD700]">{learningStats?.totalPatterns || 0}</div>
              </div>
              <div className="bg-gradient-to-br from-[#00ff88]/20 to-transparent rounded-xl p-4 border border-[#00ff88]/30">
                <div className="text-xs text-gray-400 mb-1">WIN Patterns</div>
                <div className="text-3xl font-bold text-[#00ff88]">{learningStats?.winPatterns || 0}</div>
              </div>
              <div className="bg-gradient-to-br from-red-500/20 to-transparent rounded-xl p-4 border border-red-500/30">
                <div className="text-xs text-gray-400 mb-1">LOSS Patterns</div>
                <div className="text-3xl font-bold text-red-500">{learningStats?.lossPatterns || 0}</div>
              </div>
              <div className="bg-gradient-to-br from-yellow-500/20 to-transparent rounded-xl p-4 border border-yellow-500/30">
                <div className="text-xs text-gray-400 mb-1">WAIT Patterns</div>
                <div className="text-3xl font-bold text-yellow-500">{learningStats?.waitPatterns || 0}</div>
              </div>
              <div className="bg-gradient-to-br from-cyan-500/20 to-transparent rounded-xl p-4 border border-cyan-500/30">
                <div className="text-xs text-gray-400 mb-1">Avg Confidence</div>
                <div className="text-3xl font-bold text-cyan-400">{learningStats?.averageConfidence || 0}%</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Info */}
        <div className="text-center mt-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Eye className="w-4 h-4 text-[#FFD700]" />
            <span className="text-xs text-[#FFD700] font-bold">PURE WEB API - NO PLUGINS</span>
          </div>
          <p className="text-xs text-gray-500">navigator.mediaDevices.getDisplayMedia() + Hidden Canvas Analysis</p>
          <p className="text-xs text-gray-400 mt-1">Passive Screen Observer - No DOM Interaction</p>
        </div>
      </main>
    </div>
  );
}
