"use client";
/**
 * components/DashboardUploadPanel.tsx
 * ─────────────────────────────────────────────────────────────
 * Compact upload panel shown inside the Dashboard when one or
 * more model result CSVs are not yet loaded.
 *
 * Features:
 *  • Shows only models that are NOT yet loaded (hides once complete)
 *  • Drag-drop or click-to-browse for each missing model
 *  • Wires directly into useRecommendationData → joinWorker
 *  • Cyberpunk minimal design — does not dominate the layout
 */
import { useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { useRecommendationData, useModelState } from "@/lib/useRecommendationData";
import { ModelKey } from "@/lib/store";

const MODELS: ModelKey[] = ["KNN", "PMF", "BMF", "NCF"];

const ACCENT: Record<ModelKey, { hex: string; dimBg: string }> = {
  KNN: { hex: "#00f2ff", dimBg: "#00f2ff0d" },
  PMF: { hex: "#fff000", dimBg: "#fff0000d" },
  BMF: { hex: "#d4b800", dimBg: "#d4b8000d" },
  NCF: { hex: "#ff00ff", dimBg: "#ff00ff0d" },
};

// ── Per-model compact upload slot ─────────────────────────────

function ModelUploadSlot({ model }: { model: ModelKey }) {
  const { loadResultFile } = useRecommendationData();
  const state = useModelState(model);
  const ac    = ACCENT[model];
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".csv")) return;
      loadResultFile(file, model);
    },
    [loadResultFile, model]
  );

  const openPicker = () => inputRef.current?.click();

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  // Already loaded → compact success row
  if (state.results.length > 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-2 px-3 py-2 rounded-sm border"
        style={{ borderColor: ac.hex + "55", background: ac.dimBg }}
      >
        <CheckCircle2 size={12} style={{ color: ac.hex }} />
        <span className="font-mono text-2xs font-bold" style={{ color: ac.hex }}>{model}</span>
        <span className="font-mono text-2xs text-nt-muted ml-auto">
          {state.results.length.toLocaleString()} recs
        </span>
      </motion.div>
    );
  }

  // Loading
  if (state.loading) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-sm border"
        style={{ borderColor: ac.hex + "55", background: ac.dimBg }}
      >
        <Loader2 size={12} className="animate-spin" style={{ color: ac.hex }} />
        <span className="font-mono text-2xs" style={{ color: ac.hex }}>{model} — {state.progress}%</span>
        <div className="flex-1 h-0.5 bg-white/10 rounded-full overflow-hidden ml-2">
          <motion.div
            className="h-full"
            style={{ background: ac.hex }}
            animate={{ width: `${state.progress}%` }}
          />
        </div>
      </div>
    );
  }

  // Error
  if (state.error) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-sm border cursor-pointer"
        style={{ borderColor: "#ef444455" }}
        onClick={openPicker}
      >
        <AlertCircle size={12} className="text-red-400 shrink-0" />
        <span className="font-mono text-2xs text-red-400 flex-1 truncate">{model}: {state.error}</span>
        <span className="font-mono text-2xs underline" style={{ color: ac.hex }}>RETRY</span>
        <input ref={inputRef} type="file" accept=".csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </div>
    );
  }

  // Idle — droppable slot
  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onClick={openPicker}
      className="flex items-center gap-2 px-3 py-2 rounded-sm border cursor-pointer transition-colors"
      style={{ borderColor: ac.hex + "33", background: "transparent" }}
      whileFocus={{ borderColor: ac.hex }}
    >
      <Upload size={11} style={{ color: ac.hex, opacity: 0.7 }} />
      <span className="font-mono text-2xs" style={{ color: ac.hex + "aa" }}>
        {model}
      </span>
      <span className="font-mono text-2xs text-nt-muted ml-1">
        DROP resultados_{model.toLowerCase()}*.csv
      </span>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
    </motion.div>
  );
}

// ── Main panel ────────────────────────────────────────────────

export function DashboardUploadPanel() {
  // Count missing models
  const { modelStates } = useRecommendationData();
  const missingCount = MODELS.filter((m) => modelStates[m].results.length === 0).length;

  // If everything is loaded, render nothing — the panel collapses away
  if (missingCount === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-6 rounded-sm border border-nt-border glass-panel p-4"
      >
        <div className="flex items-center gap-2 mb-3">
          {/* Blinking dot */}
          <span className="flex h-1.5 w-1.5 rounded-full bg-knn animate-pulse-knn" />
          <p className="nt-label text-nt-muted">
            WAITING FOR ALGORITHM DATA — {missingCount} MODEL{missingCount > 1 ? "S" : ""} MISSING
          </p>
          <span className="ml-auto font-mono text-2xs text-nt-muted">
            Upload CSVs here or on the{" "}
            <a href="/" className="text-knn underline underline-offset-2">home page</a>
          </span>
        </div>

        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
          {MODELS.map((m) => (
            <ModelUploadSlot key={m} model={m} />
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
