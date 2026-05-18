"use client";
/**
 * components/ResultUploadZone.tsx
 * ─────────────────────────────────────────────────────────────
 * Per-model drag-drop zone that:
 *  1. Accepts a recommendation result CSV (e.g. resultados_k_optimo.csv)
 *  2. Dispatches it to useRecommendationData → joinWorker
 *  3. Shows a live progress bar while JOIN is running
 *  4. Renders an inline preview table of the top-10 enriched results
 */
import { useCallback, useState, useEffect, DragEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, CheckCircle2, AlertCircle, Loader2,
  ChevronDown, ChevronUp, X, RefreshCw,
} from "lucide-react";
import { useRecommendationData } from "@/lib/useRecommendationData";
import { useModelState } from "@/lib/useRecommendationData";
import { ModelKey } from "@/lib/store";

// ─── Accent config ────────────────────────────────────────────

const ACCENT: Record<ModelKey, { hex: string; text: string; border: string; dim: string }> = {
  KNN: { hex: "#00f2ff", text: "text-knn", border: "border-knn", dim: "bg-knn-dim" },
  PMF: { hex: "#fff000", text: "text-pmf", border: "border-pmf", dim: "bg-pmf-dim" },
  BMF: { hex: "#ff6b00", text: "text-bmf", border: "border-bmf", dim: "bg-bmf-dim" },
  NCF: { hex: "#ff00ff", text: "text-ncf", border: "border-ncf", dim: "bg-ncf-dim" },
};

// ─── Props ───────────────────────────────────────────────────

interface Props {
  model: ModelKey;
}

// ─── Component ───────────────────────────────────────────────

