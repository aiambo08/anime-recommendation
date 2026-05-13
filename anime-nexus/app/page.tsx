"use client";
/**
 * app/page.tsx
 * ─────────────────────────────────────────────────────────────
 * Landing page — Neural Terminal hero + data ingestion + data engine.
 * Staggered Framer Motion reveal on load.
 */
import { motion, type Variants } from "framer-motion";
import { NexusHeader } from "@/components/NexusHeader";
import { CsvUploadZone } from "@/components/CsvUploadZone";
import { DataDashboard } from "@/components/DataDashboard";
import {
  ArrowRight, GitBranch, Layers, Network, Brain,
} from "lucide-react";

// ── Framer variants ───────────────────────────────────────────
const container: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.12 },
  },
};

const item: Variants = {
  hidden: { opacity: 0, y: 24 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};

// ── Model architecture cards ──────────────────────────────────
const MODEL_CARDS = [
  {
    id:    "KNN",
    name:  "K-Nearest Neighbors",
    icon:  <GitBranch size={16} />,
    color: "#00f2ff",
    desc:  "Distance-based collaborative filtering. Finds the k most similar users/items in latent space.",
  },
  {
    id:    "PMF",
    name:  "Probabilistic MF",
    icon:  <Layers size={16} />,
    color: "#fff000",
    desc:  "Latent factor model with Gaussian priors. Decomposes the interaction matrix probabilistically.",
  },
  {
    id:    "BMF",
    name:  "Bayesian MF",
    icon:  <Network size={16} />,
    color: "#fff000",
    desc:  "Uncertainty-aware factorization. Full posterior inference yields calibrated confidence intervals.",
  },
  {
    id:    "NCF",
    name:  "Neural CF",
    icon:  <Brain size={16} />,
    color: "#ff00ff",
    desc:  "Deep learning interaction model. Non-linear embedding layers replace the dot-product assumption.",
  },
] as const;

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <NexusHeader />

      <main className="flex-1 px-6 py-12 mx-auto w-full max-w-screen-2xl">
        <motion.div variants={container} initial="hidden" animate="show">

          {/* ── [00] Hero ─────────────────────────────────────── */}
          <motion.section variants={item} className="mb-16 relative">
            {/* Background glow blob */}
            <div
              className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full opacity-10 blur-3xl"
              style={{ background: "radial-gradient(circle, #00f2ff 0%, transparent 70%)" }}
            />

            <p className="nt-label mb-3 text-knn">
              SYS://INIT &gt; RECOMMENDATION_ENGINE &gt; READY
            </p>
            <h1 className="font-display text-4xl font-black uppercase leading-none tracking-[0.08em] text-nt-text md:text-6xl">
              <span className="text-glow-knn">Anime</span>
              <br />
              <span className="text-nt-muted">Recommendation</span>
              <br />
              Nexus
            </h1>
            <p className="mt-6 max-w-2xl font-body text-base text-nt-muted leading-relaxed">
              Four recommendation models —{" "}
              <span className="text-knn font-semibold">KNN</span>,{" "}
              <span className="text-pmf font-semibold">PMF</span>,{" "}
              <span className="text-pmf font-semibold">BMF</span>, and{" "}
              <span className="text-ncf font-semibold">NCF</span> — dissected
              inside a cyberpunk neural terminal. Upload your datasets to begin
              the analysis.
            </p>

            <div className="mt-8 flex items-center gap-4">
              <button className="btn-neon knn flex items-center gap-2">
                BEGIN ANALYSIS <ArrowRight size={14} />
              </button>
              <span className="nt-label">OR DROP CSV FILES BELOW</span>
            </div>
          </motion.section>

          {/* ── [01] Data Ingestion ───────────────────────────── */}
          <motion.section variants={item} className="mb-16">
            <div className="nt-label mb-4 text-nt-muted">
              [01] DATA INGESTION — UPLOAD SOURCE FILES
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <CsvUploadZone
                dataType="anime"
                label="anime.csv — Metadata"
                accent="knn"
              />
              <CsvUploadZone
                dataType="ratings"
                label="rating.csv — Interactions"
                accent="ncf"
              />
            </div>
          </motion.section>

          {/* ── [02] Data Engine ──────────────────────────────── */}
          <motion.section variants={item}>
            <DataDashboard />
          </motion.section>

          {/* ── [03] Model Architecture reference ────────────── */}
          <motion.section variants={item} className="mt-4">
            <div className="nt-label mb-4 text-nt-muted">
              [03] MODEL ARCHITECTURE — FOUR ENGINES
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {MODEL_CARDS.map((m, i) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 32 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.1, duration: 0.5, ease: "easeOut" }}
                  whileHover={{ scale: 1.03, transition: { duration: 0.2 } }}
                  className="glass-panel rounded-sm border border-nt-border p-5 relative overflow-hidden"
                >
                  {/* Accent top stripe */}
                  <div
                    className="absolute inset-x-0 top-0 h-px"
                    style={{ background: m.color, boxShadow: `0 0 8px 1px ${m.color}66` }}
                  />
                  <div className="flex items-center gap-2 mb-3">
                    <span style={{ color: m.color }}>{m.icon}</span>
                    <span
                      className="nt-chip"
                      style={{ color: m.color, borderColor: m.color + "66" }}
                    >
                      {m.id}
                    </span>
                  </div>
                  <p className="font-display text-xs font-bold uppercase tracking-widest text-nt-text mb-2">
                    {m.name}
                  </p>
                  <p className="font-body text-xs text-nt-muted leading-relaxed">
                    {m.desc}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.section>

        </motion.div>
      </main>

      {/* Footer */}
      <footer className="border-t border-nt-border px-6 py-4 mt-16">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between">
          <span className="nt-label">ANIME RECOMMENDATION NEXUS © 2024</span>
          <span className="nt-label text-knn">NEURAL TERMINAL v1.0</span>
        </div>
      </footer>
    </div>
  );
}
