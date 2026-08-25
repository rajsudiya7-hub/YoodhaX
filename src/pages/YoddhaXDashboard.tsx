import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { createClient, RealtimeChannel } from "@supabase/supabase-js";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Wifi,
  WifiOff,
  Zap,
  BarChart3,
  Clock,
  Target,
  CandlestickChart,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  BarChart2,
} from "lucide-react";

const SUPABASE_URL = "https://yuentgokdyxnooqktqzs.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1ZW50Z29rZHl4bm9vcWt0cXpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NjgwOTEsImV4cCI6MjA5NTM0NDA5MX0.pRlYBpx1pYeo9jrTjeOhXmhtIeFgBHYgoloms8McgP4";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// INTERFACES
// ============================================

interface PriceTick {
  id: string;
  asset: string;
  price: number;
  timestamp: string;
  created_at: string;
}

interface OHLC {
  id: string;
  asset: string;
  timeframe: number;
  open_price: number;
  high_price: number;
  low_price: number;
  close_price: number;
  candle_type: "GREEN" | "RED";
  candle_start: string;
  candle_end: string;
  tick_count: number;
  created_at: string;
}

interface BridgeStatus {
  is_connected: boolean;
  last_ping: string;
  active_asset: string;
  updated_at: string;
}

interface TradingSignal {
  id: string;
  asset: string;
  signal_type: string;
  price: number;
  confidence: number;
  pattern_detected?: string;
  technical_reason: string;
  patterns_detected?: string[];
  fibonacci_level?: string;
  timeframe: number;
  created_at: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatPrice(price: number): string {
  return price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getPatternIcon(patternName: string): string {
  const icons: Record<string, string> = {
    "DOJI": "⚖",
    "HAMMER": "🔨",
    "INVERTED HAMMER": "🔨",
    "HANGING MAN": "⬇",
    "SHOOTING STAR": "⭐",
    "BULLISH MARUBOZU": "🟢",
    "BEARISH MARUBOZU": "🔴",
    "BULLISH ENGULFING": "📈",
    "BEARISH ENGULFING": "📉",
    "TWEEZER TOP": "⏹",
    "TWEEZER BOTTOM": "⏹",
    "PIERCING LINE": "⚔",
    "DARK CLOUD COVER": "☁",
    "MORNING STAR": "🌟",
    "EVENING STAR": "🌙",
    "THREE WHITE SOLDIERS": "🟢🟢🟢",
    "THREE BLACK CROWS": "🔴🔴🔴",
  };
  return icons[patternName] || "📊";
}

// ============================================
// FIBONACCHI COMPONENT
// ============================================

function FibonacciDisplay({ ohlc }: { ohlc: OHLC[] }) {
  const fibData = useMemo(() => {
    if (ohlc.length < 3) return null;

    const highs = ohlc.map(c => c.high_price);
    const lows = ohlc.map(c => c.low_price);
    const closes = ohlc.map(c => c.close_price);

    const trendHigh = Math.max(...highs);
    const trendLow = Math.min(...lows);
    const range = trendHigh - trendLow;
    const currentPrice = closes[closes.length - 1];

    if (range === 0) return null;

    const levels = [
      { name: "0%", value: trendLow, color: "bg-slate-400" },
      { name: "23.6%", value: trendLow + range * 0.236, color: "bg-amber-400" },
      { name: "38.2%", value: trendLow + range * 0.382, color: "bg-amber-500" },
      { name: "50%", value: trendLow + range * 0.5, color: "bg-orange-400" },
      { name: "61.8%", value: trendLow + range * 0.618, color: "bg-amber-600" },
      { name: "78.6%", value: trendLow + range * 0.786, color: "bg-orange-500" },
      { name: "100%", value: trendHigh, color: "bg-slate-400" },
    ];

    let nearest = levels[0];
    let minDist = Math.abs(currentPrice - levels[0].value);

    for (const level of levels) {
      const dist = Math.abs(currentPrice - level.value);
      if (dist < minDist) {
        minDist = dist;
        nearest = level;
      }
    }

    return { levels, nearest, currentPrice, trendHigh, trendLow, range };
  }, [ohlc]);

  if (!fibData) {
    return (
      <div className="text-center py-8 text-slate-500 text-sm">
        Need more candles for Fibonacci analysis...
      </div>
    );
  }

  const pricePosition = ((fibData.currentPrice - fibData.trendLow) / fibData.range) * 100;

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-400 mb-2">Current position in range: {pricePosition.toFixed(1)}%</div>

      {/* Price position bar */}
      <div className="relative h-6 bg-gradient-to-r from-emerald-400/20 via-amber-400/20 to-red-400/20 rounded-lg border border-white/10">
        {fibData.levels.map((level, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 w-0.5 bg-white/30"
            style={{ left: `${parseFloat(level.name)}%` }}
          />
        ))}
        <div
          className="absolute top-1 bottom-1 w-3 bg-cyan-400 rounded-full shadow-lg shadow-cyan-400/50"
          style={{ left: `calc(${Math.min(100, Math.max(0, pricePosition))}% - 6px)` }}
        />
      </div>

      {/* Fibonacci levels list */}
      <div className="space-y-1.5 mt-4">
        {[...fibData.levels].reverse().map((level, i) => {
          const isNearest = level.name === fibData.nearest.name;
          const distance = Math.abs(fibData.currentPrice - level.value);
          const isClose = distance / fibData.currentPrice < 0.005;

          return (
            <div
              key={i}
              className={`flex items-center justify-between px-3 py-1.5 rounded-lg transition-all ${
                isNearest
                  ? "bg-cyan-400/20 border border-cyan-400/50"
                  : isClose
                  ? "bg-amber-400/10 border border-amber-400/30"
                  : "bg-white/5"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${level.color}`} />
                <span className="text-sm text-white font-medium">{level.name}</span>
                {level.name === "61.8%" && (
                  <span className="text-xs text-amber-400">(Golden)</span>
                )}
              </div>
              <div className="text-right">
                <span className="text-sm font-mono text-white">{formatPrice(level.value)}</span>
                {isNearest && (
                  <span className="ml-2 text-xs text-cyan-400">◀</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// OHLC CANDLE CHART COMPONENT
// ============================================

function CandleChart({ ohlc }: { ohlc: OHLC[] }) {
  if (ohlc.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500 text-sm">
        Waiting for candle data...
      </div>
    );
  }

  const maxHigh = Math.max(...ohlc.map(c => c.high_price));
  const minLow = Math.min(...ohlc.map(c => c.low_price));
  const range = maxHigh - minLow || 1;

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1 h-40 bg-slate-800/20 rounded-lg p-3">
        {ohlc.slice(0, 20).map((candle, idx) => {
          const highPos = ((maxHigh - candle.high_price) / range) * 100;
          const lowPos = ((maxHigh - candle.low_price) / range) * 100;
          const openPos = ((maxHigh - candle.open_price) / range) * 100;
          const closePos = ((maxHigh - candle.close_price) / range) * 100;

          const isGreen = candle.candle_type === "GREEN";
          const barTop = highPos;
          const barBottom = 100 - lowPos;
          const bodyTop = isGreen ? closePos : openPos;
          const bodyBottom = 100 - (isGreen ? openPos : closePos);

          return (
            <div key={candle.id} className="flex-1 relative h-full group">
              {/* High shadow */}
              <div
                className={`absolute w-0.5 mx-auto left-1/2 -translate-x-1/2 ${isGreen ? "bg-emerald-400" : "bg-red-400"}`}
                style={{ top: `${barTop}%`, height: `${bodyTop - barTop}%` }}
              />

              {/* Body */}
              <div
                className={`absolute w-full rounded-sm ${isGreen ? "bg-emerald-400" : "bg-red-400"}`}
                style={{ top: `${bodyTop}%`, height: `${Math.max(2, bodyBottom - bodyTop)}%` }}
              />

              {/* Low shadow */}
              <div
                className={`absolute w-0.5 mx-auto left-1/2 -translate-x-1/2 ${isGreen ? "bg-emerald-400" : "bg-red-400"}`}
                style={{ top: `${100 - bodyBottom}%`, height: `${bodyBottom - (100 - barBottom)}%` }}
              />

              {/* Tooltip on hover */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <div className="bg-slate-800 border border-white/20 rounded-lg p-2 text-xs whitespace-nowrap">
                  <div className={isGreen ? "text-emerald-400" : "text-red-400"}>
                    {candle.candle_type}
                  </div>
                  <div className="text-white">O: {formatPrice(candle.open_price)}</div>
                  <div className="text-white">H: {formatPrice(candle.high_price)}</div>
                  <div className="text-white">L: {formatPrice(candle.low_price)}</div>
                  <div className="text-white">C: {formatPrice(candle.close_price)}</div>
                  <div className="text-slate-400 text-[10px]">{candle.tick_count} ticks</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between text-xs text-slate-400">
        <span>High: {formatPrice(maxHigh)}</span>
        <span>Low: {formatPrice(minLow)}</span>
      </div>
    </div>
  );
}

// ============================================
// PATTERN BADGE COMPONENT
// ============================================

function PatternBadge({ name, type }: { name: string; type: string }) {
  const colors = {
    BULLISH: "bg-emerald-400/20 text-emerald-400 border-emerald-400/50",
    BEARISH: "bg-red-400/20 text-red-400 border-red-400/50",
    NEUTRAL: "bg-slate-400/20 text-slate-400 border-slate-400/50",
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border ${colors[type as keyof typeof colors] || colors.NEUTRAL}`}>
      <span>{getPatternIcon(name)}</span>
      {name}
    </span>
  );
}

// ============================================
// SIGNAL CARD COMPONENT
// ============================================

function SignalCard({ signal }: { signal: TradingSignal }) {
  const isCall = signal.signal_type === "CALL";

  return (
    <div
      className={`p-4 rounded-xl border-2 transition-all ${
        isCall
          ? "bg-emerald-400/10 border-emerald-400/50"
          : "bg-red-400/10 border-red-400/50"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              isCall ? "bg-emerald-400/20" : "bg-red-400/20"
            }`}
          >
            {isCall ? (
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            ) : (
              <TrendingDown className="w-5 h-5 text-red-400" />
            )}
          </div>
          <div>
            <p className={`text-lg font-bold ${isCall ? "text-emerald-400" : "text-red-400"}`}>
              {signal.signal_type}
            </p>
            <p className="text-xs text-slate-400">{signal.asset}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-white font-mono">{formatPrice(signal.price)}</p>
          <p className="text-xs text-slate-400">
            {(signal.confidence * 100).toFixed(0)}% confidence
          </p>
        </div>
      </div>

      {/* Technical reason */}
      <div className="bg-white/5 rounded-lg p-3 mb-3">
        <p className="text-sm text-white font-medium">{signal.technical_reason}</p>
      </div>

      {/* Fibonacci level if detected */}
      {signal.fibonacci_level && (
        <div className="flex items-center gap-2 mb-2 text-xs text-cyan-400">
          <BarChart2 className="w-3 h-3" />
          Fibonacci {signal.fibonacci_level} level tested
        </div>
      )}

      {/* Patterns detected */}
      {signal.patterns_detected && signal.patterns_detected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {signal.patterns_detected.map((pattern, i) => (
            <PatternBadge key={i} name={pattern} type={pattern.includes("BULLISH") || pattern.includes("HAMMER") || pattern.includes("MORNING") ? "BULLISH" : "BEARISH"} />
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
        <span>{signal.timeframe}s timeframe</span>
        <span>{formatTime(signal.created_at)}</span>
      </div>
    </div>
  );
}

// ============================================
// MAIN DASHBOARD COMPONENT
// ============================================

export default function YoddhaXDashboard() {
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus | null>(null);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceTick[]>([]);
  const [ohlc, setOHLC] = useState<OHLC[]>([]);
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [priceDirection, setPriceDirection] = useState<"up" | "down" | "neutral">("neutral");
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [realtimeStatus, setRealtimeStatus] = useState<"subscribing" | "subscribed" | "closed">("subscribing");
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<60 | 300 | 900 | 3600>(60);

  const priceChannelRef = useRef<RealtimeChannel | null>(null);
  const statusChannelRef = useRef<RealtimeChannel | null>(null);
  const signalChannelRef = useRef<RealtimeChannel | null>(null);
  const ohlcChannelRef = useRef<RealtimeChannel | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch all data
  const fetchAllData = useCallback(async () => {
    try {
      // Fetch bridge status
      const { data: statusData } = await supabase
        .from("yoddhax_bridge_status")
        .select("*")
        .eq("id", 1)
        .maybeSingle();

      if (statusData) {
        setBridgeStatus(statusData as BridgeStatus);

        const lastPing = new Date(statusData.last_ping).getTime();
        const now = Date.now();
        const diff = (now - lastPing) / 1000;

        if (statusData.is_connected && diff <= 15) {
          setConnectionStatus("connected");
        } else if (diff > 15) {
          setConnectionStatus("disconnected");
        }
      }

      // Fetch price ticks
      const { data: ticksData } = await supabase
        .from("yoddhax_price_ticks")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(100);

      if (ticksData && ticksData.length > 0) {
        setPriceHistory(ticksData as PriceTick[]);

        const latestPrice = ticksData[0].price;
        setLivePrice((prev) => {
          if (prev !== null && prev !== latestPrice) {
            setPriceDirection(latestPrice > prev ? "up" : latestPrice < prev ? "down" : "neutral");
          }
          return latestPrice;
        });
        setLastUpdateTime(new Date());
      }

      // Fetch OHLC candles for selected timeframe
      const { data: ohlcData } = await supabase
        .from("yoddhax_ohlc_candles")
        .select("*")
        .eq("timeframe", selectedTimeframe)
        .order("candle_start", { ascending: false })
        .limit(20);

      if (ohlcData) {
        setOHLC(ohlcData.reverse() as OHLC[]);
      }

      // Fetch signals
      const { data: signalsData } = await supabase
        .from("yoddhax_signals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);

      if (signalsData) {
        setSignals(signalsData as TradingSignal[]);
      }
    } catch (err) {
      console.error("Error fetching data:", err);
    }
  }, [selectedTimeframe]);

  // Polling setup
  useEffect(() => {
    fetchAllData();
    pollingIntervalRef.current = setInterval(fetchAllData, 2000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [fetchAllData]);

  // Realtime subscriptions
  useEffect(() => {
    priceChannelRef.current = supabase
      .channel("yoddhax-price-ticks-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "yoddhax_price_ticks" },
        (payload) => {
          const newTick = payload.new as PriceTick;
          setPriceHistory((prev) => {
            if (prev.some((t) => t.id === newTick.id)) return prev;
            return [newTick, ...prev.slice(0, 99)];
          });
          setLivePrice((prev) => {
            if (prev !== null) {
              setPriceDirection(newTick.price > prev ? "up" : newTick.price < prev ? "down" : "neutral");
            }
            return newTick.price;
          });
          setLastUpdateTime(new Date());
          setConnectionStatus("connected");
        }
      )
      .subscribe((status) => {
        setRealtimeStatus(status as "subscribing" | "subscribed" | "closed");
      });

    statusChannelRef.current = supabase
      .channel("yoddhax-bridge-status-live")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "yoddhax_bridge_status" },
        (payload) => {
          const newStatus = payload.new as BridgeStatus;
          setBridgeStatus(newStatus);

          const lastPing = new Date(newStatus.last_ping).getTime();
          const now = Date.now();
          const diff = (now - lastPing) / 1000;

          if (newStatus.is_connected && diff <= 15) {
            setConnectionStatus("connected");
          }
        }
      )
      .subscribe();

    signalChannelRef.current = supabase
      .channel("yoddhax-signals-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "yoddhax_signals" },
        (payload) => {
          const newSignal = payload.new as TradingSignal;
          setSignals((prev) => {
            if (prev.some((s) => s.id === newSignal.id)) return prev;
            return [newSignal, ...prev.slice(0, 9)];
          });
        }
      )
      .subscribe();

    ohlcChannelRef.current = supabase
      .channel("yoddhax-ohlc-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "yoddhax_ohlc_candles" },
        () => {
          fetchAllData(); // Refetch on any change
        }
      )
      .subscribe();

    return () => {
      priceChannelRef.current?.unsubscribe();
      statusChannelRef.current?.unsubscribe();
      signalChannelRef.current?.unsubscribe();
      ohlcChannelRef.current?.unsubscribe();
    };
  }, [fetchAllData]);

  // Connection checker
  useEffect(() => {
    const checkConnection = () => {
      if (bridgeStatus?.last_ping) {
        const lastPing = new Date(bridgeStatus.last_ping).getTime();
        const now = Date.now();
        const diff = (now - lastPing) / 1000;

        if (diff > 15) {
          setConnectionStatus("disconnected");
        } else {
          setConnectionStatus("connected");
        }
      }
    };

    const interval = setInterval(checkConnection, 5000);
    return () => clearInterval(interval);
  }, [bridgeStatus]);

  const getStatusColor = () => {
    switch (connectionStatus) {
      case "connected":
        return "text-emerald-400";
      case "disconnected":
        return "text-red-400";
      default:
        return "text-amber-400";
    }
  };

  const getStatusBg = () => {
    switch (connectionStatus) {
      case "connected":
        return "bg-emerald-400/10 border-emerald-400/30";
      case "disconnected":
        return "bg-red-400/10 border-red-400/30";
      default:
        return "bg-amber-400/10 border-amber-400/30";
    }
  };

  const getTimeSinceUpdate = () => {
    if (!lastUpdateTime) return "";
    const diff = Math.floor((Date.now() - lastUpdateTime.getTime()) / 1000);
    if (diff < 5) return "Just now";
    if (diff < 60) return `${diff}s ago`;
    return `${Math.floor(diff / 60)}m ago`;
  };

  const timeframeLabels: Record<number, string> = {
    60: "1m",
    300: "5m",
    900: "15m",
    3600: "1h",
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#0d0d24] to-[#0a0a1a] p-4 md:p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
                <Zap className="w-7 h-7 text-black" />
              </div>
              <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#0d0d24] ${
                connectionStatus === "connected"
                  ? "bg-emerald-400 animate-pulse"
                  : connectionStatus === "disconnected"
                  ? "bg-red-400"
                  : "bg-amber-400"
              }`} />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-400 via-orange-400 to-amber-300 bg-clip-text text-transparent">
                YODDHA X
              </h1>
              <p className="text-slate-400 text-sm">Technical Analysis Engine</p>
            </div>
          </div>

          {/* Connection & Realtime Status */}
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full border backdrop-blur-sm ${getStatusBg()}`}>
              {connectionStatus === "connected" ? (
                <Wifi className={`w-5 h-5 ${getStatusColor()}`} />
              ) : connectionStatus === "disconnected" ? (
                <WifiOff className={`w-5 h-5 ${getStatusColor()}`} />
              ) : (
                <Activity className={`w-5 h-5 ${getStatusColor()} animate-pulse`} />
              )}
              <span className={`font-medium ${getStatusColor()}`}>
                {connectionStatus === "connected"
                  ? "Bridge Connected"
                  : connectionStatus === "disconnected"
                  ? "Bridge Disconnected"
                  : "Connecting..."}
              </span>
            </div>

            <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs ${
              realtimeStatus === "subscribed"
                ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/30"
                : "bg-amber-400/10 text-amber-400 border border-amber-400/30"
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                realtimeStatus === "subscribed" ? "bg-emerald-400" : "bg-amber-400 animate-pulse"
              }`} />
              {realtimeStatus === "subscribed" ? "LIVE" : "SYNCING"}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Price Card */}
        <div className="lg:col-span-2">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl border border-white/10 p-6">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-cyan-500/5 pointer-events-none" />

            <div className="relative">
              {/* Asset Info */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
                    <BarChart3 className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wider">Active Asset</p>
                    <p className="text-xl font-semibold text-white">
                      {bridgeStatus?.active_asset || "EUR/USD"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm">
                    {bridgeStatus?.last_ping ? formatTime(bridgeStatus.last_ping) : "--:--:--"}
                  </span>
                </div>
              </div>

              {/* Price Display */}
              <div className="text-center py-6">
                <p className="text-sm text-slate-400 uppercase tracking-widest mb-2">Live Price</p>
                <div className="flex items-center justify-center gap-3">
                  {priceDirection === "up" && (
                    <ChevronUp className="w-10 h-10 text-emerald-400" />
                  )}
                  {priceDirection === "down" && (
                    <ChevronDown className="w-10 h-10 text-red-400" />
                  )}
                  <span
                    className={`text-5xl md:text-6xl font-bold transition-all duration-300 ${
                      priceDirection === "up"
                        ? "text-emerald-400"
                        : priceDirection === "down"
                        ? "text-red-400"
                        : "text-white"
                    }`}
                  >
                    {livePrice !== null ? formatPrice(livePrice) : "---.---"}
                  </span>
                </div>
                <p className="text-slate-500 text-sm mt-2">
                  {livePrice !== null ? (
                    <span className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-3 h-3" />
                      Updated {getTimeSinceUpdate() || "Just now"}
                    </span>
                  ) : (
                    "Awaiting data..."
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Trading Signals Panel */}
        <div className="lg:col-span-1">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl border border-white/10 p-6 h-full">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5 pointer-events-none" />

            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                  <Target className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-white">AI Signals</p>
                  <p className="text-xs text-slate-400">Technical Analysis</p>
                </div>
              </div>

              {signals.length > 0 ? (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {signals.slice(0, 5).map((signal) => (
                    <SignalCard key={signal.id} signal={signal} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                    <CandlestickChart className="w-8 h-8 text-slate-500" />
                  </div>
                  <p className="text-slate-400 text-sm">No signals generated yet</p>
                  <p className="text-slate-500 text-xs mt-1">
                    Send price data to generate signals
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* OHLC Candle Chart */}
        <div className="lg:col-span-2">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl border border-white/10 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
                  <BarChart2 className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-white">OHLC Candle Chart</p>
                  <p className="text-xs text-slate-400">Real-time candle formation</p>
                </div>
              </div>

              {/* Timeframe selector */}
              <div className="flex items-center gap-1">
                {[60, 300, 900, 3600].map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setSelectedTimeframe(tf as 60 | 300 | 900 | 3600)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      selectedTimeframe === tf
                        ? "bg-amber-400 text-black"
                        : "bg-white/5 text-slate-400 hover:bg-white/10"
                    }`}
                  >
                    {timeframeLabels[tf]}
                  </button>
                ))}
              </div>
            </div>

            <CandleChart ohlc={ohlc} />

            <div className="mt-4 text-xs text-slate-500">
              {ohlc.length} candles · Hover for details
            </div>
          </div>
        </div>

        {/* Fibonacci Levels */}
        <div className="lg:col-span-1">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl border border-white/10 p-6 h-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-lg font-semibold text-white">Fibonacci Levels</p>
                <p className="text-xs text-slate-400">Auto-calculated retracement</p>
              </div>
            </div>

            <FibonacciDisplay ohlc={ohlc} />
          </div>
        </div>

        {/* Price Tick Log */}
        <div className="lg:col-span-3">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl border border-white/10 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-white">Price Tick Log</p>
                  <p className="text-xs text-slate-400">Raw streaming data</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-sm text-slate-400">
                  {priceHistory.length} ticks
                </div>
                <button
                  onClick={fetchAllData}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors text-xs"
                >
                  <RefreshCw className="w-3 h-3" />
                  Refresh
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left text-xs text-slate-400 uppercase tracking-wider py-3 px-4">Time</th>
                    <th className="text-left text-xs text-slate-400 uppercase tracking-wider py-3 px-4">Asset</th>
                    <th className="text-right text-xs text-slate-400 uppercase tracking-wider py-3 px-4">Price</th>
                    <th className="text-right text-xs text-slate-400 uppercase tracking-wider py-3 px-4">Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {priceHistory.slice(0, 10).map((tick, idx) => {
                    const prevTick = priceHistory[idx + 1];
                    const change = prevTick ? tick.price - prevTick.price : 0;
                    const changePercent = prevTick
                      ? ((change / prevTick.price) * 100).toFixed(4)
                      : "0.0000";

                    return (
                      <tr key={tick.id} className="hover:bg-white/5 transition-colors">
                        <td className="py-3 px-4 text-sm text-slate-300 font-mono">
                          {formatTime(tick.timestamp)}
                        </td>
                        <td className="py-3 px-4 text-sm text-white font-medium">
                          {tick.asset}
                        </td>
                        <td className="py-3 px-4 text-sm text-right font-mono text-white">
                          {formatPrice(tick.price)}
                        </td>
                        <td className="py-3 px-4 text-sm text-right">
                          <span className={`${
                            change > 0 ? "text-emerald-400" : change < 0 ? "text-red-400" : "text-slate-400"
                          }`}>
                            {change > 0 ? "+" : ""}
                            {changePercent}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="max-w-7xl mx-auto mt-8 text-center">
        <p className="text-slate-500 text-sm">
          YODDHA X Trading Dashboard - Technical Analysis Engine
        </p>
        <p className="text-slate-600 text-xs mt-1">
          Push data to: {SUPABASE_URL}/functions/v1/yoddhax
        </p>
      </div>
    </div>
  );
}