export function ResultUploadZone({ model }: Props) {
  const { loadResultFile, getSortedResults, clearModel } = useRecommendationData();
  const state = useModelState(model);
  const ac    = ACCENT[model];

  const [dragging,   setDragging]   = useState(false);
  const [expanded,   setExpanded]   = useState(false);
  const [toastCount, setToastCount] = useState<number | null>(null);

  // Auto-dismiss toast after 3.5 s
  useEffect(() => {
    if (toastCount === null) return;
    const t = setTimeout(() => setToastCount(null), 3500);
    return () => clearTimeout(t);
  }, [toastCount]);

  const top10 = getSortedResults(model, {}, { limit: 10, sortBy: "score", sortDir: "desc" });

  // ── File handling ─────────────────────────────────────────

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".csv")) return;
      setExpanded(false);
      loadResultFile(file, model, (count) => {
        setToastCount(count);
      });
    },
    [loadResultFile, model]
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

  const openFilePicker = () => {
    if (state.loading) return;
    const input = document.createElement("input");
    input.type   = "file";
    input.accept = ".csv";
    input.onchange = () => { if (input.files?.[0]) handleFile(input.files[0]); };
    input.click();
  };

  // ── Render ────────────────────────────────────────────────

  const hasResults = state.results.length > 0;
  const isLoading  = state.loading;

  return (
    <div className="relative flex flex-col">
      {/* Corner brackets */}
      <Corner pos="tl" color={ac.hex} />
      <Corner pos="tr" color={ac.hex} />

      {/* Drop zone */}
      <motion.div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        animate={dragging ? { scale: 1.015 } : { scale: 1 }}
        className={`
          glass-panel rounded-t-sm border-x border-t p-5 transition-all duration-200 cursor-pointer
          ${dragging || hasResults ? ac.border : "border-nt-border hover:" + ac.border}
        `}
        onClick={!hasResults ? openFilePicker : undefined}
      >
        <AnimatePresence mode="wait">
          {isLoading ? (
            <LoadingView key="loading" state={state} ac={ac} />
          ) : hasResults ? (
            <DoneView
              key="done"
              state={state}
              model={model}
              ac={ac}
              expanded={expanded}
              onToggle={() => setExpanded((v) => !v)}
              onClear={() => { clearModel(model); setExpanded(false); }}
              onReload={openFilePicker}
            />
          ) : state.error ? (
            <ErrorView key="error" error={state.error} ac={ac} onRetry={openFilePicker} />
          ) : (
            <IdleView key="idle" model={model} ac={ac} />
          )}
        </AnimatePresence>
      </motion.div>

      {/* Inline preview table */}
      <AnimatePresence>
        {expanded && hasResults && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <PreviewTable rows={top10} ac={ac} />
          </motion.div>
        )}
      </AnimatePresence>

      <Corner pos="bl" color={ac.hex} />
      <Corner pos="br" color={ac.hex} />

      {/* ── Cyberpunk success toast ─────────────────────────── */}
      <AnimatePresence>
        {toastCount !== null && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0,  scale: 1    }}
            exit={{    opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="absolute -top-14 left-0 right-0 z-50 mx-2 flex items-center gap-3
                       rounded-sm border px-4 py-2.5 backdrop-blur-md"
            style={{
              background:   `${ac.hex}0d`,
              borderColor:  ac.hex,
              boxShadow:    `0 0 16px 2px ${ac.hex}44`,
            }}
          >
            <CheckCircle2 size={14} style={{ color: ac.hex, flexShrink: 0 }} />
            <span className="font-mono text-2xs" style={{ color: ac.hex }}>
              {toastCount === 0
                ? `⚠ ${model}: 0 rows — check DevTools. Is anime.csv loaded?`
                : `${model} COMMITTED — ${toastCount.toLocaleString()} recommendations in memory`
              }
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Sub-views ────────────────────────────────────────────────

function IdleView({ model, ac }: { model: ModelKey; ac: typeof ACCENT[ModelKey] }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex items-center gap-4"
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border ${ac.border} ${ac.dim}`}>
        <Upload size={16} style={{ color: ac.hex }} />
      </div>
      <div>
        <p className={`font-display text-xs font-bold uppercase tracking-widest ${ac.text}`}>
          {model} Results
        </p>
        <p className="mt-0.5 font-mono text-2xs text-nt-muted">
          {model === "NCF"
            ? "DROP resultados_gmf_frontend.csv or resultados_mlp_frontend.csv"
            : `DROP resultados_${model.toLowerCase()}*.csv`}
        </p>
      </div>
    </motion.div>
  );
}

function LoadingView({
  state,
  ac,
}: {
  state: ReturnType<typeof useModelState>;
  ac: typeof ACCENT[ModelKey];
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex flex-col gap-3"
    >
      <div className="flex items-center gap-3">
        <Loader2 size={16} className="animate-spin" style={{ color: ac.hex }} />
        <span className="font-mono text-xs" style={{ color: ac.hex }}>
          PARSING & JOINING…
        </span>
        <span className="ml-auto font-mono text-2xs text-nt-muted">
          {state.progress}%
        </span>
      </div>
      <div className="nt-progress-track">
        <div
          className="nt-progress-bar"
          style={{ width: `${state.progress}%`, background: ac.hex }}
        />
      </div>
    </motion.div>
  );
}

function DoneView({
  state,
  model,
  ac,
  expanded,
  onToggle,
  onClear,
  onReload,
}: {
  state:     ReturnType<typeof useModelState>;
  model:     ModelKey;
  ac:        typeof ACCENT[ModelKey];
  expanded:  boolean;
  onToggle:  () => void;
  onClear:   () => void;
  onReload:  () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex items-center gap-3"
    >
      <CheckCircle2 size={16} style={{ color: ac.hex }} />
      <div className="flex-1 min-w-0">
        <p className={`font-display text-xs font-bold uppercase tracking-widest ${ac.text}`}>
          {model} — {state.results.length.toLocaleString()} recs
        </p>
        <p className="font-mono text-2xs text-nt-muted truncate">{state.fileName}</p>
      </div>
      <div className="flex items-center gap-1">
        <ActionBtn onClick={onReload}  title="Replace file">  <RefreshCw size={12} /></ActionBtn>
        <ActionBtn onClick={onClear}   title="Clear results"> <X         size={12} /></ActionBtn>
        <ActionBtn onClick={onToggle}  title="Toggle preview">
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </ActionBtn>
      </div>
    </motion.div>
  );
}

function ErrorView({
  error,
  ac,
  onRetry,
}: {
  error:   string;
  ac:      typeof ACCENT[ModelKey];
  onRetry: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex items-center gap-3"
    >
      <AlertCircle size={16} className="text-red-500 shrink-0" />
      <p className="font-mono text-2xs text-red-400 flex-1 truncate">{error}</p>
      <button
        onClick={(e) => { e.stopPropagation(); onRetry(); }}
        className="font-mono text-2xs underline"
        style={{ color: ac.hex }}
      >
        RETRY
      </button>
    </motion.div>
  );
}

// ─── Preview Table ────────────────────────────────────────────

function PreviewTable({
  rows,
  ac,
}: {
  rows: ReturnType<typeof useRecommendationData>["allResults"];
  ac:   typeof ACCENT[ModelKey];
}) {
  return (
    <div
      className="border-x border-b border-t-0 glass-panel overflow-x-auto"
      style={{ borderColor: ac.hex + "44" }}
    >
      <table className="w-full text-left">
        <thead>
          <tr style={{ borderBottom: `1px solid ${ac.hex}22` }}>
            {["#", "Title", "Genre", "Type", "Score", "MAL ★"].map((h) => (
              <th
                key={h}
                className="px-3 py-2 font-mono text-2xs uppercase tracking-widest"
                style={{ color: ac.hex }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <motion.tr
              key={r.anime_id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="border-b border-nt-border hover:bg-white/[0.02] transition-colors"
            >
              <td className="px-3 py-2 font-mono text-2xs text-nt-muted">{i + 1}</td>
              <td className="px-3 py-2 font-body text-xs text-nt-text max-w-[180px] truncate">
                {r.title}
              </td>
              <td className="px-3 py-2 font-mono text-2xs text-nt-muted max-w-[140px] truncate">
                {r.genre}
              </td>
              <td className="px-3 py-2">
                <span
                  className="nt-chip"
                  style={{ color: ac.hex, borderColor: ac.hex + "66" }}
                >
                  {r.type}
                </span>
              </td>
              <td className="px-3 py-2 font-mono text-xs" style={{ color: ac.hex }}>
                {r.score.toFixed(4)}
              </td>
              <td className="px-3 py-2 font-mono text-2xs text-nt-muted">
                {r.meta_rating?.toFixed(2) ?? "—"}
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Corner decoration ────────────────────────────────────────

function Corner({ pos, color }: { pos: "tl" | "tr" | "bl" | "br"; color: string }) {
  const t = pos.startsWith("t");
  const l = pos.endsWith("l");
  return (
    <div
      className={`absolute h-3 w-3 pointer-events-none z-10 ${t ? "top-0" : "bottom-0"} ${l ? "left-0" : "right-0"}`}
      style={{
        borderTop:    t  ? `2px solid ${color}` : "none",
        borderBottom: !t ? `2px solid ${color}` : "none",
        borderLeft:   l  ? `2px solid ${color}` : "none",
        borderRight:  !l ? `2px solid ${color}` : "none",
        opacity: 0.8,
      }}
    />
  );
}

// ─── Small action button ──────────────────────────────────────

function ActionBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick:  (e: React.MouseEvent) => void;
  title?:   string;
}) {
  return (
    <button
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      className="flex h-6 w-6 items-center justify-center rounded-sm text-nt-muted
                 hover:text-nt-text hover:bg-white/10 transition-colors"
    >
      {children}
    </button>
  );
}
