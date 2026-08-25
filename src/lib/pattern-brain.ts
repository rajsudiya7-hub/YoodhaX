// ==========================================
// YODDHA X AI - PATTERN LEARNING BRAIN
// Candle Sequence Memory & Learning System
// ==========================================

import { supabase } from "./supabase-client";
import type { CandleData } from "./screen-observer";

export interface PatternSequence {
  id: string;
  candles: CandleData[];
  outcome: "WIN" | "LOSS" | "WAIT";
  confidence: number;
  occurrences: number;
  wins: number;
  losses: number;
  createdAt: number;
  lastSeenAt: number;
  hash: string;
  timeframe: number;
  asset: string;
}

export interface PatternMatch {
  pattern: PatternSequence;
  similarity: number;
  confidence: number;
}

export interface LearningStats {
  totalPatterns: number;
  winPatterns: number;
  lossPatterns: number;
  waitPatterns: number;
  averageConfidence: number;
  lastLearningTime: number;
}

const PATTERN_STORAGE_KEY = "yoddha-pattern-library";
const LEARNING_INTERVAL = 120000; // 2 minutes

let patternLibrary: Map<string, PatternSequence> = new Map();
let learningTimer: NodeJS.Timeout | null = null;
let lastCaptureTime = 0;

// Generate unique hash for pattern sequence
function generatePatternHash(candles: CandleData[]): string {
  const sequence = candles.map(c => `${c.color}:${c.height}`).join("|");
  let hash = 0;
  for (let i = 0; i < sequence.length; i++) {
    const char = sequence.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `pattern-${Math.abs(hash)}`;
}

// Load patterns from localStorage
export function loadPatternsFromStorage(): void {
  try {
    const stored = localStorage.getItem(PATTERN_STORAGE_KEY);
    if (stored) {
      const patterns: PatternSequence[] = JSON.parse(stored);
      patternLibrary.clear();
      patterns.forEach(p => patternLibrary.set(p.id, p));
      console.log(`[YODDHA AI] Loaded ${patterns.length} patterns from storage`);
    }
  } catch (error) {
    console.error("[YODDHA AI] Error loading patterns:", error);
    patternLibrary.clear();
  }
}

// Save patterns to localStorage
export function savePatternsToStorage(): void {
  try {
    const patterns = Array.from(patternLibrary.values());
    localStorage.setItem(PATTERN_STORAGE_KEY, JSON.stringify(patterns));
    console.log(`[YODDHA AI] Saved ${patterns.length} patterns to storage`);
  } catch (error) {
    console.error("[YODDHA AI] Error saving patterns:", error);
  }
}

// Load patterns from Supabase
export async function loadPatternsFromSupabase(userId?: string): Promise<void> {
  try {
    const query = supabase
      .from("pattern_library")
      .select("*")
      .order("occurrences", { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error("[YODDHA AI] Supabase load error:", error);
      return;
    }

    if (data) {
      data.forEach(p => {
        const pattern: PatternSequence = {
          id: p.id,
          candles: JSON.parse(p.candles_data || "[]"),
          outcome: p.outcome || "WAIT",
          confidence: p.confidence || 50,
          occurrences: p.occurrences || 1,
          wins: p.wins || 0,
          losses: p.losses || 0,
          createdAt: new Date(p.created_at).getTime(),
          lastSeenAt: new Date(p.updated_at).getTime(),
          hash: p.hash,
          timeframe: p.timeframe || 1,
          asset: p.asset || "UNKNOWN",
        };
        patternLibrary.set(pattern.id, pattern);
      });
      console.log(`[YODDHA AI] Loaded ${data.length} patterns from Supabase`);
    }
  } catch (error) {
    console.error("[YODDHA AI] Exception loading from Supabase:", error);
  }
}

// Save pattern to Supabase
export async function savePatternToSupabase(pattern: PatternSequence): Promise<boolean> {
  try {
    const { error } = await supabase.from("pattern_library").upsert({
      id: pattern.id,
      candles_data: JSON.stringify(pattern.candles),
      outcome: pattern.outcome,
      confidence: pattern.confidence,
      occurrences: pattern.occurrences,
      wins: pattern.wins,
      losses: pattern.losses,
      hash: pattern.hash,
      timeframe: pattern.timeframe,
      asset: pattern.asset,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error("[YODDHA AI] Supabase save error:", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[YODDHA AI] Exception saving to Supabase:", error);
    return false;
  }
}

// Add new pattern or update existing one
export function learnPattern(
  candles: CandleData[],
  outcome: "WIN" | "LOSS" | "WAIT" = "WAIT",
  asset: string = "UNKNOWN",
  timeframe: number = 1
): PatternSequence {
  const hash = generatePatternHash(candles);
  const existingPattern = Array.from(patternLibrary.values()).find(p => p.hash === hash);

  if (existingPattern) {
    // Update existing pattern
    existingPattern.occurrences++;
    existingPattern.lastSeenAt = Date.now();

    if (outcome === "WIN") {
      existingPattern.wins++;
      existingPattern.confidence = Math.min(100, existingPattern.confidence + 2);
    } else if (outcome === "LOSS") {
      existingPattern.losses++;
      existingPattern.confidence = Math.max(0, existingPattern.confidence - 3);
    }

    // Update outcome based on wins/losses
    if (existingPattern.wins > existingPattern.losses * 2) {
      existingPattern.outcome = "WIN";
    } else if (existingPattern.losses > existingPattern.wins * 2) {
      existingPattern.outcome = "LOSS";
    } else {
      existingPattern.outcome = "WAIT";
    }

    patternLibrary.set(existingPattern.id, existingPattern);
    savePatternsToStorage();
    savePatternToSupabase(existingPattern);
    return existingPattern;
  }

  // Create new pattern
  const newPattern: PatternSequence = {
    id: `pattern-${Date.now()}`,
    candles,
    outcome: "WAIT",
    confidence: 50,
    occurrences: 1,
    wins: 0,
    losses: 0,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
    hash,
    timeframe,
    asset,
  };

  patternLibrary.set(newPattern.id, newPattern);
  savePatternsToStorage();
  savePatternToSupabase(newPattern);
  console.log(`[YODDHA AI] Learned new pattern: ${newPattern.id}`);
  return newPattern;
}

// Compare current candles with stored patterns
export function matchPatterns(currentCandles: CandleData[]): PatternMatch | null {
  if (currentCandles.length < 2) {
    return null;
  }

  const currentHash = generatePatternHash(currentCandles);
  let bestMatch: PatternMatch | null = null;

  for (const pattern of patternLibrary.values()) {
    // Calculate similarity based on candle count matching
    const lengthSimilarity = 1 - Math.abs(pattern.candles.length - currentCandles.length) / 10;

    // Calculate color sequence similarity
    let colorMatches = 0;
    const minLength = Math.min(pattern.candles.length, currentCandles.length);
    for (let i = 0; i < minLength; i++) {
      if (pattern.candles[i]?.color === currentCandles[i]?.color) {
        colorMatches++;
      }
    }
    const colorSimilarity = colorMatches / minLength;

    // Calculate height/shape similarity
    let heightMatches = 0;
    for (let i = 0; i < minLength; i++) {
      const heightDiff = Math.abs(
        (pattern.candles[i]?.height || 0) - (currentCandles[i]?.height || 0)
      );
      if (heightDiff < 30) {
        heightMatches++;
      }
    }
    const shapeSimilarity = heightMatches / minLength;

    // Combined similarity score
    const similarity = (lengthSimilarity * 0.2 + colorSimilarity * 0.5 + shapeSimilarity * 0.3);

    // Check if this is a better match
    if (similarity > 0.7 && (!bestMatch || similarity > bestMatch.similarity)) {
      bestMatch = {
        pattern,
        similarity,
        confidence: pattern.confidence,
      };
    }
  }

  return bestMatch;
}

// Get learning statistics
export function getLearningStats(): LearningStats {
  const patterns = Array.from(patternLibrary.values());
  const totalPatterns = patterns.length;
  const winPatterns = patterns.filter(p => p.outcome === "WIN").length;
  const lossPatterns = patterns.filter(p => p.outcome === "LOSS").length;
  const waitPatterns = patterns.filter(p => p.outcome === "WAIT").length;
  const avgConfidence = patterns.length > 0
    ? patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length
    : 0;

  return {
    totalPatterns,
    winPatterns,
    lossPatterns,
    waitPatterns,
    averageConfidence: Math.round(avgConfidence),
    lastLearningTime: lastCaptureTime,
  };
}

// Clear pattern library
export function clearPatternLibrary(): void {
  patternLibrary.clear();
  localStorage.removeItem(PATTERN_STORAGE_KEY);
  console.log("[YODDHA AI] Pattern library cleared");
}

// Export pattern library for display
export function getAllPatterns(): PatternSequence[] {
  return Array.from(patternLibrary.values()).sort((a, b) => b.confidence - a.confidence);
}

// Get top patterns by confidence
export function getTopPatterns(limit: number = 20): PatternSequence[] {
  return getAllPatterns().slice(0, limit);
}
