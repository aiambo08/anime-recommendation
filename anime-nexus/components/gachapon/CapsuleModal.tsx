"use client";
/**
 * components/gachapon/CapsuleModal.tsx
 * ─────────────────────────────────────────────────────────────
 * Animated pop-up modal that reveals the Gachapon reward.
 *
 * SSR → gold pulsing glow + legendary badge + sparkle particles
 * SR  → silver/purple shimmer
 * R   → standard cyan terminal style
 */

import { motion, AnimatePresence } from "framer-motion";
import { X, Star, Zap, Award, Tv, Film } from "lucide-react";
import type { GachaResult, RarityTier } from "./useGachapon";

// ── Rarity config ─────────────────────────────────────────────

const RARITY_CONFIG: Record<
  RarityTier,
  { label: string; color: string; glow: string; bg: string; particle: string }
> = {
  SSR: {
    label:    "SSR — LEGENDARY",
    color:    "#ffd700",
    glow:     "0 0 40px 8px #ffd70088, 0 0 80px 16px #ffd70033",
    bg:       "radial-gradient(ellipse at 50% 0%, #ffd70022 0%, transparent 70%)",
    particle: "#ffd700",
  },
  SR: {
    label:    "SR — RARE",
    color:    "#c084fc",
    glow:     "0 0 24px 4px #c084fc88, 0 0 48px 8px #c084fc22",
    bg:       "radial-gradient(ellipse at 50% 0%, #c084fc18 0%, transparent 70%)",
    particle: "#c084fc",
  },
  R: {
    label:    "R — STANDARD",
    color:    "#00f2ff",
    glow:     "0 0 16px 3px #00f2ff55, 0 0 40px 6px #00f2ff22",
    bg:       "radial-gradient(ellipse at 50% 0%, #00f2ff12 0%, transparent 70%)",
    particle: "#00f2ff",
  },
};

// ── Particle component ────────────────────────────────────────

function Particle({ color, index }: { color: string; index: number }) {
  const angle  = (index / 12) * 360;
  const radius = 120 + Math.random() * 60;
  const x      = Math.cos((angle * Math.PI) / 180) * radius;
  const y      = Math.sin((angle * Math.PI) / 180) * radius;

  return (
    <motion.div
      className="absolute w-1.5 h-1.5 rounded-full pointer-events-none"
      style={{
        background: color,
        boxShadow: `0 0 6px 2px ${color}`,
        top: "50%",
        left: "50%",
      }}
      initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
      animate={{
        x,
        y,
        opacity: 0,
        scale: 0,
      }}
      transition={{
        duration: 0.8 + Math.random() * 0.5,
        delay:    index * 0.04,
        ease:     "easeOut",
      }}
    />
  );
}

// ── Stars for SSR ─────────────────────────────────────────────

function StarBurst() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-sm">
      {Array.from({ length: 8 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{
            top:   `${10 + Math.random() * 80}%`,
            left:  `${5  + Math.random() * 90}%`,
            color: "#ffd700",
          }}
          initial={{ opacity: 0, scale: 0, rotate: 0 }}
          animate={{ opacity: [0, 1, 0], scale: [0, 1.2, 0], rotate: 360 }}
          transition={{
            duration: 2,
            delay:    i * 0.15,
            repeat:   Infinity,
            repeatDelay: 1.5,
          }}
        >
          <Star size={10} fill="#ffd700" />
        </motion.div>
      ))}
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────

interface CapsuleModalProps {
  result:  GachaResult | null;
  onClose: () => void;
  onReset: () => void;
}

