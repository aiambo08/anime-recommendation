"use client";
/**
 * components/viz/TechnicalAnalysis.tsx
 * ─────────────────────────────────────────────────────────────
 * Quadrant 1 — tabbed container for the three technical visualisations:
 *   KNN → Force-Directed Graph
 *   PMF/BMF → Dual Radar Chart
 *   NCF → 10×10 Latent-Space Heatmap
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GitBranch, Layers, Brain } from "lucide-react";
import { KnnForceGraph } from "./KnnForceGraph";
import { PmfBmfRadar }   from "./PmfBmfRadar";
import { NcfHeatmap }    from "./NcfHeatmap";

type Tab = "KNN" | "PMF_BMF" | "NCF";

const TABS: { id: Tab; label: string; sub: string; icon: React.ReactNode; color: string }[] = [
  { id: "KNN",     label: "KNN",     sub: "Force Graph",      icon: <GitBranch size={12} />, color: "#00f2ff" },
  { id: "PMF_BMF", label: "PMF/BMF", sub: "Dual Radar",       icon: <Layers    size={12} />, color: "#fff000" },
  { id: "NCF",     label: "NCF",     sub: "Latent Heatmap",   icon: <Brain     size={12} />, color: "#ff00ff" },
];

export function TechnicalAnalysis() {
  const [active, setActive] = useState<Tab>("KNN");

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex gap-1 mb-4 border-b border-nt-border pb-3">
        {TABS.map((tab) => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className="relative flex items-center gap-2 rounded-sm px-4 py-2 transition-all duration-200"
              style={{
                background: isActive ? tab.color + "15" : "transparent",
                border:     `1px solid ${isActive ? tab.color : "#1e1e2e"}`,
              }}
            >
              <span style={{ color: isActive ? tab.color : "#64748b" }}>
                {tab.icon}
              </span>
              <span className="flex flex-col items-start">
                <span
                  className="font-display text-2xs font-bold tracking-widest uppercase"
                  style={{ color: isActive ? tab.color : "#64748b" }}
                >
                  {tab.label}
                </span>
                <span className="font-mono text-2xs text-nt-muted leading-none">
                  {tab.sub}
                </span>
              </span>
              {/* Active indicator bar */}
              {isActive && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute inset-x-0 bottom-[-13px] h-px"
                  style={{ background: tab.color }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Viz panel */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{   opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="absolute inset-0"
          >
            {active === "KNN"     && <KnnForceGraph />}
            {active === "PMF_BMF" && <PmfBmfRadar />}
            {active === "NCF"     && <NcfHeatmap />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
