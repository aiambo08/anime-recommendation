"use client";
/**
 * components/viz/NcfHeatmap.tsx
 * ─────────────────────────────────────────────────────────────
 * 10×10 Heatmap — latent space activation grid for NCF.
 *
 * Derivation: take top-100 NCF results, arrange in a 10×10 grid
 * sorted by score. Cell colour intensity = normalised score.
 * Hover reveals anime title + score tooltip.
 *
 * Built in pure SVG / CSS — no extra libraries needed.
 */
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useModelResults } from "@/lib/useRecommendationData";
import { EmptyViz } from "./KnnForceGraph";

const NCF_COLOR = "#ff00ff";
const ROWS = 10;
const COLS = 10;

function lerp(t: number) {
  // t in [0,1] → hex colour from near-black (#0a0011) to magenta (#ff00ff)
  const r = Math.round(t * 255);
  const g = 0;
  const b = Math.round(t * 255);
  return `rgb(${r},${g},${b})`;
}

interface Cell {
  idx:   number;
  row:   number;
  col:   number;
  score: number;
  norm:  number;  // 0-1
  title: string;
  anime_id: number;
}

export function NcfHeatmap() {
  const results = useModelResults("NCF");
  const [hovered, setHovered] = useState<Cell | null>(null);

  const cells = useMemo<Cell[]>(() => {
    const top = results.slice(0, ROWS * COLS);
    if (top.length === 0) return [];

    const maxScore = Math.max(...top.map((r) => r.score));
    const minScore = Math.min(...top.map((r) => r.score));
    const range    = maxScore - minScore || 1;

    return top.map((r, i) => ({
      idx:      i,
      row:      Math.floor(i / COLS),
      col:      i % COLS,
      score:    r.score,
      norm:     (r.score - minScore) / range,
      title:    r.title,
      anime_id: r.anime_id,
    }));
  }, [results]);

  if (results.length === 0) {
    return (
      <EmptyViz
        label="NCF HEATMAP"
        color={NCF_COLOR}
        hint="Load NCF results to render latent-space activation grid"
      />
    );
  }

  const CELL_GAP = 3;

  return (
    <div className="relative w-full h-full min-h-[360px] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 mb-3 px-1">
        <span className="font-mono text-2xs" style={{ color: NCF_COLOR }}>
          LATENT SPACE ACTIVATION — TOP 100 NCF
        </span>
        <span className="ml-auto font-mono text-2xs text-nt-muted">
          10×10 GRID
        </span>
      </div>

      {/* Grid */}
      <div
        className="relative flex-1"
        style={{ display: "grid", gridTemplateColumns: `repeat(${COLS}, 1fr)`, gap: CELL_GAP }}
      >
        {cells.map((cell) => (
          <motion.div
            key={cell.anime_id}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: cell.idx * 0.008, duration: 0.25 }}
            onMouseEnter={() => setHovered(cell)}
            onMouseLeave={() => setHovered(null)}
            className="relative aspect-square rounded-[2px] cursor-crosshair"
            style={{
              background: lerp(cell.norm),
              boxShadow: cell.norm > 0.7
                ? `0 0 ${cell.norm * 12}px ${cell.norm * 4}px ${NCF_COLOR}66`
                : "none",
              border: `1px solid ${NCF_COLOR}${Math.round(cell.norm * 60).toString(16).padStart(2, "0")}`,
            }}
          >
            {/* Score micro-label for high-activation cells */}
            {cell.norm > 0.85 && (
              <span
                className="absolute inset-0 flex items-center justify-center font-mono"
                style={{ fontSize: "0.45rem", color: NCF_COLOR, opacity: 0.9 }}
              >
                {cell.score.toFixed(2)}
              </span>
            )}
          </motion.div>
        ))}
      </div>

      {/* Colour legend */}
      <div className="mt-3 flex items-center gap-2">
        <span className="font-mono text-2xs text-nt-muted">LOW</span>
        <div
          className="flex-1 h-1.5 rounded-sm"
          style={{
            background: `linear-gradient(90deg, #0a0011, ${NCF_COLOR})`,
          }}
        />
        <span className="font-mono text-2xs" style={{ color: NCF_COLOR }}>HIGH</span>
      </div>

      {/* Hover tooltip */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 glass-panel rounded-sm border px-3 py-2 pointer-events-none"
            style={{ borderColor: NCF_COLOR + "44" }}
          >
            <p className="font-display text-2xs tracking-widest uppercase" style={{ color: NCF_COLOR }}>
              {hovered.title}
            </p>
            <div className="mt-1 flex gap-4">
              <span className="font-mono text-2xs text-nt-muted">
                ROW {hovered.row + 1} · COL {hovered.col + 1}
              </span>
              <span className="font-mono text-2xs" style={{ color: NCF_COLOR }}>
                SCORE {hovered.score.toFixed(4)}
              </span>
              <span className="font-mono text-2xs text-nt-muted">
                RANK #{hovered.idx + 1}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
