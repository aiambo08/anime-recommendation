"use client";
/**
 * components/battle/BattleRoyale.tsx
 * ─────────────────────────────────────────────────────────────
 * Quadrant 2 — 4-column side-by-side comparison.
 *
 * Features:
 *  • User ID selector — filters results by user if "user_id" column present
 *  • Top-N slider (1–10)
 *  • Consensus detection: anime_id appearing in ≥3 models → neon pulse card
 *  • Genre / type quick-filters
 */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Users, Filter, GitMerge } from "lucide-react";
import { BattleColumn } from "./BattleColumn";
import { useRecommendationData, useModelState } from "@/lib/useRecommendationData";
import { ModelKey, EnrichedResult } from "@/lib/store";
import { useNexusStore } from "@/lib/store";

const MODELS: ModelKey[] = ["KNN", "PMF", "BMF", "NCF"];
const ACCENT: Record<ModelKey, string> = {
  KNN: "#00f2ff",
  PMF: "#fff000",
  BMF: "#d4b800",
  NCF: "#ff00ff",
};
const MODEL_LABEL: Record<ModelKey, string> = {
  KNN: "K-Nearest Neighbors",
  PMF: "Probabilistic MF",
  BMF: "Bayesian MF",
  NCF: "Neural CF",
};

// ─── Consensus detection ─────────────────────────────────────

function buildConsensusSet(
  topResults: Record<ModelKey, EnrichedResult[]>,
  threshold = 3
): Set<number> {
  const freq: Record<number, number> = {};
  for (const model of MODELS) {
    for (const r of topResults[model]) {
      freq[r.anime_id] = (freq[r.anime_id] ?? 0) + 1;
    }
  }
  return new Set(Object.entries(freq)
    .filter(([, count]) => count >= threshold)
    .map(([id]) => Number(id)));
}

// ─── Component ────────────────────────────────────────────────

