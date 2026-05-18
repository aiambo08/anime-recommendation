"use client";
/**
 * components/gachapon/GachaponMachine.tsx
 * ─────────────────────────────────────────────────────────────
 * Cyberpunk-themed Gachapon vending machine.
 *
 * Lever:     Framer Motion drag constraint → snap back → triggers sequence
 * Vibration: CSS keyframe on the machine body during VIBRATING phase
 * Capsule:   Animated sphere that drops from chute during DROPPING phase
 * Modal:     CapsuleModal opens during REVEALING phase
 */

import { useRef } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
} from "framer-motion";
import { Dices, ChevronDown, AlertCircle } from "lucide-react";
import { useNexusStore, type ModelKey } from "@/lib/store";
import { useGachapon } from "./useGachapon";
import { CapsuleModal } from "./CapsuleModal";

// ── Model selector pill config ────────────────────────────────

const MODEL_OPTIONS: { key: ModelKey; color: string; label: string }[] = [
  { key: "KNN", color: "#00f2ff", label: "K-Nearest" },
  { key: "PMF", color: "#fff000", label: "Prob. MF"  },
  { key: "BMF", color: "#ff6b00", label: "Bayesian"  },
  { key: "NCF", color: "#ff00ff", label: "Neural CF" },
];

// ── Capsule colours cycle ─────────────────────────────────────

const CAPSULE_COLORS = ["#00f2ff", "#ff00ff", "#fff000", "#ff6b6b", "#c084fc"];

// ── Machine body container ────────────────────────────────────

function MachineBody({
  vibrating,
  children,
}: {
  vibrating: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      animate={
        vibrating
          ? {
              x: [0, -6, 6, -5, 5, -3, 3, 0],
              y: [0,  2,  -2,  3, -2,  1, -1, 0],
            }
          : { x: 0, y: 0 }
      }
      transition={
        vibrating
          ? { duration: 0.7, ease: "easeInOut" }
          : { duration: 0.2 }
      }
      className="relative"
    >
      {children}
    </motion.div>
  );
}

// ── Draggable Lever ───────────────────────────────────────────

interface LeverProps {
  onPull:      () => void;
  disabled:    boolean;
  accentColor: string;
}

