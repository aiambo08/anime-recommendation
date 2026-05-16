/**
 * components/gachapon/useGachapon.ts
 * ─────────────────────────────────────────────────────────────
 * State machine + logic for the Gachapon Reveal mechanic.
 *
 *  States: IDLE → PULLING → VIBRATING → DROPPING → REVEALING → DONE
 *
 *  SSR threshold: anime.csv meta_rating > 8.5  → "SSR – Legendary"
 */

import { useState, useCallback } from "react";
import { useNexusStore, type EnrichedResult, type ModelKey } from "@/lib/store";

// ── Rarity tiers ─────────────────────────────────────────────

export type RarityTier = "SSR" | "SR" | "R";

export interface GachaResult {
  entry:  EnrichedResult;
  rarity: RarityTier;
}

function getRarity(meta_rating: number | null): RarityTier {
  if (meta_rating !== null && meta_rating > 8.5) return "SSR";
  if (meta_rating !== null && meta_rating > 7.5) return "SR";
  return "R";
}

// ── Animation state machine ───────────────────────────────────

export type GachaPhase =
  | "IDLE"
  | "PULLING"
  | "VIBRATING"
  | "DROPPING"
  | "REVEALING"
  | "DONE";

export interface GachaState {
  phase:       GachaPhase;
  result:      GachaResult | null;
  selectedModel: ModelKey;
}

// ── Timing constants (ms) ─────────────────────────────────────
const PULL_DURATION     = 600;   // lever drag + snap
const VIBRATE_DURATION  = 700;   // machine shake
const DROP_DURATION     = 900;   // capsule fall animation
const REVEAL_DELAY      = 200;   // small pause before modal

export function useGachapon() {
  const models = useNexusStore((s) => s.models);

  const [state, setState] = useState<GachaState>({
    phase:         "IDLE",
    result:        null,
    selectedModel: "KNN",
  });

  const selectModel = useCallback((model: ModelKey) => {
    if (state.phase !== "IDLE" && state.phase !== "DONE") return;
    setState((s) => ({ ...s, selectedModel: model, result: null, phase: "IDLE" }));
  }, [state.phase]);

  const pull = useCallback(() => {
    if (state.phase !== "IDLE" && state.phase !== "DONE") return;

    const pool = models[state.selectedModel].results.slice(0, 10);
    if (pool.length === 0) return;

    const entry  = pool[Math.floor(Math.random() * pool.length)];
    const rarity = getRarity(entry.meta_rating);

    // Start the state machine sequence
    setState((s) => ({ ...s, phase: "PULLING", result: null }));

    setTimeout(() => {
      setState((s) => ({ ...s, phase: "VIBRATING" }));
    }, PULL_DURATION);

    setTimeout(() => {
      setState((s) => ({ ...s, phase: "DROPPING" }));
    }, PULL_DURATION + VIBRATE_DURATION);

    setTimeout(() => {
      setState((s) => ({ ...s, phase: "REVEALING", result: { entry, rarity } }));
    }, PULL_DURATION + VIBRATE_DURATION + DROP_DURATION + REVEAL_DELAY);
  }, [state.phase, state.selectedModel, models]);

  const dismiss = useCallback(() => {
    setState((s) => ({ ...s, phase: "DONE" }));
  }, []);

  const reset = useCallback(() => {
    setState((s) => ({ ...s, phase: "IDLE", result: null }));
  }, []);

  // Convenience flags
  const isAnimating = !["IDLE", "DONE"].includes(state.phase);
  const hasData     = models[state.selectedModel].results.length > 0;

  return { state, isAnimating, hasData, selectModel, pull, dismiss, reset };
}
