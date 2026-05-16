"use client";
/**
 * components/CsvUploadZone.tsx
 * ─────────────────────────────────────────────────────────────
 * Drag-and-drop / click upload zone for anime.csv and rating.csv.
 * Dispatches parsing to the Web Worker via useCsvWorker().
 */
import { useCallback, useState, DragEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useCsvWorker } from "@/lib/useCsvWorker";
import { useNexusStore } from "@/lib/store";

type DataType = "anime" | "ratings";

interface Props {
  dataType: DataType;
  accept?:  string;
  label:    string;
  accent:   "knn" | "pmf" | "ncf";
}

const ACCENT_MAP = {
  knn: {
    border: "border-knn",
    text:   "text-knn",
    glow:   "glow-knn",
    pulse:  "animate-pulse-knn",
    bg:     "bg-knn-dim",
    hex:    "#00f2ff",
  },
  pmf: {
    border: "border-pmf",
    text:   "text-pmf",
    glow:   "glow-pmf",
    pulse:  "animate-pulse-pmf",
    bg:     "bg-pmf-dim",
    hex:    "#fff000",
  },
  ncf: {
    border: "border-ncf",
    text:   "text-ncf",
    glow:   "glow-ncf",
    pulse:  "animate-pulse-ncf",
    bg:     "bg-ncf-dim",
    hex:    "#ff00ff",
  },
} as const;

export function CsvUploadZone({ dataType, label, accent, accept = ".csv" }: Props) {
  const { parse }     = useCsvWorker();
  const [dragging, setDragging] = useState(false);
  const ac = ACCENT_MAP[accent];

  const loading  = useNexusStore((s) =>
    dataType === "anime" ? s.loadingAnime : s.loadingRatings
  );
  const error   = useNexusStore((s) =>
    dataType === "anime" ? s.errorAnime : s.errorRatings
  );
  const progress = useNexusStore((s) => s.ratingProgress);
  const rowCount = useNexusStore((s) =>
    dataType === "anime" ? s.animeData.length : s.ratingData.length
  );
  const done = rowCount > 0;

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".csv")) return;
      parse(file, dataType);
    },
    [parse, dataType]
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="relative">
      {/* Corner decorations */}
      <Corner pos="tl" color={ac.hex} />
      <Corner pos="tr" color={ac.hex} />
      <Corner pos="bl" color={ac.hex} />
      <Corner pos="br" color={ac.hex} />

      <motion.div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        whileHover={{ scale: 1.01 }}
        animate={dragging ? { scale: 1.02 } : { scale: 1 }}
        className={`
          relative cursor-pointer overflow-hidden rounded-sm glass-panel
          border p-8 text-center transition-all duration-300
          ${dragging ? `${ac.border} ${ac.glow}` : "border-nt-border hover:" + ac.border}
          ${done ? ac.border : ""}
        `}
        onClick={() => {
          if (loading || done) return;
          const input = document.createElement("input");
          input.type = "file";
          input.accept = accept;
          input.onchange = () => {
            const f = input.files?.[0];
            if (f) handleFile(f);
          };
          input.click();
        }}
      >
        <AnimatePresence mode="wait">
          {done ? (
            <SuccessState key="done" rowCount={rowCount} label={label} ac={ac} />
          ) : loading ? (
            <LoadingState key="loading" dataType={dataType} progress={progress} ac={ac} />
          ) : error ? (
            <ErrorState key="error" error={error} ac={ac} />
          ) : (
            <IdleState key="idle" label={label} ac={ac} accept={accept} />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// ── Sub-states ────────────────────────────────────────────────

function IdleState({ label, ac, accept }: { label: string; ac: typeof ACCENT_MAP[keyof typeof ACCENT_MAP]; accept: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex flex-col items-center gap-4"
    >
      <div className={`flex h-14 w-14 items-center justify-center rounded-sm border ${ac.border} ${ac.bg}`}>
        <Upload size={22} style={{ color: ac.hex }} />
      </div>
      <div>
        <p className={`font-display text-xs font-semibold tracking-widest uppercase ${ac.text}`}>
          {label}
        </p>
        <p className="mt-1 font-mono text-2xs text-nt-muted">
          DROP {accept.toUpperCase()} OR CLICK TO BROWSE
        </p>
      </div>
    </motion.div>
  );
}

function LoadingState({ dataType, progress, ac }: { dataType: DataType; progress: number; ac: typeof ACCENT_MAP[keyof typeof ACCENT_MAP] }) {
  const pct = dataType === "ratings" ? progress : undefined;
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex flex-col items-center gap-4"
    >
      <Loader2 size={28} style={{ color: ac.hex }} className="animate-spin" />
      <p className={`font-mono text-xs tracking-widest ${ac.text}`}>PARSING…</p>
      {pct !== undefined && (
        <div className="w-full max-w-xs">
          <div className="nt-progress-track">
            <div
              className="nt-progress-bar"
              style={{ width: `${pct}%`, background: ac.hex }}
            />
          </div>
          <p className="mt-1 font-mono text-2xs text-nt-muted text-right">{pct}%</p>
        </div>
      )}
    </motion.div>
  );
}

function SuccessState({ rowCount, label, ac }: { rowCount: number; label: string; ac: typeof ACCENT_MAP[keyof typeof ACCENT_MAP] }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
      className="flex flex-col items-center gap-3"
    >
      <CheckCircle2 size={28} style={{ color: ac.hex }} />
      <p className={`font-display text-xs font-semibold tracking-widest uppercase ${ac.text}`}>
        {label}
      </p>
      <span className={`nt-chip ${ac.text} ${ac.border}`}>
        {rowCount.toLocaleString()} ROWS LOADED
      </span>
    </motion.div>
  );
}

function ErrorState({ error, ac }: { error: string; ac: typeof ACCENT_MAP[keyof typeof ACCENT_MAP] }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex flex-col items-center gap-3"
    >
      <AlertCircle size={28} className="text-red-500" />
      <p className="font-mono text-xs text-red-400 max-w-xs truncate">{error}</p>
      <p className="font-mono text-2xs text-nt-muted">CLICK TO RETRY</p>
    </motion.div>
  );
}

// ── Corner decoration ─────────────────────────────────────────
function Corner({ pos, color }: { pos: "tl" | "tr" | "bl" | "br"; color: string }) {
  const isTop   = pos.startsWith("t");
  const isLeft  = pos.endsWith("l");
  return (
    <div
      className={`absolute h-3 w-3 pointer-events-none z-10 ${
        isTop ? "top-0" : "bottom-0"
      } ${isLeft ? "left-0" : "right-0"}`}
      style={{
        borderTop:    isTop   ? `2px solid ${color}` : "none",
        borderBottom: !isTop  ? `2px solid ${color}` : "none",
        borderLeft:   isLeft  ? `2px solid ${color}` : "none",
        borderRight:  !isLeft ? `2px solid ${color}` : "none",
        opacity: 0.8,
      }}
    />
  );
}
