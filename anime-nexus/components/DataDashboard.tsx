"use client";
/**
 * components/DataDashboard.tsx
 * ─────────────────────────────────────────────────────────────
 * Section [02] on the landing page — the data engine UI.
 * Shows:
 *   • Four ResultUploadZones (one per model)
 *   • Stats summary row once any model has results
 *   • Consensus badge when IDs appear across multiple models
 */
import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, TrendingUp, Users, GitMerge } from "lucide-react";
import { ResultUploadZone } from "./ResultUploadZone";
import { useRecommendationData } from "@/lib/useRecommendationData";
import { ModelKey } from "@/lib/store";

const MODELS: ModelKey[] = ["KNN", "PMF", "BMF", "NCF"];

const MODEL_LABELS: Record<ModelKey, string> = {
  KNN: "K-Nearest Neighbors",
  PMF: "Probabilistic MF",
  BMF: "Bayesian MF",
  NCF: "Neural CF",
};

const ACCENT_HEX: Record<ModelKey, string> = {
  KNN: "#00f2ff",
  PMF: "#fff000",
  BMF: "#fff000",
  NCF: "#ff00ff",
};

export function DataDashboard() {
  const { modelStates, getModelStats, consensusIds, allResults } =
    useRecommendationData();

  const loadedModels = useMemo(
    () => MODELS.filter((m) => modelStates[m].results.length > 0),
    [modelStates]
  );

  const totalRecs = allResults.length;
  const hasAny    = totalRecs > 0;

  return (
    <section className="mb-16">
      <div className="nt-label mb-6 text-nt-muted">
        [02] DATA ENGINE — LOAD RECOMMENDATION RESULTS
      </div>

      {/* Four upload zones */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {MODELS.map((model, i) => (
          <motion.div
            key={model}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.4, ease: "easeOut" }}
          >
            <div className="nt-label mb-2" style={{ color: ACCENT_HEX[model] }}>
              {model} — {MODEL_LABELS[model]}
            </div>
            <ResultUploadZone model={model} />
          </motion.div>
        ))}
      </div>

      {/* Stats summary row */}
      <AnimatePresence>
        {hasAny && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4"
          >
            <StatCard
              icon={<Zap size={14} />}
              label="Total Recommendations"
              value={totalRecs.toLocaleString()}
              color="#00f2ff"
            />
            <StatCard
              icon={<TrendingUp size={14} />}
              label="Models Loaded"
              value={`${loadedModels.length} / 4`}
              color="#fff000"
            />
            <StatCard
              icon={<Users size={14} />}
              label="Unique Anime IDs"
              value={new Set(allResults.map((r) => r.anime_id)).size.toLocaleString()}
              color="#ff00ff"
            />
            <StatCard
              icon={<GitMerge size={14} />}
              label="Consensus IDs"
              value={consensusIds.length.toLocaleString()}
              color="#00f2ff"
              subtitle={loadedModels.length < 2 ? "Need ≥ 2 models" : undefined}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Per-model avg stats */}
      <AnimatePresence>
        {hasAny && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            {MODELS.map((model) => {
              const stats = getModelStats(model);
              if (stats.count === 0) return null;
              return (
                <ModelStatCard key={model} model={model} stats={stats} />
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

// ─── Stat card ────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  color,
  subtitle,
}: {
  icon:     React.ReactNode;
  label:    string;
  value:    string;
  color:    string;
  subtitle?: string;
}) {
  return (
    <div className="glass-panel rounded-sm border border-nt-border p-4 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: color }} />
      <div className="flex items-center gap-2 mb-2" style={{ color }}>
        {icon}
        <span className="nt-label" style={{ color }}>
          {label}
        </span>
      </div>
      <p className="font-display text-xl font-bold" style={{ color }}>
        {value}
      </p>
      {subtitle && <p className="font-mono text-2xs text-nt-muted mt-1">{subtitle}</p>}
    </div>
  );
}

// ─── Per-model condensed stats ────────────────────────────────

function ModelStatCard({
  model,
  stats,
}: {
  model: ModelKey;
  stats: { count: number; avgScore: number; avgRating: number; genreDistribution: Record<string, number> };
}) {
  const color = ACCENT_HEX[model];

  // Top 3 genres
  const topGenres = Object.entries(stats.genreDistribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([g]) => g);

  return (
    <div className="glass-panel rounded-sm border border-nt-border p-4 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: color }} />
      <div className="flex items-center justify-between mb-3">
        <span className="font-display text-xs font-bold tracking-widest" style={{ color }}>
          {model}
        </span>
        <span className="nt-chip" style={{ color, borderColor: color + "66" }}>
          {stats.count} recs
        </span>
      </div>

      <div className="space-y-2">
        <MiniStat label="Avg Score"  value={stats.avgScore.toFixed(4)}  color={color} />
        <MiniStat label="Avg MAL ★"  value={stats.avgRating.toFixed(2)} color={color} />
      </div>

      {topGenres.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {topGenres.map((g) => (
            <span
              key={g}
              className="nt-chip text-nt-muted border-nt-border text-2xs"
              style={{ fontSize: "0.55rem" }}
            >
              {g}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="nt-label">{label}</span>
      <span className="font-mono text-xs" style={{ color }}>{value}</span>
    </div>
  );
}
