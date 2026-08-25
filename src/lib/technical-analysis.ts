// Technical Analysis Engine for YODDHA X
// OHLC Construction, Candlestick Patterns, Fibonacci Analysis

export interface Tick {
  price: number;
  timestamp: string | number;
  asset: string;
}

export interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
  timestamp: number;
  asset: string;
  candleType: "GREEN" | "RED";
  volume?: number;
}

export interface FibonacciLevels {
  level0: number;      // 0%
  level236: number;    // 23.6%
  level382: number;    // 38.2%
  level500: number;    // 50%
  level618: number;    // 61.8%
  level786: number;    // 78.6%
  level1000: number;   // 100%
  trendHigh: number;
  trendLow: number;
  trend: "UP" | "DOWN";
}

export interface CandlePattern {
  name: string;
  type: "BULLISH" | "BEARISH" | "NEUTRAL";
  confidence: number;
  description: string;
  candle: OHLC;
}

export interface TradingSignal {
  id: string;
  asset: string;
  signalType: "CALL" | "PUT" | "HOLD";
  price: number;
  confidence: number;
  technicalReason: string;
  patterns: CandlePattern[];
  fibonacciLevel?: string;
  timestamp: number;
  timeframe: number;
}

// ============================================
// OHLC CANDLE CONSTRUCTION
// ============================================

export function constructOHLCFromTicks(
  ticks: Tick[],
  timeframeMinutes: number = 1
): OHLC[] {
  if (ticks.length === 0) return [];

  // Sort ticks by timestamp
  const sortedTicks = [...ticks].sort((a, b) => {
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    return ta - tb;
  });

  const candles: OHLC[] = [];
  const intervalMs = timeframeMinutes * 60 * 1000;

  // Find the start of the first candle period
  const firstTickTime = new Date(sortedTicks[0].timestamp).getTime();
  const candleStart = Math.floor(firstTickTime / intervalMs) * intervalMs;

  // Group ticks into candles
  const tickGroups: Map<number, Tick[]> = new Map();

  sortedTicks.forEach((tick) => {
    const tickTime = new Date(tick.timestamp).getTime();
    const candleIndex = Math.floor((tickTime - candleStart) / intervalMs);
    const groupKey = candleStart + candleIndex * intervalMs;

    if (!tickGroups.has(groupKey)) {
      tickGroups.set(groupKey, []);
    }
    tickGroups.get(groupKey)!.push(tick);
  });

  // Convert groups to OHLC candles
  tickGroups.forEach((groupTicks, timestamp) => {
    const prices = groupTicks.map((t) => t.price);
    const open = prices[0];
    const close = prices[prices.length - 1];
    const high = Math.max(...prices);
    const low = Math.min(...prices);

    candles.push({
      open,
      high,
      low,
      close,
      timestamp,
      asset: groupTicks[0].asset,
      candleType: close >= open ? "GREEN" : "RED",
      volume: groupTicks.length,
    });
  });

  return candles;
}

// ============================================
// FIBONACCI RETRACEMENT CALCULATION
// ============================================

export function calculateFibonacciLevels(
  highs: number[],
  lows: number[],
  lookback: number = 20
): FibonacciLevels | null {
  if (highs.length < lookback || lows.length < lookback) return null;

  const recentHighs = highs.slice(-lookback);
  const recentLows = lows.slice(-lookback);

  const trendHigh = Math.max(...recentHighs);
  const trendLow = Math.min(...recentLows);
  const range = trendHigh - trendLow;

  if (range === 0) return null;

  // Determine trend direction
  const recentClose = highs[highs.length - 1];
  const olderClose = highs[Math.max(0, highs.length - lookback)];
  const trend: "UP" | "DOWN" = recentClose >= olderClose ? "UP" : "DOWN";

  // Calculate Fibonacci levels
  if (trend === "UP") {
    return {
      level0: trendLow,
      level236: trendLow + range * 0.236,
      level382: trendLow + range * 0.382,
      level500: trendLow + range * 0.5,
      level618: trendLow + range * 0.618,
      level786: trendLow + range * 0.786,
      level1000: trendHigh,
      trendHigh,
      trendLow,
      trend,
    };
  } else {
    return {
      level0: trendHigh,
      level236: trendHigh - range * 0.236,
      level382: trendHigh - range * 0.382,
      level500: trendHigh - range * 0.5,
      level618: trendHigh - range * 0.618,
      level786: trendHigh - range * 0.786,
      level1000: trendLow,
      trendHigh,
      trendLow,
      trend,
    };
  }
}