export function BattleRoyale() {
  const { getSortedResults, modelStates } = useRecommendationData();
  const ratingData  = useNexusStore((s) => s.ratingData);

  const [topN,      setTopN]      = useState(5);
  const [userId,    setUserId]    = useState<number | null>(null);
  const [filterGenre, setFilterGenre] = useState("");
  const [filterType,  setFilterType]  = useState("");
  const [consensusThreshold, setConsensusThreshold] = useState(3);

  // Unique user IDs from rating.csv (capped for UX)
  const uniqueUserIds = useMemo(() => {
    if (ratingData.length === 0) return [];
    const ids = Array.from(new Set(ratingData.map((r) => r.user_id))).sort((a, b) => a - b);
    return ids.slice(0, 500); // cap at 500 for dropdown performance
  }, [ratingData]);

  // Per-model top-N (with optional user filter + genre/type filter)
  const topResults = useMemo(() => {
    const out = {} as Record<ModelKey, EnrichedResult[]>;
    for (const model of MODELS) {
      let rows = getSortedResults(
        model,
        {
          genre:    filterGenre || undefined,
          type:     filterType  || undefined,
        },
        { sortBy: "score", sortDir: "desc" }
      );

      // If user_id column exists in results, filter by selected user
      if (userId !== null) {
        const userFiltered = rows.filter(
          (r) => (r as EnrichedResult & { user_id?: number }).user_id === userId
        );
        if (userFiltered.length > 0) rows = userFiltered;
        // If no per-user data, fall back to global top-N
      }

      out[model] = rows.slice(0, topN);
    }
    return out;
  }, [getSortedResults, filterGenre, filterType, userId, topN]);

  // Consensus set
  const consensusSet = useMemo(
    () => buildConsensusSet(topResults, consensusThreshold),
    [topResults, consensusThreshold]
  );

  const hasAnyData = MODELS.some((m) => modelStates[m].results.length > 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Controls bar */}
      <div className="glass-panel rounded-sm border border-nt-border p-4">
        <div className="flex flex-wrap gap-4 items-end">

          {/* User selector */}
          <div className="flex flex-col gap-1">
            <label className="nt-label flex items-center gap-1">
              <Users size={10} /> USER ID
            </label>
            <select
              value={userId ?? ""}
              onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : null)}
              className="bg-nt-surface border border-nt-border rounded-sm px-2 py-1.5
                         font-mono text-xs text-nt-text focus:border-knn focus:outline-none
                         min-w-[140px]"
              disabled={uniqueUserIds.length === 0}
            >
              <option value="">— GLOBAL TOP-{topN} —</option>
              {uniqueUserIds.map((id) => (
                <option key={id} value={id}>USER {id}</option>
              ))}
            </select>
            {uniqueUserIds.length === 0 && (
              <span className="font-mono text-2xs text-nt-muted">
                Load rating.csv to filter by user
              </span>
            )}
          </div>

          {/* Top-N slider */}
          <div className="flex flex-col gap-1">
            <label className="nt-label">
              TOP-N = {topN}
            </label>
            <input
              type="range"
              min={1} max={10} value={topN}
              onChange={(e) => setTopN(Number(e.target.value))}
              className="accent-knn w-32"
            />
          </div>

          {/* Genre filter */}
          <div className="flex flex-col gap-1">
            <label className="nt-label flex items-center gap-1">
              <Filter size={10} /> GENRE
            </label>
            <input
              type="text"
              placeholder="e.g. Action"
              value={filterGenre}
              onChange={(e) => setFilterGenre(e.target.value)}
              className="bg-nt-surface border border-nt-border rounded-sm px-2 py-1.5
                         font-mono text-xs text-nt-text placeholder:text-nt-faint
                         focus:border-knn focus:outline-none w-32"
            />
          </div>

          {/* Type filter */}
          <div className="flex flex-col gap-1">
            <label className="nt-label">TYPE</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-nt-surface border border-nt-border rounded-sm px-2 py-1.5
                         font-mono text-xs text-nt-text focus:border-knn focus:outline-none"
            >
              <option value="">ALL</option>
              {["TV", "Movie", "OVA", "ONA", "Special", "Music"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Consensus threshold */}
          <div className="flex flex-col gap-1">
            <label className="nt-label flex items-center gap-1">
              <GitMerge size={10} /> CONSENSUS ≥ {consensusThreshold}
            </label>
            <input
              type="range"
              min={2} max={4} value={consensusThreshold}
              onChange={(e) => setConsensusThreshold(Number(e.target.value))}
              className="accent-knn w-24"
            />
          </div>

          {/* Stats */}
          {consensusSet.size > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="ml-auto flex items-center gap-2 px-3 py-2 rounded-sm border border-knn/40 bg-knn/5"
            >
              <span className="flex h-2 w-2 rounded-full bg-knn animate-pulse-knn" />
              <span className="font-mono text-xs text-knn">
                {consensusSet.size} CONSENSUS ANIME
              </span>
            </motion.div>
          )}
        </div>
      </div>

      {/* 4-column grid */}
      {!hasAnyData ? (
        <div className="flex items-center justify-center h-48">
          <p className="font-mono text-sm text-nt-muted text-center">
            Load at least one model&apos;s results in Section [02] to start the Battle Royale
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {MODELS.map((model) => (
            <BattleColumn
              key={model}
              model={model}
              results={topResults[model]}
              consensusSet={consensusSet}
              accentHex={ACCENT[model]}
              label={MODEL_LABEL[model]}
            />
          ))}
        </div>
      )}

      {/* Consensus legend */}
      {consensusSet.size > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <span className="font-mono text-2xs text-nt-muted">
            Cards with{" "}
            <span className="text-knn font-semibold">⚡ CONSENSUS</span>
            {" "}badge appear in ≥ {consensusThreshold} model outputs simultaneously
          </span>
        </motion.div>
      )}
    </div>
  );
}