function Lever({ onPull, disabled, accentColor }: LeverProps) {
  const leverY    = useMotionValue(0);
  const rotation  = useTransform(leverY, [0, 120], [0, 60]);
  const isDragging = useRef(false);
  const hasFired   = useRef(false);

  function handleDragEnd() {
    isDragging.current = false;
    if (!hasFired.current && leverY.get() > 60 && !disabled) {
      hasFired.current = true;
      onPull();
    }
    animate(leverY, 0, { type: "spring", stiffness: 400, damping: 22 });
    // reset fire flag after snap-back
    setTimeout(() => { hasFired.current = false; }, 400);
  }

  return (
    <div className="relative flex flex-col items-center select-none">
      {/* Lever shaft */}
      <motion.div
        drag={disabled ? false : "y"}
        dragConstraints={{ top: 0, bottom: 120 }}
        dragElastic={0.1}
        style={{ y: leverY, rotate: rotation, originY: 0 }}
        onDragStart={() => { isDragging.current = true; }}
        onDragEnd={handleDragEnd}
        className="relative cursor-grab active:cursor-grabbing"
      >
        {/* Shaft body */}
        <div
          className="w-3 rounded-full mx-auto"
          style={{
            height: 80,
            background: `linear-gradient(180deg, ${accentColor}cc 0%, ${accentColor}55 100%)`,
            boxShadow: `0 0 8px 2px ${accentColor}66`,
            opacity: disabled ? 0.35 : 1,
          }}
        />
        {/* Knob */}
        <div
          className="w-8 h-8 rounded-full -mt-1 mx-auto flex items-center justify-center"
          style={{
            background: `radial-gradient(circle, ${accentColor} 0%, ${accentColor}88 60%, transparent 100%)`,
            boxShadow: disabled ? "none" : `0 0 14px 4px ${accentColor}99, 0 0 28px 8px ${accentColor}44`,
          }}
        >
          <div
            className="w-3 h-3 rounded-full"
            style={{
              background: "rgba(255,255,255,0.6)",
              boxShadow: "0 0 4px 1px rgba(255,255,255,0.4)",
            }}
          />
        </div>
      </motion.div>

      {/* Pull hint */}
      <motion.div
        className="mt-2 flex flex-col items-center gap-0.5"
        animate={disabled ? { opacity: 0.2 } : { opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <ChevronDown size={12} style={{ color: accentColor }} />
        <span className="nt-label text-2xs" style={{ color: accentColor }}>
          PULL
        </span>
      </motion.div>
    </div>
  );
}

// ── Capsule display window ────────────────────────────────────

function GachaBall({
  dropping,
  accentColor,
}: {
  dropping: boolean;
  accentColor: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-sm border"
      style={{
        width: 100,
        height: 100,
        borderColor: accentColor + "55",
        background: "#0a0a0a",
        boxShadow: `inset 0 0 20px ${accentColor}22`,
      }}
    >
      {/* Grid lines */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            `linear-gradient(${accentColor}11 1px, transparent 1px),
             linear-gradient(90deg, ${accentColor}11 1px, transparent 1px)`,
          backgroundSize: "20px 20px",
        }}
      />

      {/* Capsule ball */}
      <AnimatedCapsule dropping={dropping} color={accentColor} />

      {/* Chute opening at bottom */}
      <div
        className="absolute bottom-0 inset-x-0 h-6 flex items-center justify-center"
        style={{
          background: `linear-gradient(180deg, transparent 0%, ${accentColor}11 100%)`,
          borderTop: `1px solid ${accentColor}33`,
        }}
      >
        <div
          className="w-10 h-0.5 rounded-full"
          style={{ background: accentColor + "66" }}
        />
      </div>
    </div>
  );
}

function AnimatedCapsule({ dropping, color }: { dropping: boolean; color: string }) {
  // Pick a random capsule color on each drop
  const capsuleColor = CAPSULE_COLORS[Math.floor(Math.random() * CAPSULE_COLORS.length)];

  return (
    <motion.div
      className="absolute"
      style={{
        width:  44,
        height: 44,
        left:   "50%",
        x:      "-50%",
        y:      dropping ? 0 : -80,
        top:    dropping ? 28 : -44,
      }}
      initial={{ y: -80 }}
      animate={dropping ? { y: [0, -10, 0, -6, 0], scale: [1, 1.1, 0.95, 1.05, 1] } : { y: -80 }}
      transition={
        dropping
          ? { duration: 0.6, ease: "easeIn", times: [0, 0.3, 0.55, 0.75, 1] }
          : { duration: 0.3 }
      }
    >
      {/* Capsule sphere */}
      <div
        className="w-full h-full rounded-full"
        style={{
          background: `radial-gradient(circle at 35% 30%, ${capsuleColor}ee 0%, ${capsuleColor}88 40%, ${capsuleColor}44 70%, transparent 100%)`,
          boxShadow:  `0 0 16px 4px ${capsuleColor}88, 0 0 32px 8px ${capsuleColor}33`,
          border:     `2px solid ${capsuleColor}cc`,
        }}
      >
        {/* Specular shine */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: "radial-gradient(ellipse at 35% 25%, rgba(255,255,255,0.45) 0%, transparent 50%)",
          }}
        />
        {/* Bottom shadow */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: "radial-gradient(ellipse at 65% 80%, rgba(0,0,0,0.5) 0%, transparent 50%)",
          }}
        />
      </div>
    </motion.div>
  );
}

// ── Pre-loaded capsules display ───────────────────────────────

function CapsuleStock({ accentColor }: { accentColor: string }) {
  return (
    <div className="flex gap-1.5 flex-wrap justify-center max-w-[120px]">
      {CAPSULE_COLORS.map((c, i) => (
        <div
          key={i}
          className="w-4 h-4 rounded-full"
          style={{
            background: `radial-gradient(circle at 35% 30%, ${c}dd, ${c}55)`,
            boxShadow:  `0 0 6px 1px ${c}66`,
            opacity:    0.7 + i * 0.06,
          }}
        />
      ))}
      <span className="nt-label text-2xs w-full text-center mt-0.5" style={{ color: accentColor + "88" }}>
        STOCK: ∞
      </span>
    </div>
  );
}

