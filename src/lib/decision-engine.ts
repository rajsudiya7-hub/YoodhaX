// ==========================================
// YODDHA X AI - DECISION ENGINE
// Pattern Matching & Signal Generation
// ==========================================

import type { CandleData } from "./screen-observer";
import { matchPatterns, learnPattern, type PatternMatch } from "./pattern-brain";

export type TradingDecision = "BUY" | "SELL" | "WAIT";

export interface DecisionResult {
  decision: TradingDecision;
  confidence: number;
  matchedPattern: PatternMatch | null;
  reasoning: string;
  timestamp: number;
  candleCount: number;
  greenCandles: number;
  redCandles: number;
  trendDirection: "BULLISH" | "BEARISH" | "NEUTRAL";
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
}

const CONFIDENCE_THRESHOLD = 80; // 80% minimum for BUY/SELL
const MIN_CANDLE_COUNT = 3; // Minimum candles for analysis

// Analyze candle sequence and make decision
export function makeDecision(candles: CandleData[]): DecisionResult {
  const timestamp = Date.now();

  // Check minimum candle count
  if (candles.length < MIN_CANDLE_COUNT) {
    return {
      decision: "WAIT",
      confidence: 0,
      matchedPattern: null,
      reasoning: "Insufficient candle data for analysis",
      timestamp,
      candleCount: candles.length,
      greenCandles: 0,
      redCandles: 0,
      trendDirection: "NEUTRAL",
      riskLevel: "HIGH",
    };
  }

  // Count candle types
  const greenCandles = candles.filter(c => c.color === "GREEN").length;
  const redCandles = candles.filter(c => c.color === "RED").length;

  // Determine trend direction
  let trendDirection: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  if (greenCandles > redCandles * 1.5) {
    trendDirection = "BULLISH";
  } else if (redCandles > greenCandles * 1.5) {
    trendDirection = "BEARISH";
  }

  // Match against learned patterns
  const matchedPattern = matchPatterns(candles);

  // If strong pattern match found
  if (matchedPattern && matchedPattern.confidence >= CONFIDENCE_THRESHOLD) {
    let decision: TradingDecision;
    let reasoning: string;
    let riskLevel: "LOW" | "MEDIUM" | "HIGH";

    if (matchedPattern.pattern.outcome === "WIN") {
      // WIN patterns indicate good setup
      if (trendDirection === "BULLISH") {
        decision = "BUY";
        reasoning = `High-confidence WIN pattern (${matchedPattern.confidence}%) - Bullish trend confirmed`;
      } else if (trendDirection === "BEARISH") {
        decision = "SELL";
        reasoning = `High-confidence WIN pattern (${matchedPattern.confidence}%) - Bearish trend confirmed`;
      } else {
        decision = matchedPattern.pattern.candles[matchedPattern.pattern.candles.length - 1]?.color === "GREEN"
          ? "BUY"
          : "SELL";
        reasoning = `WIN pattern matched (${matchedPattern.confidence}%) with trend alignment`;
      }
      riskLevel = "LOW";
    } else if (matchedPattern.pattern.outcome === "LOSS") {
      // LOSS patterns - wait or counter-trade
      decision = "WAIT";
      reasoning = `Pattern historically leads to losses (${matchedPattern.pattern.losses} losses)`;
      riskLevel = "HIGH";
    } else {
      // WAIT patterns - insufficient history
      decision = "WAIT";
      reasoning = `Pattern exists but insufficient win/loss data (${matchedPattern.pattern.occurrences} occurrences)`;
      riskLevel = "MEDIUM";
    }

    return {
      decision,
      confidence: matchedPattern.confidence,
      matchedPattern,
      reasoning,
      timestamp,
      candleCount: candles.length,
      greenCandles,
      redCandles,
      trendDirection,
      riskLevel,
    };
  }

  // No pattern match - use trend analysis
  if (matchedPattern && matchedPattern.confidence < CONFIDENCE_THRESHOLD) {
    // Pattern exists but low confidence
    return {
      decision: "WAIT",
      confidence: matchedPattern.confidence,
      matchedPattern,
      reasoning: `Pattern matched but confidence (${matchedPattern.confidence}%) below threshold (${CONFIDENCE_THRESHOLD}%)`,
      timestamp,
      candleCount: candles.length,
      greenCandles,
      redCandles,
      trendDirection,
      riskLevel: "MEDIUM",
    };
  }

  // No pattern match - use basic trend analysis
  let decision: TradingDecision;
  let reasoning: string;
  let confidence = 50;

  if (greenCandles >= candles.length * 0.7) {
    decision = "BUY";
    reasoning = `Strong bullish bias: ${greenCandles}/${candles.length} GREEN candles`;
    confidence = 60 + Math.min(20, (greenCandles / candles.length) * 30);
  } else if (redCandles >= candles.length * 0.7) {
    decision = "SELL";
    reasoning = `Strong bearish bias: ${redCandles}/${candles.length} RED candles`;
    confidence = 60 + Math.min(20, (redCandles / candles.length) * 30);
  } else {
    decision = "WAIT";
    reasoning = `Mixed market: ${greenCandles} GREEN, ${redCandles} RED - No clear pattern`;
    confidence = 40;
  }

  return {
    decision,
    confidence,
    matchedPattern: null,
    reasoning,
    timestamp,
    candleCount: candles.length,
    greenCandles,
    redCandles,
    trendDirection,
    riskLevel: confidence >= 70 ? "LOW" : confidence >= 50 ? "MEDIUM" : "HIGH",
  };
}

