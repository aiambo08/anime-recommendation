"use client";
/**
 * components/battle/AnimeCard.tsx
 * ─────────────────────────────────────────────────────────────
 * A single recommendation card displayed inside a Battle column.
 *
 * Props:
 *   result     — EnrichedResult to display
 *   rank       — 1-based position in column
 *   isConsensus — true when ≥3 models recommend this anime
 *   accentHex  — model colour (knn/pmf/ncf)
 */
import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { EnrichedResult } from "@/lib/store";

interface Props {
  result:      EnrichedResult;
  rank:        number;
  isConsensus: boolean;
  accentHex:   string;
  delay?:      number;
}

export function AnimeCard({ result, rank, isConsensus, accentHex, delay = 0 }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: "easeOut" }}
      className={`
        relative rounded-sm border overflow-hidden
        ${isConsensus ? "consensus-pulse" : "border-nt-border"}
      `}
      style={
        isConsensus
          ? {
              borderColor: "#00f2ff",
              animation:   "consensus-glow 1.8s ease-in-out infinite alternate",
            }
          : { borderColor: accentHex + "44" }
      }
    >
      {/* Consensus badge */}
      {isConsensus && (
        <div
          className="absolute top-0 right-0 z-10 flex items-center gap-1 px-2 py-0.5"
          style={{ background: "#00f2ff22", borderLeft: "1px solid #00f2ff66", borderBottom: "1px solid #00f2ff66" }}
        >
          <Zap size={8} className="text-knn" />
          <span className="font-mono text-2xs text-knn">CONSENSUS</span>
        </div>
      )}

      {/* Top accent stripe */}
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: isConsensus ? "#00f2ff" : accentHex, opacity: isConsensus ? 1 : 0.6 }}
      />

      <div className="p-3">
        {/* Rank + score row */}
        <div className="flex items-baseline justify-between mb-1.5">
          <span
            className="font-display text-xs font-black"
            style={{ color: isConsensus ? "#00f2ff" : accentHex }}
          >
            #{rank}
          </span>
          <span className="font-mono text-2xs text-nt-muted">
            {result.score.toFixed(4)}
          </span>
        </div>

        {/* Title */}
        <p
          className="font-body text-xs font-semibold leading-tight mb-2 line-clamp-2"
          style={{ color: isConsensus ? "#00f2ff" : "#e2e8f0" }}
        >
          {result.title}
        </p>

        {/* Meta row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="nt-chip"
            style={{
              color:       accentHex,
              borderColor: accentHex + "55",
              fontSize:    "0.5rem",
            }}
          >
            {result.type}
          </span>
          {result.meta_rating && (
            <span className="font-mono text-2xs text-nt-muted">★ {result.meta_rating.toFixed(1)}</span>
          )}
        </div>

        {/* Genre chips */}
        <div className="mt-1.5 flex flex-wrap gap-1">
          {result.genre
            .split(",")
            .map((g) => g.trim())
            .slice(0, 2)
            .map((g) => (
              <span
                key={g}
                className="font-mono text-nt-muted"
                style={{ fontSize: "0.48rem" }}
              >
                {g}
              </span>
            ))}
        </div>
      </div>

      {/* Background glow on consensus */}
      {isConsensus && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(ellipse at center, #00f2ff08, transparent 70%)" }}
        />
      )}
    </motion.div>
  );
}