export function CapsuleModal({ result, onClose, onReset }: CapsuleModalProps) {
  const isOpen = result !== null;

  return (
    <AnimatePresence>
      {isOpen && result && (
        <>
          {/* ── Backdrop ── */}
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          >
            {/* Overlay */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

            {/* ── Modal card ── */}
            <motion.div
              className="relative z-10 w-full max-w-md glass-panel rounded-sm border overflow-hidden"
              style={{
                borderColor: RARITY_CONFIG[result.rarity].color + "88",
                boxShadow:   RARITY_CONFIG[result.rarity].glow,
                background:  "#111118",
              }}
              initial={{ scale: 0.5, opacity: 0, y: -40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Rarity background glow */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: RARITY_CONFIG[result.rarity].bg }}
              />

              {/* Accent stripe */}
              <div
                className="absolute inset-x-0 top-0 h-0.5"
                style={{
                  background: RARITY_CONFIG[result.rarity].color,
                  boxShadow:  `0 0 12px 2px ${RARITY_CONFIG[result.rarity].color}`,
                }}
              />

              {/* SSR extras */}
              {result.rarity === "SSR" && <StarBurst />}

              {/* Particle burst */}
              <div className="absolute top-1/2 left-1/2 pointer-events-none">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Particle
                    key={i}
                    index={i}
                    color={RARITY_CONFIG[result.rarity].particle}
                  />
                ))}
              </div>

              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-3 right-3 z-20 text-nt-muted hover:text-nt-text transition-colors"
              >
                <X size={16} />
              </button>

              {/* ── Content ── */}
              <div className="relative z-10 p-6">
                {/* Rarity badge */}
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="flex items-center gap-2 mb-4"
                >
                  {result.rarity === "SSR" ? (
                    <Award size={14} className="shrink-0" style={{ color: RARITY_CONFIG[result.rarity].color }} />
                  ) : (
                    <Zap size={14} className="shrink-0" style={{ color: RARITY_CONFIG[result.rarity].color }} />
                  )}
                  <span
                    className="nt-chip font-bold tracking-[0.2em]"
                    style={{
                      color:       RARITY_CONFIG[result.rarity].color,
                      borderColor: RARITY_CONFIG[result.rarity].color + "66",
                      ...(result.rarity === "SSR" && {
                        textShadow: `0 0 10px ${RARITY_CONFIG[result.rarity].color}`,
                        animation:  "ssr-pulse 1.5s ease-in-out infinite",
                      }),
                    }}
                  >
                    ✦ {RARITY_CONFIG[result.rarity].label} ✦
                  </span>
                </motion.div>

                {/* Capsule icon */}
                <motion.div
                  className="flex justify-center mb-5"
                  initial={{ scale: 0, rotate: -15 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 350, damping: 20 }}
                >
                  <div
                    className="relative w-20 h-20 rounded-full flex items-center justify-center"
                    style={{
                      background: `radial-gradient(circle, ${RARITY_CONFIG[result.rarity].color}33 0%, ${RARITY_CONFIG[result.rarity].color}11 60%, transparent 100%)`,
                      border:     `2px solid ${RARITY_CONFIG[result.rarity].color}66`,
                      boxShadow:  RARITY_CONFIG[result.rarity].glow,
                    }}
                  >
                    <span className="text-4xl select-none">💊</span>
                    {/* Capsule shine */}
                    <div
                      className="absolute inset-0 rounded-full pointer-events-none"
                      style={{
                        background: "linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 50%)",
                      }}
                    />
                  </div>
                </motion.div>

                {/* Title */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-center mb-4"
                >
                  <h3
                    className="font-display text-lg font-black uppercase tracking-widest leading-tight"
                    style={{
                      color:      result.rarity === "SSR" ? RARITY_CONFIG.SSR.color : "var(--color-text)",
                      textShadow: result.rarity === "SSR" ? `0 0 16px ${RARITY_CONFIG.SSR.color}` : "none",
                    }}
                  >
                    {result.entry.title}
                  </h3>
                </motion.div>

                {/* Metadata grid */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="grid grid-cols-2 gap-2 text-xs font-mono mb-5"
                >
                  {/* Score */}
                  <div
                    className="rounded-sm border p-2.5"
                    style={{ borderColor: "#1e1e2e", background: "#0a0a0a" }}
                  >
                    <p className="nt-label text-2xs mb-1">SCORE</p>
                    <p
                      className="font-bold text-sm"
                      style={{ color: RARITY_CONFIG[result.rarity].color }}
                    >
                      {result.entry.score.toFixed(4)}
                    </p>
                  </div>

                  {/* Rating */}
                  <div
                    className="rounded-sm border p-2.5"
                    style={{ borderColor: "#1e1e2e", background: "#0a0a0a" }}
                  >
                    <p className="nt-label text-2xs mb-1">RATING</p>
                    <p
                      className="font-bold text-sm"
                      style={{ color: result.entry.meta_rating !== null && result.entry.meta_rating > 8.5 ? "#ffd700" : "var(--color-text)" }}
                    >
                      {result.entry.meta_rating?.toFixed(2) ?? "N/A"}
                    </p>
                  </div>

                  {/* Type */}
                  <div
                    className="rounded-sm border p-2.5"
                    style={{ borderColor: "#1e1e2e", background: "#0a0a0a" }}
                  >
                    <p className="nt-label text-2xs mb-1">TYPE</p>
                    <div className="flex items-center gap-1">
                      {result.entry.type === "Movie" ? <Film size={10} /> : <Tv size={10} />}
                      <p className="font-bold text-sm text-nt-text truncate">{result.entry.type}</p>
                    </div>
                  </div>

                  {/* Rank */}
                  <div
                    className="rounded-sm border p-2.5"
                    style={{ borderColor: "#1e1e2e", background: "#0a0a0a" }}
                  >
                    <p className="nt-label text-2xs mb-1">MODEL RANK</p>
                    <p className="font-bold text-sm text-nt-text">
                      #{result.entry.rank ?? "–"}
                    </p>
                  </div>

                  {/* Genre — full width */}
                  <div
                    className="col-span-2 rounded-sm border p-2.5"
                    style={{ borderColor: "#1e1e2e", background: "#0a0a0a" }}
                  >
                    <p className="nt-label text-2xs mb-1">GENRES</p>
                    <p className="text-nt-text leading-snug">
                      {result.entry.genre || "Unknown"}
                    </p>
                  </div>
                </motion.div>

                {/* Model tag */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="flex items-center justify-between"
                >
                  <span className="nt-label text-2xs">
                    SOURCE: {result.entry.model} TOP-10
                  </span>
                  <button
                    onClick={() => { onClose(); onReset(); }}
                    className="btn-neon knn text-2xs"
                    style={{ padding: "0.3rem 0.8rem" }}
                  >
                    PULL AGAIN
                  </button>
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