// Update pattern outcome based on market result
export function updatePatternOutcome(
  candles: CandleData[],
  result: "WIN" | "LOSS",
  asset: string,
  timeframe: number
): void {
  learnPattern(candles, result, asset, timeframe);
}

// Calculate risk score based on multiple factors
export function calculateRiskScore(decision: DecisionResult): number {
  let riskScore = 100;

  // Reduce risk based on confidence
  riskScore -= decision.confidence * 0.5;

  // Reduce risk if pattern matched
  if (decision.matchedPattern) {
    riskScore -= 20;
  }

  // Increase risk if trend is neutral
  if (decision.trendDirection === "NEUTRAL") {
    riskScore += 15;
  }

  // Increase risk for WAIT decisions (uncertainty)
  if (decision.decision === "WAIT") {
    riskScore += 30;
  }

  // Cap at 0-100
  return Math.max(0, Math.min(100, riskScore));
}

// Get trading recommendation with detailed analysis
export function getDetailedAnalysis(candles: CandleData[]): {
  decision: DecisionResult;
  analysis: {
    bullishScore: number;
    bearishScore: number;
    volatilityScore: number;
    momentumScore: number;
  };
} {
  const decision = makeDecision(candles);

  // Calculate additional metrics
  let bullishScore = 0;
  let bearishScore = 0;
  let volatilityScore = 0;
  let momentumScore = 0;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const prevCandle = candles[i - 1];

    if (candle.color === "GREEN") {
      bullishScore += 10;
      if (prevCandle && prevCandle.color === "GREEN") {
        momentumScore += 5; // Consecutive green
      }
    } else if (candle.color === "RED") {
      bearishScore += 10;
      if (prevCandle && prevCandle.color === "RED") {
        momentumScore += 5; // Consecutive red
      }
    } else if (candle.color === "DOJI") {
      volatilityScore += 10; // Indecision
    }

    // Calculate volatility from candle height
    volatilityScore += candle.height / 10;
  }

  // Normalize scores
  bullishScore = Math.min(100, bullishScore);
  bearishScore = Math.min(100, bearishScore);
  volatilityScore = Math.min(100, volatilityScore);
  momentumScore = Math.min(100, momentumScore);

  return {
    decision,
    analysis: {
      bullishScore,
      bearishScore,
      volatilityScore,
      momentumScore,
    },
  };
}
