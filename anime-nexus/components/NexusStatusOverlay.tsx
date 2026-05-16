"use client";
/**
 * components/NexusStatusOverlay.tsx
 * ─────────────────────────────────────────────────────────────
 * Cyberpunk debug overlay — real-time readout of every dataset
 * currently live in the Zustand store.
 *
 * Displayed as a collapsible fixed panel (bottom-right).
 * Each row shows: dataset name, status pill, and row count.
 * Auto-highlights when data arrives (pulse animation).
 *
 * Usage: drop <NexusStatusOverlay /> anywhere inside the React tree.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, ChevronDown, ChevronUp, Loader2, CheckCircle2, AlertCircle, Circle } from "lucide-react";
import { useNexusStore, ModelKey } from "@/lib/store";
import { useModelState } from "@/lib/useRecommendationData";

const MODELS: ModelKey[] = ["KNN", "PMF", "BMF", "NCF"];
const MODEL_COLOR: Record<ModelKey, string> = {
  KNN: "#00f2ff",
  PMF: "#fff000",
  BMF: "#d4b800",
  NCF: "#ff00ff",
};

// ── Single status row ─────────────────────────────────────────

function ModelRow({ model }: { model: ModelKey }) {
  const state = useModelState(model);
  const color = MODEL_COLOR[model];
  const count = state.results.length;

  let statusIcon: React.ReactNode;
  let statusLabel: string;
  let statusColor: string;

  if (state.loading) {
    statusIcon  = <Loader2 size={10} className="animate-spin" />;
    statusLabel = `${state.progress}%`;
    statusColor = color;
  } else if (state.error) {
    statusIcon  = <AlertCircle size={10} />;
    statusLabel = "ERR";
    statusColor = "#ef4444";
  } else if (count > 0) {
    statusIcon  = <CheckCircle2 size={10} />;
    statusLabel = count.toLocaleString();
    statusColor = color;
  } else {
    statusIcon  = <Circle size={10} />;
    statusLabel = "EMPTY";
    statusColor = "#334155";
  }

  return (
    <div className="flex items-center gap-2 py-1 border-b border-white/5 last:border-0">
      {/* Model chip */}
      <span
        className="font-mono text-2xs w-8 shrink-0 font-bold"
        style={{ color: count > 0 ? color : "#334155" }}
      >
        {model}
      </span>

      {/* Status pill */}
      <span
        className="flex items-center gap-1 font-mono text-2xs ml-auto"
        style={{ color: statusColor }}
      >
        {statusIcon}
        {statusLabel}
      </span>

      {/* Progress bar (shown during loading) */}
      {state.loading && (
        <div className="w-16 h-0.5 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: color }}
            animate={{ width: `${state.progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      )}
    </div>
  );
}

function SourceRow({
  label,
  count,
  loading,
  error,
  color,
}: {
  label:   string;
  count:   number;
  loading: boolean;
  error:   string | null;
  color:   string;
}) {
  let icon: React.ReactNode;
  let text: string;
  let textColor: string;

  if (loading) {
    icon      = <Loader2 size={10} className="animate-spin" />;
    text      = "LOADING";
    textColor = color;
  } else if (error) {
    icon      = <AlertCircle size={10} />;
    text      = "ERR";
    textColor = "#ef4444";
  } else if (count > 0) {
    icon      = <CheckCircle2 size={10} />;
    text      = count.toLocaleString();
    textColor = color;
  } else {
    icon      = <Circle size={10} />;
    text      = "NOT LOADED";
    textColor = "#334155";
  }

  return (
    <div className="flex items-center gap-2 py-1 border-b border-white/5 last:border-0">
      <span
        className="font-mono text-2xs shrink-0"
        style={{ color: count > 0 ? color : "#334155" }}
      >
        {label}
      </span>
      <span
        className="flex items-center gap-1 font-mono text-2xs ml-auto"
        style={{ color: textColor }}
      >
        {icon} {text}
      </span>
    </div>
  );
}

// ── Main overlay ──────────────────────────────────────────────

export function NexusStatusOverlay() {
  const [collapsed, setCollapsed] = useState(false);

  const animeCount   = useNexusStore((s) => s.animeData.length);
  const ratingCount  = useNexusStore((s) => s.ratingData.length);
  const loadingAnime = useNexusStore((s) => s.loadingAnime);
  const loadingRatings = useNexusStore((s) => s.loadingRatings);
  const errorAnime   = useNexusStore((s) => s.errorAnime);
  const errorRatings = useNexusStore((s) => s.errorRatings);

  // Count live models
  const liveModels = useNexusStore((s) =>
    MODELS.filter((m) => s.models[m].results.length > 0).length
  );
  const totalRecs = useNexusStore((s) =>
    MODELS.reduce((sum, m) => sum + s.models[m].results.length, 0)
  );

  const isAllEmpty = liveModels === 0 && animeCount === 0 && ratingCount === 0;
  const hasAnyLoading = useNexusStore((s) =>
    s.loadingAnime || s.loadingRatings || MODELS.some((m) => s.models[m].loading)
  );

  return (
    <motion.div
      className="fixed bottom-4 right-4 z-50 w-56 rounded-sm border glass-panel overflow-hidden"
      style={{
        borderColor: "#00f2ff33",
        boxShadow:   liveModels > 0 ? "0 0 20px 2px #00f2ff18" : "none",
      }}
      animate={{ opacity: isAllEmpty && !hasAnyLoading ? 0.35 : 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header bar */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 border-b border-white/5
                   hover:bg-white/[0.03] transition-colors"
      >
        <Activity size={10} className={hasAnyLoading ? "animate-pulse text-knn" : "text-knn"} style={{ color: "#00f2ff" }} />
        <span className="font-mono text-2xs font-bold text-knn flex-1 text-left tracking-widest" style={{ color: "#00f2ff" }}>
          NEXUS STATUS
        </span>
        {/* Live count badge */}
        {liveModels > 0 && (
          <span className="font-mono text-2xs px-1.5 py-0.5 rounded-sm border" style={{ color: "#00f2ff", borderColor: "#00f2ff55" }}>
            {liveModels}/4 LIVE
          </span>
        )}
        {collapsed ? <ChevronDown size={10} className="text-nt-muted" /> : <ChevronUp size={10} className="text-nt-muted" />}
      </button>

      {/* Content */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 py-2">
              {/* Source data */}
              <p className="font-mono text-2xs text-nt-muted mb-1 uppercase tracking-widest">Source</p>
              <SourceRow
                label="anime.csv"
                count={animeCount}
                loading={loadingAnime}
                error={errorAnime}
                color="#00f2ff"
              />
              <SourceRow
                label="rating.csv"
                count={ratingCount}
                loading={loadingRatings}
                error={errorRatings}
                color="#ff00ff"
              />

              {/* Model results */}
              <p className="font-mono text-2xs text-nt-muted mt-3 mb-1 uppercase tracking-widest">Models</p>
              {MODELS.map((m) => (
                <ModelRow key={m} model={m} />
              ))}

              {/* Total */}
              {totalRecs > 0 && (
                <div
                  className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between"
                >
                  <span className="font-mono text-2xs text-nt-muted">TOTAL RECS</span>
                  <span className="font-mono text-2xs font-bold" style={{ color: "#00f2ff" }}>
                    {totalRecs.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
