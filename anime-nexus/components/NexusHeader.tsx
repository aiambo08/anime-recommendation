"use client";
/**
 * components/NexusHeader.tsx
 * Top navigation bar — logo, model legend chips, status indicator.
 */
import { motion } from "framer-motion";
import { Activity, Database, Cpu } from "lucide-react";
import { useNexusStore } from "@/lib/store";

const MODEL_CHIPS = [
  { label: "KNN",  color: "#00f2ff", cls: "text-knn border-knn" },
  { label: "PMF",  color: "#fff000", cls: "text-pmf border-pmf" },
  { label: "BMF",  color: "#fff000", cls: "text-pmf border-pmf opacity-80" },
  { label: "NCF",  color: "#ff00ff", cls: "text-ncf border-ncf" },
] as const;

export function NexusHeader() {
  const animeLoaded  = useNexusStore((s) => s.animeData.length > 0);
  const ratingLoaded = useNexusStore((s) => s.ratingData.length > 0);

  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="sticky top-0 z-40 glass-panel border-b border-nt-border"
    >
      <div className="mx-auto flex max-w-screen-2xl items-center gap-6 px-6 py-3">

        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="relative flex h-8 w-8 items-center justify-center">
            <span className="absolute inset-0 rounded-sm bg-knn opacity-20 animate-pulse-knn" />
            <Cpu size={18} className="text-knn relative z-10" />
          </div>
          <span
            className="font-display text-sm font-bold tracking-[0.2em] text-nt-text uppercase cursor-blink"
            style={{ letterSpacing: "0.25em" }}
          >
            Anime Nexus
          </span>
        </div>

        {/* Model chips */}
        <div className="flex items-center gap-2">
          {MODEL_CHIPS.map((m) => (
            <span key={m.label} className={`nt-chip ${m.cls}`}>
              {m.label}
            </span>
          ))}
        </div>

        {/* Nav */}
        <nav className="flex items-center gap-1">
          <a
            href="/"
            className="btn-neon knn px-3 py-1 text-2xs"
            style={{ fontSize: "0.6rem" }}
          >
            HOME
          </a>
          <a
            href="/dashboard"
            className="btn-neon ncf px-3 py-1 text-2xs"
            style={{ fontSize: "0.6rem" }}
          >
            DASHBOARD
          </a>
        </nav>

        <div className="ml-auto flex items-center gap-4">
          {/* Dataset status */}
          <div className="flex items-center gap-3">
            <StatusDot
              icon={<Database size={10} />}
              label="anime.csv"
              active={animeLoaded}
            />
            <StatusDot
              icon={<Database size={10} />}
              label="rating.csv"
              active={ratingLoaded}
            />
          </div>

          {/* Live pulse */}
          <div className="flex items-center gap-1.5">
            <Activity size={12} className="text-knn" />
            <span className="nt-label text-knn">NEURAL TERMINAL v1.0</span>
          </div>
        </div>
      </div>
    </motion.header>
  );
}

function StatusDot({
  icon,
  label,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`flex h-1.5 w-1.5 rounded-full ${
          active ? "bg-knn shadow-[0_0_6px_2px_#00f2ff88]" : "bg-nt-faint"
        }`}
      />
      <span className="nt-label">{label}</span>
    </div>
  );
}
