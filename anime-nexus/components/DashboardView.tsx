"use client";
/**
 * components/DashboardView.tsx
 * ─────────────────────────────────────────────────────────────
 * Top-level tab switcher between:
 *   TECHNICAL ANALYSIS  — KNN Graph / PMF+BMF Radar / NCF Heatmap
 *   BATTLE ROYALE       — 4-column side-by-side comparison
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart2, Swords, Gamepad2 } from "lucide-react";
import { TechnicalAnalysis }  from "./viz/TechnicalAnalysis";
import { BattleRoyale }       from "./battle/BattleRoyale";
import { GachaponMachine }    from "./gachapon/GachaponMachine";

type Mode = "technical" | "battle" | "gachapon";

const MODES: { id: Mode; label: string; sub: string; icon: React.ReactNode; color: string }[] = [
  {
    id:    "technical",
    label: "TECHNICAL ANALYSIS",
    sub:   "Force Graph · Radar · Heatmap",
    icon:  <BarChart2 size={14} />,
    color: "#00f2ff",
  },
  {
    id:    "battle",
    label: "BATTLE ROYALE",
    sub:   "4-Model Side-by-Side Comparison",
    icon:  <Swords size={14} />,
    color: "#ff00ff",
  },
  {
    id:    "gachapon",
    label: "GACHAPON",
    sub:   "Gamified Recommendation Reveal",
    icon:  <Gamepad2 size={14} />,
    color: "#ffd700",
  },
];

export function DashboardView() {
  const [mode, setMode] = useState<Mode>("technical");

  return (
    <div className="flex flex-col gap-6">
      {/* Mode switcher */}
      <div className="flex flex-col sm:flex-row gap-3">
        {MODES.map((m) => {
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className="relative flex flex-1 items-center gap-3 rounded-sm border p-4
                         transition-all duration-250 text-left overflow-hidden"
              style={{
                borderColor: active ? m.color : "#1e1e2e",
                background:  active ? m.color + "10" : "transparent",
              }}
            >
              {/* Active inset glow */}
              {active && (
                <motion.div
                  layoutId="mode-glow"
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: `radial-gradient(ellipse at left center, ${m.color}18, transparent 70%)`,
                  }}
                />
              )}

              {/* Left accent bar */}
              <div
                className="absolute left-0 inset-y-0 w-0.5"
                style={{ background: active ? m.color : "transparent" }}
              />

              <span
                className="relative z-10 shrink-0"
                style={{ color: active ? m.color : "#64748b" }}
              >
                {m.icon}
              </span>

              <div className="relative z-10">
                <p
                  className="font-display text-xs font-bold tracking-widest uppercase"
                  style={{ color: active ? m.color : "#64748b" }}
                >
                  {m.label}
                </p>
                <p className="font-mono text-2xs text-nt-muted">{m.sub}</p>
              </div>

              {active && (
                <motion.span
                  layoutId="active-chip"
                  className="ml-auto relative z-10 nt-chip"
                  style={{ color: m.color, borderColor: m.color + "55" }}
                >
                  ACTIVE
                </motion.span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content panel */}
      <div className="glass-panel rounded-sm border border-nt-border p-6 min-h-[500px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{   opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            {mode === "technical" && <TechnicalAnalysis />}
            {mode === "battle"    && <BattleRoyale />}
            {mode === "gachapon" && (
              <div className="flex flex-col items-center gap-4 py-6">
                <div className="text-center">
                  <p className="nt-label mb-2" style={{ color: "#ffd700" }}>
                    SYS://GACHAPON &gt; RANDOM_REVEAL &gt; ACTIVE
                  </p>
                  <h3 className="font-display text-xl font-black uppercase tracking-widest"
                    style={{ color: "#ffd700", textShadow: "0 0 16px #ffd70088" }}>
                    Random Pull
                  </h3>
                  <p className="mt-1 font-body text-xs text-nt-muted">
                    Drag the lever to reveal a random recommendation from the selected model's top 10.
                  </p>
                </div>
                <GachaponMachine />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