export function findNearestFibonacciLevel(
  price: number,
  fib: FibonacciLevels
): { level: string; distance: number; levelValue: number } {
  const levels = [
    { name: "0%", value: fib.level0 },
    { name: "23.6%", value: fib.level236 },
    { name: "38.2%", value: fib.level382 },
    { name: "50%", value: fib.level500 },
    { name: "61.8% (Golden)", value: fib.level618 },
    { name: "78.6%", value: fib.level786 },
    { name: "100%", value: fib.level1000 },
  ];

  let nearest = levels[0];
  let minDistance = Math.abs(price - levels[0].value);

  for (const level of levels) {
    const distance = Math.abs(price - level.value);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = level;
    }
  }

  return {
    level: nearest.name,
    distance: minDistance,
    levelValue: nearest.value,
  };
}

// ============================================
// CANDLESTICK PATTERN DETECTION
// ============================================

export function detectCandlestickPatterns(candles: OHLC[]): CandlePattern[] {
  if (candles.length < 3) return [];

  const patterns: CandlePattern[] = [];

  // Get the last 3 candles for pattern detection
  const current = candles[candles.length - 1];
  const previous = candles.length >= 2 ? candles[candles.length - 2] : null;
  const beforePrevious = candles.length >= 3 ? candles[candles.length - 3] : null;

  if (!current) return patterns;

  // Body and wick calculations
  const bodySize = Math.abs(current.close - current.open);
  const upperWick = current.high - Math.max(current.open, current.close);
  const lowerWick = Math.min(current.open, current.close) - current.low;
  const totalRange = current.high - current.low;
  const bodyToRange = totalRange > 0 ? bodySize / totalRange : 0;

  // ============================================
  // SINGLE CANDLE PATTERNS
  // ============================================

  // DOJI - Very small body
  if (bodyToRange < 0.1 && totalRange > 0) {
    patterns.push({
      name: "DOJI",
      type: "NEUTRAL",
      confidence: 0.6,
      description: "Market indecision - potential reversal signal",
      candle: current,
    });
  }

  // HAMMER - Small body at top, long lower wick
  if (
    bodySize > 0 &&
    lowerWick >= bodySize * 2 &&
    upperWick < bodySize * 0.5 &&
    current.candleType === "GREEN"
  ) {
    patterns.push({
      name: "HAMMER",
      type: "BULLISH",
      confidence: 0.75,
      description: "Bullish reversal - buyers rejected lower prices",
      candle: current,
    });
  }

  // INVERTED HAMMER
  if (
    bodySize > 0 &&
    upperWick >= bodySize * 2 &&
    lowerWick < bodySize * 0.5 &&
    current.candleType === "GREEN"
  ) {
    patterns.push({
      name: "INVERTED HAMMER",
      type: "BULLISH",
      confidence: 0.7,
      description: "Bullish reversal after downtrend",
      candle: current,
    });
  }

  // HANGING MAN
  if (
    bodySize > 0 &&
    lowerWick >= bodySize * 2 &&
    upperWick < bodySize * 0.5 &&
    current.candleType === "RED"
  ) {
    patterns.push({
      name: "HANGING MAN",
      type: "BEARISH",
      confidence: 0.7,
      description: "Bearish reversal at top of uptrend",
      candle: current,
    });
  }

  // SHOOTING STAR
  if (
    bodySize > 0 &&
    upperWick >= bodySize * 2 &&
    lowerWick < bodySize * 0.5 &&
    current.candleType === "RED"
  ) {
    patterns.push({
      name: "SHOOTING STAR",
      type: "BEARISH",
      confidence: 0.75,
      description: "Bearish reversal - sellers rejected higher prices",
      candle: current,
    });
  }

  // MARUBOZU - No wicks, strong momentum
  if (bodyToRange > 0.9) {
    patterns.push({
      name: current.candleType === "GREEN" ? "BULLISH MARUBOZU" : "BEARISH MARUBOZU",
      type: current.candleType === "GREEN" ? "BULLISH" : "BEARISH",
      confidence: 0.8,
      description: `Strong ${current.candleType === "GREEN" ? "bullish" : "bearish"} momentum`,
      candle: current,
    });
  }

  // ============================================
  // TWO CANDLE PATTERNS
  // ============================================

  if (previous) {
    const prevBodySize = Math.abs(previous.close - previous.open);
    const prevUpperWick = previous.high - Math.max(previous.open, previous.close);
    const prevLowerWick = Math.min(previous.open, previous.close) - previous.low;

    // BULLISH ENGULFING
    if (
      previous.candleType === "RED" &&
      current.candleType === "GREEN" &&
      current.open < previous.close &&
      current.close > previous.open
    ) {
      patterns.push({
        name: "BULLISH ENGULFING",
        type: "BULLISH",
        confidence: 0.85,
        description: "Strong bullish reversal - buyers took control",
        candle: current,
      });
    }

    // BEARISH ENGULFING
    if (
      previous.candleType === "GREEN" &&
      current.candleType === "RED" &&
      current.open > previous.close &&
      current.close < previous.open
    ) {
      patterns.push({
        name: "BEARISH ENGULFING",
        type: "BEARISH",
        confidence: 0.85,
        description: "Strong bearish reversal - sellers took control",
        candle: current,
      });
    }

    // TWEEZER TOPS
    if (
      Math.abs(current.high - previous.high) < bodySize * 0.2 &&
      current.high === current.high && // Same high level
      previous.candleType === "GREEN" &&
      current.candleType === "RED"
    ) {
      patterns.push({
        name: "TWEEZER TOP",
        type: "BEARISH",
        confidence: 0.75,
        description: "Double rejection at resistance level",
        candle: current,
      });
    }

    // TWEEZER BOTTOMS
    if (
      Math.abs(current.low - previous.low) < bodySize * 0.2 &&
      previous.candleType === "RED" &&
      current.candleType === "GREEN"
    ) {
      patterns.push({
        name: "TWEEZER BOTTOM",
        type: "BULLISH",
        confidence: 0.75,
        description: "Double rejection at support level",
        candle: current,
      });
    }

    // PIERCING LINE
    if (
      previous.candleType === "RED" &&
      current.candleType === "GREEN" &&
      current.open < previous.low &&
      current.close > (previous.open + previous.close) / 2
    ) {
      patterns.push({
        name: "PIERCING LINE",
        type: "BULLISH",
        confidence: 0.7,
        description: "Bullish reversal piercing resistance",
        candle: current,
      });
    }

    // DARK CLOUD COVER
    if (
      previous.candleType === "GREEN" &&
      current.candleType === "RED" &&
      current.open > previous.high &&
      current.close < (previous.open + previous.close) / 2
    ) {
      patterns.push({
        name: "DARK CLOUD COVER",
        type: "BEARISH",
        confidence: 0.7,
        description: "Bearish reversal clouding support",
        candle: current,
      });
    }
  }

  // ============================================
  // THREE CANDLE PATTERNS
  // ============================================

  if (previous && beforePrevious) {
    // MORNING STAR (Bullish Triple)
    if (
      beforePrevious.candleType === "RED" &&
      previous.candleType === "RED" || beforePrevious.candleType === "GREEN" &&
      Math.abs(previous.open - previous.close) < bodySize * 0.3 && // Small body (star)
      current.candleType === "GREEN" &&
      current.close > (beforePrevious.open + beforePrevious.close) / 2
    ) {
      patterns.push({
        name: "MORNING STAR",
        type: "BULLISH",
        confidence: 0.9,
        description: "Strong bullish reversal signal",
        candle: current,
      });
    }

    // EVENING STAR (Bearish Triple)
    if (
      beforePrevious.candleType === "GREEN" &&
      Math.abs(previous.open - previous.close) < bodySize * 0.3 && // Small body (star)
      current.candleType === "RED" &&
      current.close < (beforePrevious.open + beforePrevious.close) / 2
    ) {
      patterns.push({
        name: "EVENING STAR",
        type: "BEARISH",
        confidence: 0.9,
        description: "Strong bearish reversal signal",
        candle: current,
      });
    }

    // THREE WHITE SOLDIERS
    if (
      beforePrevious.candleType === "GREEN" &&
      previous.candleType === "GREEN" &&
      current.candleType === "GREEN" &&
      previous.open > beforePrevious.open &&
      current.open > previous.open &&
      previous.close > beforePrevious.close &&
      current.close > previous.close
    ) {
      patterns.push({
        name: "THREE WHITE SOLDIERS",
        type: "BULLISH",
        confidence: 0.95,
        description: "Very strong bullish continuation signal",
        candle: current,
      });
    }

    // THREE BLACK CROWS
    if (
      beforePrevious.candleType === "RED" &&
      previous.candleType === "RED" &&
      current.candleType === "RED" &&
      previous.open < beforePrevious.open &&
      current.open < previous.open &&
      previous.close < beforePrevious.close &&
      current.close < previous.close
    ) {
      patterns.push({
        name: "THREE BLACK CROWS",
        type: "BEARISH",
        confidence: 0.95,
        description: "Very strong bearish continuation signal",
        candle: current,
      });
    }
  }

  return patterns;
}