// ── Main Machine component ────────────────────────────────────

export function GachaponMachine() {
  const models = useNexusStore((s) => s.models);
  const {
    state,
    isAnimating,
    hasData,
    selectModel,
    pull,
    dismiss,
    reset,
  } = useGachapon();

  const accentColor =
    MODEL_OPTIONS.find((m) => m.key === state.selectedModel)?.color ?? "#00f2ff";

  const isVibrating = state.phase === "VIBRATING";
  const isDropping  = state.phase === "DROPPING";
  const isRevealing = state.phase === "REVEALING";

  return (
    <div className="flex flex-col items-center gap-6">

      {/* ── Model Selector ── */}
      <div className="flex flex-wrap gap-2 justify-center">
        {MODEL_OPTIONS.map((m) => {
          const active  = state.selectedModel === m.key;
          const hasRecs = models[m.key].results.length > 0;
          return (
            <button
              key={m.key}
              disabled={isAnimating}
              onClick={() => selectModel(m.key)}
              className="nt-chip transition-all duration-200"
              style={{
                color:       active ? m.color : "#64748b",
                borderColor: active ? m.color + "99" : "#1e1e2e",
                background:  active ? m.color + "12" : "transparent",
                boxShadow:   active ? `0 0 10px 2px ${m.color}33` : "none",
                opacity:     isAnimating ? 0.5 : 1,
                cursor:      isAnimating ? "not-allowed" : "pointer",
              }}
            >
              {m.key}
              {!hasRecs && (
                <span className="ml-1 text-nt-muted opacity-60">✕</span>
              )}
            </button>
          );
        })}
      </div>

      {/* No-data warning */}
      {!hasData && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-xs font-mono"
          style={{ color: "#64748b" }}
        >
          <AlertCircle size={12} />
          <span>Load {state.selectedModel} results in the Dashboard first</span>
        </motion.div>
      )}

      {/* ── Machine body ── */}
      <MachineBody vibrating={isVibrating}>
        <div
          className="relative rounded-sm border"
          style={{
            width: 260,
            borderColor: accentColor + "44",
            background:  "#111118",
            boxShadow:   `0 0 32px 4px ${accentColor}22, 0 0 80px 16px ${accentColor}0a`,
          }}
        >
          {/* Top accent stripe */}
          <div
            className="absolute inset-x-0 top-0 h-0.5"
            style={{
              background: accentColor,
              boxShadow:  `0 0 10px 2px ${accentColor}`,
            }}
          />

          {/* Machine header */}
          <div
            className="px-4 py-3 flex items-center justify-between border-b"
            style={{ borderColor: accentColor + "22" }}
          >
            <div className="flex items-center gap-2">
              <Dices size={14} style={{ color: accentColor }} />
              <span className="font-display text-xs font-bold uppercase tracking-widest" style={{ color: accentColor }}>
                GACHAPON
              </span>
            </div>
            <span className="nt-chip text-2xs" style={{ color: accentColor, borderColor: accentColor + "55" }}>
              {state.selectedModel}
            </span>
          </div>

          {/* Machine glass globe */}
          <div className="px-4 pt-4 pb-3 flex items-center justify-center">
            <div
              className="relative rounded-t-full overflow-hidden"
              style={{
                width:   180,
                height:  180,
                background: `radial-gradient(ellipse at 40% 30%, ${accentColor}18 0%, #0a0a0a 70%)`,
                border:  `2px solid ${accentColor}33`,
                boxShadow: `inset 0 0 40px ${accentColor}11`,
              }}
            >
              {/* Globe shine */}
              <div
                className="absolute inset-0"
                style={{
                  background: "radial-gradient(ellipse at 35% 20%, rgba(255,255,255,0.07) 0%, transparent 50%)",
                }}
              />

              {/* Floating mini capsules */}
              <div className="absolute inset-0 flex items-center justify-center">
                {CAPSULE_COLORS.map((c, i) => (
                  <motion.div
                    key={i}
                    className="absolute rounded-full"
                    style={{
                      width:   20 + i * 4,
                      height:  20 + i * 4,
                      background: `radial-gradient(circle at 35% 30%, ${c}cc, ${c}55)`,
                      boxShadow:  `0 0 8px 2px ${c}66`,
                      left: `${15 + (i % 3) * 28}%`,
                      top:  `${20 + Math.floor(i / 3) * 30}%`,
                    }}
                    animate={{
                      y: [0, -8, 0],
                      rotate: [0, 10, -8, 0],
                    }}
                    transition={{
                      duration:    2.5 + i * 0.4,
                      repeat:      Infinity,
                      ease:        "easeInOut",
                      delay:       i * 0.3,
                    }}
                  />
                ))}
              </div>

              {/* Phase label overlay */}
              <div className="absolute bottom-3 inset-x-0 flex justify-center">
                <span
                  className="nt-label text-2xs"
                  style={{ color: accentColor + "88" }}
                >
                  {state.phase === "IDLE" || state.phase === "DONE"
                    ? "READY"
                    : state.phase.replace("_", " ")}
                </span>
              </div>
            </div>
          </div>

          {/* Chute + capsule drop window */}
          <div
            className="mx-auto flex items-center justify-center py-3 border-t border-b"
            style={{ borderColor: accentColor + "22" }}
          >
            <GachaBall dropping={isDropping} accentColor={accentColor} />
          </div>

          {/* Bottom section: stock + lever */}
          <div className="px-4 py-4 flex items-end justify-between">
            <CapsuleStock accentColor={accentColor} />

            {/* Lever housing */}
            <div
              className="flex flex-col items-center gap-1 px-3 pt-2 pb-1 rounded-sm border"
              style={{
                borderColor: accentColor + "33",
                background:  "#0a0a0a",
              }}
            >
              <span className="nt-label text-2xs mb-1" style={{ color: accentColor + "66" }}>
                LEVER
              </span>
              <Lever
                onPull={pull}
                disabled={!hasData || isAnimating}
                accentColor={accentColor}
              />
            </div>
          </div>

          {/* Status bar */}
          <div
            className="px-4 py-2 border-t flex items-center gap-2"
            style={{ borderColor: accentColor + "22" }}
          >
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: hasData ? "#22c55e" : "#64748b",
                boxShadow:  hasData ? "0 0 6px 2px #22c55e88" : "none",
                animation:  hasData ? "pulse-status 2s infinite" : "none",
              }}
            />
            <span className="nt-label text-2xs">
              {hasData
                ? `${models[state.selectedModel].results.length} RESULTS LOADED`
                : "NO DATA — LOAD CSV"}
            </span>
          </div>

          {/* Bottom accent stripe */}
          <div
            className="h-0.5"
            style={{
              background: `linear-gradient(90deg, transparent, ${accentColor}88, transparent)`,
            }}
          />
        </div>
      </MachineBody>

      {/* ── Instructions + click-to-pull alternative ── */}
      <div className="flex flex-col items-center gap-2">
        <p className="nt-label text-2xs text-center max-w-xs" style={{ color: "#334155" }}>
          SELECT MODEL → DRAG LEVER DOWN → RELEASE → REVEAL
        </p>
        <button
          disabled={!hasData || isAnimating}
          onClick={pull}
          className="nt-chip text-2xs uppercase tracking-widest transition-all"
          style={{
            color:       hasData && !isAnimating ? accentColor : "#334155",
            borderColor: hasData && !isAnimating ? accentColor + "55" : "#1e1e2e",
            background:  hasData && !isAnimating ? accentColor + "0d" : "transparent",
            cursor:      !hasData || isAnimating ? "not-allowed" : "pointer",
            opacity:     !hasData || isAnimating ? 0.4 : 1,
          }}
        >
          <ChevronDown size={10} className="inline mr-1" />
          Click to Pull
        </button>
      </div>

      {/* ── Result Modal ── */}
      {isRevealing && state.result && (
        <CapsuleModal
          entry={state.result.entry}
          rarity={state.result.rarity as "SSR" | "SR" | "R" | "N"}
          onClose={dismiss}
        />
      )}
    </div>
  );
}
