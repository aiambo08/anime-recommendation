"use client";
/**
 * components/gachapon/CapsuleModal.tsx
 * ─────────────────────────────────────────────────────────────
 * Full-screen reveal modal for the Gachapon capsule result.
 * Shows the selected anime with real data from the Jikan/MAL API.
 *
 * Layout (2 columns on ≥ md):
 *   LEFT  — anime cover art from MAL (with rarity border glow)
 *   RIGHT — title, genres, synopsis, score, studio, episodes, links
 *
 * Notes on anime_id:
 *   EnrichedResult.anime_id is always a real MAL id after the
 *   joinWorker resolves internal model indices via idx2anime.json.
 *   We pass it directly to useJikanAnime.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, Star, Tv2, Clock, Users, Loader2, X, ChevronDown, ChevronUp } from "lucide-react";
import { useJikanAnime } from "@/lib/useJikanAnime";
import type { EnrichedResult } from "@/lib/store";

// ─── Rarity config ────────────────────────────────────────────

export type Rarity = "SSR" | "SR" | "R" | "N";

export interface RarityConfig {
  label:      string;
  color:      string;
  glow:       string;
  borderAnim: boolean;
}

export const RARITY: Record<Rarity, RarityConfig> = {
  SSR: {
    label:      "SSR — LEGENDARY",
    color:      "#ffd700",
    glow:       "0 0 40px 8px #ffd70066, 0 0 80px 16px #ffd70033",
    borderAnim: true,
  },
  SR: {
    label:      "SR — EPIC",
    color:      "#c084fc",
    glow:       "0 0 24px 4px #c084fc66, 0 0 60px 12px #c084fc33",
    borderAnim: false,
  },
  R: {
    label:      "R — RARE",
    color:      "#00f2ff",
    glow:       "0 0 16px 4px #00f2ff44",
    borderAnim: false,
  },
  N: {
    label:      "NORMAL",
    color:      "#64748b",
    glow:       "0 0 8px 2px #64748b33",
    borderAnim: false,
  },
};

// ─── Rarity derivation ────────────────────────────────────────

export function deriveRarity(entry: EnrichedResult): Rarity {
  const r = entry.meta_rating ?? 0;
  if (r >= 8.5)  return "SSR";
  if (r >= 7.5)  return "SR";
  if (r >= 6.0)  return "R";
  return "N";
}

// ─── Subcomponent: Metadata chip ─────────────────────────────

function Chip({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number | null; color?: string }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex items-center gap-2 rounded-sm px-3 py-1.5 border border-white/10 bg-white/5">
      <span style={{ color: color ?? "#64748b" }} className="shrink-0">{icon}</span>
      <span className="font-mono text-2xs text-nt-muted uppercase">{label}</span>
      <span className="font-mono text-2xs ml-auto" style={{ color: color ?? "white" }}>{value}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────

interface CapsuleModalProps {
  entry:   EnrichedResult;
  rarity:  Rarity;
  onClose: () => void;
}

export function CapsuleModal({ entry, rarity, onClose }: CapsuleModalProps) {
  const cfg = RARITY[rarity];
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);

  // Fetch real MAL data via Jikan — anime_id is always a real MAL id
  const { data: jikan, loading: jikanLoading } = useJikanAnime(
    entry.anime_id > 0 ? entry.anime_id : null
  );

  // Derived display values
  const title       = jikan?.title_english ?? jikan?.title ?? entry.title;
  const genres      = jikan?.genres?.map((g) => g.name) ?? entry.genre.split(",").map((g) => g.trim()).filter(Boolean);
  const studio      = jikan?.studios?.[0]?.name ?? null;
  const synopsis    = jikan?.synopsis ?? null;
  const score       = jikan?.score ?? entry.meta_rating;
  const episodes    = jikan?.episodes ?? (entry.episodes !== "?" ? Number(entry.episodes) : null);
  const status      = jikan?.status ?? null;
  const year        = jikan?.year ?? null;
  const imageUrl    = jikan?.images?.webp?.large_image_url ?? jikan?.images?.jpg?.large_image_url ?? null;
  const malUrl      = jikan ? `https://myanimelist.net/anime/${entry.anime_id}` : null;

  const shortSynopsis = synopsis ? synopsis.slice(0, 240) : null;
  const longSynopsis  = synopsis;

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
        onClick={onClose}
      >
        {/* Modal card */}
        <motion.div
          initial={{ scale: 0.7, opacity: 0, y: 40 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.8, opacity: 0, y: 20 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-sm border"
          style={{
            background:   "linear-gradient(135deg, #0a0015ee 60%, #0d001fee)",
            borderColor:  cfg.color + "66",
            boxShadow:    cfg.glow,
          }}
        >
          {/* Animated border for SSR */}
          {rarity === "SSR" && (
            <div
              className="absolute inset-0 rounded-sm pointer-events-none"
              style={{
                background: `linear-gradient(90deg, ${cfg.color}44, transparent 40%, ${cfg.color}44 60%, transparent)`,
                animation:  "border-sweep 3s linear infinite",
                opacity: 0.4,
              }}
            />
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-30 rounded-full p-1 border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
          >
            <X size={16} className="text-nt-muted" />
          </button>

          {/* Rarity header */}
          <div
            className="flex items-center gap-3 px-6 py-3 border-b"
            style={{ borderColor: cfg.color + "33", background: cfg.color + "0a" }}
          >
            <span
              className="font-display text-2xs tracking-[0.3em] uppercase font-bold"
              style={{ color: cfg.color, textShadow: `0 0 12px ${cfg.color}88` }}
            >
              {cfg.label}
            </span>
            <span className="ml-auto font-mono text-2xs text-nt-muted">
              MAL ID: {entry.anime_id}
            </span>
          </div>

          {/* Body */}
          <div className="flex flex-col md:flex-row gap-6 p-6">

            {/* LEFT — Cover art */}
            <div className="shrink-0 flex flex-col items-center gap-3 md:w-44">
              <div
                className="w-full md:w-44 h-60 rounded-sm overflow-hidden border relative"
                style={{ borderColor: cfg.color + "55", boxShadow: cfg.glow }}
              >
                {jikanLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <Loader2 size={24} style={{ color: cfg.color }} className="animate-spin" />
                  </div>
                )}
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl}
                    alt={title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : !jikanLoading ? (
                  <div
                    className="w-full h-full flex items-center justify-center font-display text-xs tracking-widest uppercase text-center px-2"
                    style={{ color: cfg.color, background: cfg.color + "11" }}
                  >
                    {title.slice(0, 30)}
                  </div>
                ) : null}
              </div>

              {/* Score badge */}
              {score !== null && (
                <div
                  className="flex items-center gap-1.5 rounded-sm px-3 py-1.5 border w-full justify-center"
                  style={{ borderColor: "#ffd70066", background: "#ffd70011" }}
                >
                  <Star size={12} fill="#ffd700" color="#ffd700" />
                  <span className="font-display text-sm font-bold" style={{ color: "#ffd700" }}>
                    {score.toFixed(2)}
                  </span>
                  <span className="font-mono text-2xs text-nt-muted">/ 10</span>
                </div>
              )}

              {/* MAL link */}
              {malUrl && (
                <a
                  href={malUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 w-full justify-center rounded-sm px-3 py-2 font-mono text-2xs uppercase tracking-widest transition-all hover:opacity-80"
                  style={{
                    border:     `1px solid ${cfg.color}66`,
                    color:       cfg.color,
                    background:  cfg.color + "11",
                  }}
                >
                  View on MAL
                  <ExternalLink size={10} />
                </a>
              )}
            </div>

            {/* RIGHT — Details */}
            <div className="flex-1 flex flex-col gap-4 min-w-0">

              {/* Title */}
              <div>
                <h2
                  className="font-display text-xl font-black uppercase tracking-wider leading-tight"
                  style={{ color: cfg.color, textShadow: `0 0 16px ${cfg.color}66` }}
                >
                  {title}
                </h2>
                {year && (
                  <p className="font-mono text-2xs text-nt-muted mt-0.5">{year}</p>
                )}
              </div>

              {/* Genres */}
              {genres.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {genres.slice(0, 8).map((g) => (
                    <span
                      key={g}
                      className="rounded-sm px-2 py-0.5 font-mono text-2xs border"
                      style={{ borderColor: cfg.color + "44", color: cfg.color, background: cfg.color + "0d" }}
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}

              {/* Stats chips */}
              <div className="grid grid-cols-2 gap-2">
                <Chip icon={<Tv2 size={11} />}    label="Type"     value={jikan?.type ?? entry.type} color={cfg.color} />
                <Chip icon={<Clock size={11} />}   label="Episodes" value={episodes}                  color={cfg.color} />
                <Chip icon={<Users size={11} />}   label="Studio"   value={studio}                    color={cfg.color} />
                <Chip icon={<Star size={11} />}    label="Status"   value={status}                    color={cfg.color} />
              </div>

              {/* Model score */}
              <div className="rounded-sm border p-3 flex items-center gap-3" style={{ borderColor: "#ffffff11" }}>
                <span className="font-mono text-2xs text-nt-muted uppercase">Model Score</span>
                <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, entry.score * 100)}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{ background: cfg.color }}
                  />
                </div>
                <span className="font-mono text-2xs" style={{ color: cfg.color }}>
                  {entry.score.toFixed(4)}
                </span>
              </div>

              {/* Synopsis */}
              {synopsis && (
                <div>
                  <p className="font-mono text-2xs text-nt-muted uppercase mb-1.5 tracking-widest">Synopsis</p>
                  <p className="font-body text-xs text-white/75 leading-relaxed">
                    {synopsisExpanded ? longSynopsis : (shortSynopsis + (synopsis.length > 240 ? "…" : ""))}
                  </p>
                  {synopsis.length > 240 && (
                    <button
                      onClick={() => setSynopsisExpanded(!synopsisExpanded)}
                      className="flex items-center gap-1 mt-2 font-mono text-2xs uppercase tracking-widest transition-opacity hover:opacity-80"
                      style={{ color: cfg.color }}
                    >
                      {synopsisExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                      {synopsisExpanded ? "Show less" : "Read more"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-between px-6 py-3 border-t"
            style={{ borderColor: cfg.color + "22" }}
          >
            <span className="font-mono text-2xs text-nt-muted">
              {entry.model} · RANK #{entry.rank ?? "—"}
            </span>
            <button
              onClick={onClose}
              className="font-mono text-2xs uppercase tracking-widest transition-opacity hover:opacity-70"
              style={{ color: cfg.color }}
            >
              [ CLOSE ]
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