// ============================================
// SIGNAL GENERATION
// ============================================

export function generateTechnicalSignal(
  candles: OHLC[],
  currentPrice: number,
  asset: string,
  timeframe: number
): TradingSignal | null {
  if (candles.length < 5) return null;

  // Detect patterns
  const patterns = detectCandlestickPatterns(candles);

  // Calculate Fibonacci levels
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const fibonacci = calculateFibonacciLevels(highs, lows);

  // Calculate trend
  const recentCandles = candles.slice(-10);
  const avgClose = recentCandles.reduce((sum, c) => sum + c.close, 0) / recentCandles.length;
  const earlierCandles = candles.slice(0, 10);
  const earlierAvgClose = earlierCandles.reduce((sum, c) => sum + c.close, 0) / earlierCandles.length;
  const overallTrend = avgClose > earlierAvgClose ? "UP" : "DOWN";

  // Determine signal type
  let signalType: "CALL" | "PUT" | "HOLD" = "HOLD";
  let totalConfidence = 0;
  const technicalReasons: string[] = [];
  const matchedPatterns: CandlePattern[] = [];

  // Analyze patterns for signals
  const bullishPatterns = patterns.filter((p) => p.type === "BULLISH");
  const bearishPatterns = patterns.filter((p) => p.type === "BEARISH");

  // Check for strong pattern signals
  const strongBullish = bullishPatterns.find((p) => p.confidence >= 0.8);
  const strongBearish = bearishPatterns.find((p) => p.confidence >= 0.8);

  if (strongBullish) {
    signalType = "CALL";
    totalConfidence = strongBullish.confidence;
    technicalReasons.push(`${strongBullish.name} pattern detected`);
    matchedPatterns.push(strongBullish);
  } else if (strongBearish) {
    signalType = "PUT";
    totalConfidence = strongBearish.confidence;
    technicalReasons.push(`${strongBearish.name} pattern detected`);
    matchedPatterns.push(strongBearish);
  } else if (bullishPatterns.length > bearishPatterns.length && bullishPatterns.length > 0) {
    signalType = "CALL";
    const avgConf = bullishPatterns.reduce((sum, p) => sum + p.confidence, 0) / bullishPatterns.length;
    totalConfidence = avgConf * 0.8;
    const topPattern = bullishPatterns.sort((a, b) => b.confidence - a.confidence)[0];
    technicalReasons.push(`${topPattern.name} pattern detected`);
    matchedPatterns.push(topPattern);
  } else if (bearishPatterns.length > bullishPatterns.length && bearishPatterns.length > 0) {
    signalType = "PUT";
    const avgConf = bearishPatterns.reduce((sum, p) => sum + p.confidence, 0) / bearishPatterns.length;
    totalConfidence = avgConf * 0.8;
    const topPattern = bearishPatterns.sort((a, b) => b.confidence - a.confidence)[0];
    technicalReasons.push(`${topPattern.name} pattern detected`);
    matchedPatterns.push(topPattern);
  }

  // Fibonacci analysis
  let fibLevelStr = "";
  if (fibonacci) {
    const nearestFib = findNearestFibonacciLevel(currentPrice, fibonacci);
    const fibDistance = nearestFib.distance / currentPrice;

    // Price near Fibonacci level
    if (fibDistance < 0.01) { // Within 1%
      technicalReasons.push(`Fibonacci ${nearestFib.level} level tested`);
      fibLevelStr = `Fibonacci ${nearestFib.level}`;

      // Fibonacci breakout logic
      if (signalType === "CALL" && nearestFib.level.includes("61.8") && overallTrend === "UP") {
        totalConfidence = Math.min(totalConfidence + 0.1, 0.95);
        technicalReasons.push("Golden ratio breakout confirmed");
      } else if (signalType === "PUT" && nearestFib.level.includes("61.8") && overallTrend === "DOWN") {
        totalConfidence = Math.min(totalConfidence + 0.1, 0.95);
        technicalReasons.push("Golden ratio breakdown confirmed");
      }

      // Bounce from Fibonacci support/resistance
      if (nearestFib.level === "50%" || nearestFib.level.includes("38.2")) {
        totalConfidence = Math.min(totalConfidence + 0.05, 0.95);
      }
    }
  }

  // No clear signal
  if (signalType === "HOLD" || totalConfidence < 0.5) {
    return null;
  }

  return {
    id: `${asset}-${timeframe}-${Date.now()}`,
    asset,
    signalType,
    price: currentPrice,
    confidence: Math.min(totalConfidence, 0.95),
    technicalReason: technicalReasons.join(" + "),
    patterns: matchedPatterns,
    fibonacciLevel: fibLevelStr || undefined,
    timestamp: Date.now(),
    timeframe,
  };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

export function formatTechnicalReason(signal: TradingSignal): string {
  const parts: string[] = [];

  if (signal.patterns.length > 0) {
    const patternNames = signal.patterns.map((p) => p.name);
    parts.push(patternNames.join(", "));
  }

  if (signal.fibonacciLevel) {
    parts.push(`Fibonacci ${signal.fibonacciLevel} tested`);
  }

  parts.push(`${(signal.confidence * 100).toFixed(0)}% confidence`);

  return parts.join(" | ");
}

export function getPatternEmoji(pattern: CandlePattern): string {
  const emojis: Record<string, string> = {
    DOJI: "⚖",
    HAMMER: "🔨",
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

  return emojis[pattern.name] || "📊";
}
