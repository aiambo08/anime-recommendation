"use client";
/**
 * components/battle/BattleColumn.tsx
 * ─────────────────────────────────────────────────────────────
 * One vertical column in the Battle Royale view.
 * Displays the Top-5 results for a single model,
 * marking each card as consensus if its anime_id appears
 * in the consensusSet (≥3 models agree).
 */
import { motion } from "framer-motion";
import { Loader2, AlertCircle } from "lucide-react";
import { AnimeCard } from "./AnimeCard";
import { ModelKey, EnrichedResult } from "@/lib/store";
import { useModelState } from "@/lib/useRecommendationData";

interface Props {
  model:        ModelKey;
  results:      EnrichedResult[];   // top-5 pre-filtered by parent
  consensusSet: Set<number>;        // anime_ids that appear in ≥3 models
  accentHex:    string;
  label:        string;
}

export function BattleColumn({ model, results, consensusSet, accentHex, label }: Props) {
  const state = useModelState(model);

  return (
    <div className="flex flex-col min-w-0">
      {/* Column header */}
      <div
        className="mb-3 rounded-sm border p-3 text-center relative overflow-hidden"
        style={{ borderColor: accentHex + "44", background: accentHex + "0a" }}
      >
        {/* Top stripe */}
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: accentHex, boxShadow: `0 0 8px ${accentHex}` }}
        />
        <p
          className="font-display text-xs font-black tracking-widest uppercase"
          style={{ color: accentHex }}
        >
          {model}
        </p>
        <p className="font-mono text-2xs text-nt-muted mt-0.5">{label}</p>
        {state.results.length > 0 && (
          <span
            className="mt-1 nt-chip inline-flex"
            style={{ color: accentHex, borderColor: accentHex + "55" }}
          >
            {state.results.length} recs total
          </span>
        )}
      </div>

      {/* States */}
      {state.loading && (
        <div className="flex flex-col items-center gap-2 py-8">
          <Loader2 size={20} className="animate-spin" style={{ color: accentHex }} />
          <span className="font-mono text-2xs" style={{ color: accentHex }}>
            LOADING…
          </span>
        </div>
      )}

      {state.error && (
        <div className="flex items-center gap-2 p-3 rounded-sm border border-red-900">
          <AlertCircle size={12} className="text-red-500 shrink-0" />
          <p className="font-mono text-2xs text-red-400 truncate">{state.error}</p>
        </div>
      )}

      {!state.loading && !state.error && results.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <div
            className="h-8 w-8 rounded-sm border flex items-center justify-center"
            style={{ borderColor: accentHex + "33" }}
          >
            <span className="font-mono text-2xs" style={{ color: accentHex }}>?</span>
          </div>
          <p className="font-mono text-2xs text-nt-muted">
            {state.results.length === 0 ? "No results loaded" : "No results match filter"}
          </p>
        </div>
      )}

      {/* Result cards */}
      {!state.loading && results.length > 0 && (
        <div className="flex flex-col gap-2">
          {results.map((r, i) => (
            <AnimeCard
              key={r.anime_id}
              result={r}
              rank={i + 1}
              isConsensus={consensusSet.has(r.anime_id)}
              accentHex={accentHex}
              delay={i * 0.07}
            />
          ))}
        </div>
      )}

      {/* Bottom count bar */}
      {results.length > 0 && (
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mt-3 h-px origin-left"
          style={{ background: `linear-gradient(90deg, ${accentHex}, transparent)` }}
        />
      )}
    </div>
  );
}
