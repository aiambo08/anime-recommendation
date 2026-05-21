/**
 * app/page.tsx
 * ─────────────────────────────────────────────────────────────
 * Home page — Educational overview of the recommendation system.
 *
 * Sections:
 * Hero       — Project title + brief description
 * [01]       — Results summary table (from notebook metrics)
 * [02]       — Model equations + formulas
 * [03]       — Architecture diagram / model cards
 */
"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import Script from "next/script";
import { ArrowRight, GitBranch, Layers, Brain, Cpu } from "lucide-react";
import { ModelComparisonTable } from "@/components/ModelComparisonTable";
import type { ModelMetric } from "@/components/ModelComparisonTable";

// ─── Declaración de Tipos para TypeScript ─────────────────────
declare global {
  interface Window {
    katex?: {
      render: (formula: string, element: HTMLElement, options?: any) => void;
    };
  }
}

// ─── Fallback (mostrado mientras carga la API) ──────────────────
// La fuente de verdad real es results/models_summary.csv (cargada via /api/models).
const METRICS_FALLBACK: ModelMetric[] = [
  { model: "KNN", full_name: "K-Nearest Neighbours",          paradigm: "Memory-based CF",      color: "#00f2ff", rmse: 1.3391, mae: 1.0017, precision10: null,   ndcg10: null,   coverage: 100, best_params: "k=10, cosine similarity" },
  { model: "PMF", full_name: "Probabilistic MF",               paradigm: "Model-based CF",       color: "#fff000", rmse: 1.1022, mae: 0.7312, precision10: null,   ndcg10: null,   coverage: 100, best_params: "n_factors=50, lr=0.005" },
  { model: "BMF", full_name: "Bernoulli MF",                   paradigm: "Model-based CF",       color: "#ff6b00", rmse: 1.4372, mae: 0.9900, precision10: null,   ndcg10: null,   coverage: 100, best_params: "K=10 scores, d=20" },
  { model: "GMF", full_name: "Generalised MF (NCF)",           paradigm: "Neural CF – linear",   color: "#ff00ff", rmse: 1.2204, mae: 0.9292, precision10: 0.955,  ndcg10: 0.976,  coverage: 100, best_params: "latent_dim=60, lr=0.00284" },
  { model: "MLP", full_name: "Multi-Layer Perceptron (NCF)",   paradigm: "Neural CF – non-linear",color: "#c084fc", rmse: 1.1985, mae: 0.9049, precision10: 0.9545, ndcg10: 0.9773, coverage: 100, best_params: "latent_dim=64, lr=0.00961" },
];

// ─── Formula cards (LaTeX Convertido y Optimizado) ─────────────
const FORMULAS = [
  {
    model: "KNN",
    icon: <GitBranch size={18} />,
    color: "#00f2ff",
    tagline: "K-Nearest Neighbors",
    formula: "\\hat{r}_{ui} = \\bar{r}_u + \\frac{\\sum_v  \\text{sim}(u,v) \\cdot (r_{v,i} - \\bar{r}_v) }{\\sum_v |\\text{sim}(u,v)|}",
    predict: "\\text{JMSD}(u,v) = \\text{Jaccard}(u,v) \\cdot (1 - \\text{MSD}(u,v))",
    params: "k = 10 neighbours",
    details: "User-rating vectors projected into item space. Cosine similarity identifies the k nearest items. Predictions are similarity-weighted rating deviations."
  },
  {
    model:    "PMF",
    icon:     <Layers size={18} />,
    color:    "#fff000",
    tagline:  "Gaussian Latent Factors",
    formula:  "\\hat{r}_{u,i} = p_u^T q_i",
    predict:  "",
    params:   "f = 50, lr = 0.005, \\lambda = 0.05",
    details:  "Each user/item mapped to a f-dim Gaussian latent factor. SGD minimises squared error + L2 regularisation. Score = dot product of latent vectors.",
  },
  {
    model:    "BMF",
    icon:     <Cpu size={18} />,
    color:    "#ff6b00",
    tagline:  "Binary Bernoulli Factors",
    formula:  "P(R_{u,i} \\mid U_u, V_i) = \\left\\{\\begin{matrix}\\psi(U_uV_i) & \\textrm{if } R_{u,i} = 1, \\\\ 1 - \\psi(U_uV_i) & \\textrm{if } R_{u,i} = 0. \\end{matrix}\\right\\}.",
    predict:  "P(r_{ij}=s) = \\sigma(u_i^T V_s) \\quad \\text{for } s \\in \\{1 \\dots 10\\}",
    params:   "K = 10 scores, d = 20 factors",
    details:  "Each rating value s has its own item factor matrix V_s. User factors U shared across scores. Bernoulli likelihood + variational Bayes inference.",
  },
  {
    model:    "NCF (MLP)",
    icon:     <Brain size={18} />,
    color:    "#ff00ff",
    tagline:  "Neural Collaborative Filtering",
    formula:  "a_L = \\phi_L (W_L^T a_{L-1} + b_L)",
    predict:  "\\hat{y}_{u,i} = \\sigma (h^T a_L)",
    params:   "latentdim = 64, lr = 0.0096",
    details:  "MLP captures non-linear patterns via concatenated embeddings",
  },
];

// ─── Componente Interno Renderizador de Matemáticas ───────────
interface MathRendererProps {
  formula: string;
  inline?: boolean;
  triggerRefresh?: boolean;
}

function MathRenderer({ formula, inline = false, triggerRefresh = false }: MathRendererProps) {
  const containerRef = useRef<HTMLDivElement | HTMLSpanElement>(null);

  useEffect(() => {
    if (containerRef.current && window.katex) {
      window.katex.render(formula, containerRef.current, {
        displayMode: !inline,
        throwOnError: false,
      });
    }
  }, [formula, inline, triggerRefresh]);

  if (inline) {
    return <span ref={containerRef as React.RefObject<HTMLSpanElement>} />;
  }

  return (
    <div
      ref={containerRef as React.RefObject<HTMLDivElement>}
      className="overflow-x-auto w-full py-1 scrollbar-thin"
    />
  );
}

// ─── Stagger animation preset ─────────────────────────────────
import type { Transition } from "framer-motion";

const fadeUp = (i: number): {
  initial:    { opacity: number; y: number };
  whileInView:{ opacity: number; y: number };
  viewport:   { once: boolean };
  transition: Transition;
} => ({
  initial:    { opacity: 0, y: 32 },
  whileInView:{ opacity: 1, y: 0 },
  viewport:   { once: true },
  transition: { duration: 0.55, ease: "easeOut" as const, delay: i * 0.07 },
});

// ─── Page ─────────────────────────────────────────────────────
export default function HomePage() {
  const [katexReady, setKatexReady] = useState(false);

  // ─ Datos de modelos: cargados desde /api/models (models_summary.csv) ────
  const [metrics, setMetrics] = useState<ModelMetric[]>(METRICS_FALLBACK);
  const [metricsLoading, setMetricsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((data: ModelMetric[]) => {
        if (Array.isArray(data) && data.length > 0) setMetrics(data);
      })
      .catch(() => { /* mantenemos el fallback */ })
      .finally(() => setMetricsLoading(false));
  }, []);

  // ─ Valores derivados para las stat-cards ───────────────────────────
  const bestRmse = metrics.reduce((a, b) => a.rmse < b.rmse ? a : b);
  const bestMae  = metrics.reduce((a, b) => a.mae  < b.mae  ? a : b);
  const withPrec = metrics.filter((m): m is ModelMetric & { precision10: number } => m.precision10 !== null);
  const withNdcg = metrics.filter((m): m is ModelMetric & { ndcg10: number }      => m.ndcg10      !== null);
  const bestPrec = withPrec.length ? withPrec.reduce((a, b) => a.precision10 > b.precision10 ? a : b) : null;
  const bestNdcg = withNdcg.length ? withNdcg.reduce((a, b) => a.ndcg10      > b.ndcg10      ? a : b) : null;

  // Asegura el renderizado en caso de que KaTeX ya estuviese pre-cargado globalmente
  useEffect(() => {
    if (window.katex) {
      setKatexReady(true);
    }
  }, []);

  return (
    <main className="min-h-screen bg-nt-bg text-nt-text">
      {/* Hojas de estilo cargadas directamente (React las enviará automáticamente al <head>) */}
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"
        crossOrigin="anonymous"
      />

      {/* Script del CDN cargado de forma asíncrona y segura */}
      <Script
        src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"
        crossOrigin="anonymous"
        strategy="afterInteractive"
        onLoad={() => setKatexReady(true)}
      />

      {/* ══════════ HERO ══════════ */}
      <section className="relative overflow-hidden border-b border-nt-border">
        {/* Background mesh */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 70% 60% at 50% -10%, #00f2ff0d 0%, transparent 70%), radial-gradient(ellipse 40% 50% at 80% 80%, #ff00ff08 0%, transparent 60%)",
          }}
        />
        {/* Grid pattern */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{
            backgroundImage: "linear-gradient(#00f2ff 1px,transparent 1px), linear-gradient(90deg,#00f2ff 1px,transparent 1px)",
            backgroundSize:  "48px 48px",
          }}
        />

        <div className="relative mx-auto max-w-6xl px-6 py-20">
          <motion.p
            {...fadeUp(0)}
            className="nt-label mb-4 text-2xs"
            style={{ color: "#00f2ff88" }}
          >
            SYS://NEXUS &gt; ANIME_RECOMMENDATION &gt; v2.0
          </motion.p>

          <motion.h1
            {...fadeUp(1)}
            className="font-display text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none"
            style={{
              background:          "linear-gradient(135deg, #00f2ff 0%, #c084fc 50%, #ff00ff 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Anime<br />Recommendation<br />Nexus
          </motion.h1>

          <motion.p
            {...fadeUp(2)}
            className="mt-6 max-w-2xl font-body text-sm text-nt-muted leading-relaxed"
          >
            A comparative analysis of 5 recommendation algorithms — KNN, PMF, BMF, GMF, and MLP — applied to
            the MyAnimeList dataset (6.5K anime · 73K users · 7.8M ratings).
            Evaluate their mathematical foundations, latent-space representations,
            and predictive accuracy on a unified benchmark.
          </motion.p>

          <motion.div {...fadeUp(3)} className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 rounded-sm px-5 py-2.5 font-display text-xs uppercase tracking-widest font-bold transition-all hover:opacity-80"
              style={{
                background:  "linear-gradient(135deg, #00f2ff22, #ff00ff22)",
                border:      "1px solid #00f2ff66",
                color:       "#00f2ff",
                boxShadow:   "0 0 24px 2px #00f2ff22",
              }}
            >
              Launch Dashboard
              <ArrowRight size={14} />
            </Link>
            <a
              href="https://myanimelist.net"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-sm px-5 py-2.5 font-mono text-xs uppercase tracking-widest border border-nt-border text-nt-muted hover:border-white/20 transition-colors"
            >
              MyAnimeList Dataset
            </a>
          </motion.div>
        </div>
      </section>

      {/* ══════════ [01] RESULTS SUMMARY ══════════ */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <motion.div {...fadeUp(0)} className="mb-8">
          <p className="nt-label text-2xs mb-2" style={{ color: "#00f2ff88" }}>
            [01] BENCHMARK RESULTS
          </p>
          <h2 className="font-display text-2xl font-black uppercase tracking-widest">
            Model Comparison
          </h2>
          <p className="mt-2 font-body text-xs text-nt-muted max-w-xl">
            Evaluated on a stratified 80/20 train-test split of the MAL rating dataset.
            RMSE / MAE measure prediction accuracy. Precision@10 and nDCG@10 measure
            ranking quality (full test-set protocol, relevance threshold ≥ 7.0).
          </p>
        </motion.div>

        {/* Tabla completa con ranking metrics */}
        <motion.div {...fadeUp(1)} className={metricsLoading ? "opacity-50" : ""}>
          <ModelComparisonTable metrics={metrics} />
        </motion.div>

        {/* Mini stat-cards — calculadas dinámicamente desde el CSV ────────── */}
        <motion.div {...fadeUp(2)} className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: "Best RMSE",
              value: bestRmse.rmse.toFixed(4),
              model: bestRmse.model,
              color: bestRmse.color,
              sub:   "prediction",
            },
            {
              label: "Best MAE",
              value: bestMae.mae.toFixed(4),
              model: bestMae.model,
              color: bestMae.color,
              sub:   "prediction",
            },
            {
              label: "Best P@10",
              value: bestPrec ? (bestPrec.precision10 * 100).toFixed(1) + "%" : "—",
              model: bestPrec?.model ?? "—",
              color: bestPrec?.color ?? "#ffffff",
              sub:   "ranking",
            },
            {
              label: "Best nDCG@10",
              value: bestNdcg ? (bestNdcg.ndcg10 * 100).toFixed(1) + "%" : "—",
              model: bestNdcg?.model ?? "—",
              color: bestNdcg?.color ?? "#ffffff",
              sub:   "ranking",
            },
          ].map((card, i) => (
            <motion.div
              key={card.label}
              {...fadeUp(i)}
              className="glass-panel rounded-sm border border-nt-border p-4 flex flex-col gap-1"
              style={{ borderColor: card.color + "33" }}
              whileHover={{ borderColor: card.color + "88", boxShadow: `0 0 18px 2px ${card.color}18` }}
              transition={{ duration: 0.15 }}
            >
              <span className="font-display text-[10px] uppercase tracking-widest text-white/30">{card.label}</span>
              <span
                className="font-display text-2xl font-black"
                style={{ color: card.color, textShadow: `0 0 12px ${card.color}66` }}
              >
                {card.value}
              </span>
              <span className="font-mono text-[10px] text-white/30">{card.model} · {card.sub}</span>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ══════════ [02] MODEL EQUATIONS ══════════ */}
      <section className="border-t border-nt-border">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <motion.div {...fadeUp(0)} className="mb-10">
            <p className="nt-label text-2xs mb-2" style={{ color: "#ff00ff88" }}>
              [02] MATHEMATICAL FOUNDATIONS
            </p>
            <h2 className="font-display text-2xl font-black uppercase tracking-widest">
              Algorithm Equations
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {FORMULAS.map((f, i) => (
              <motion.div
                key={f.model}
                {...fadeUp(i)}
                className="glass-panel rounded-sm border p-6 flex flex-col gap-4 group"
                style={{ borderColor: f.color + "33" }}
                whileHover={{ borderColor: f.color + "77", boxShadow: `0 0 24px 2px ${f.color}11` }}
                transition={{ duration: 0.2 }}
              >
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-sm border flex items-center justify-center shrink-0"
                    style={{ borderColor: f.color + "55", color: f.color, background: f.color + "11" }}
                  >
                    {f.icon}
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-bold uppercase tracking-widest" style={{ color: f.color }}>
                      {f.model}
                    </h3>
                    <p className="font-mono text-2xs text-nt-muted">{f.tagline}</p>
                  </div>
                </div>

                {/* Main formula (Renderizado con KaTeX) */}
                <div
                  className="rounded-sm border p-4 min-h-[70px] flex items-center"
                  style={{ borderColor: f.color + "22", background: f.color + "08" }}
                >
                  <MathRenderer formula={f.formula} triggerRefresh={katexReady} />
                </div>

                {/* Prediction formula (Renderizado con KaTeX Inline) */}
                <div>
                  <p className="font-mono text-2xs text-nt-muted uppercase mb-1.5 tracking-widest">Prediction</p>
                  <div className="font-mono text-xs text-white/90">
                    <MathRenderer formula={f.predict} inline={true} triggerRefresh={katexReady} />
                  </div>
                </div>

                {/* Optimal params */}
                <div className="flex items-center gap-2 mt-auto pt-2 border-t" style={{ borderColor: f.color + "22" }}>
                  <span className="font-mono text-2xs text-nt-muted uppercase tracking-widest">Params</span>
                  <span
                    className="ml-auto rounded-sm px-2 py-0.5 font-mono text-2xs border"
                    style={{ color: f.color, borderColor: f.color + "44", background: f.color + "0d" }}
                  >
                    {/* Permitimos soporte para símbolos LaTeX en parámetros también */}
                    <MathRenderer formula={f.params} inline={true} triggerRefresh={katexReady} />
                  </span>
                </div>

                {/* Description */}
                <p className="font-body text-xs text-nt-muted leading-relaxed">{f.details}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ [03] CTA ══════════ */}
      <section className="border-t border-nt-border">
        <div className="mx-auto max-w-6xl px-6 py-16 flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1">
            <motion.p {...fadeUp(0)} className="nt-label text-2xs mb-2" style={{ color: "#fff00088" }}>
              [03] INTERACTIVE ANALYSIS
            </motion.p>
            <motion.h2 {...fadeUp(1)} className="font-display text-3xl font-black uppercase tracking-wider">
              Explore the Dashboard
            </motion.h2>
            <motion.p {...fadeUp(2)} className="mt-3 font-body text-sm text-nt-muted max-w-md leading-relaxed">
              Load your model result CSVs to visualise KNN force graphs,
              PMF/BMF radar charts, NCF heatmaps, and run the Gachapon
              for random anime recommendations.
            </motion.p>
          </div>
          <motion.div {...fadeUp(1)} className="shrink-0">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 rounded-sm px-8 py-4 font-display text-sm uppercase tracking-widest font-bold transition-all hover:scale-105 active:scale-100"
              style={{
                background:  "linear-gradient(135deg, #00f2ff, #ff00ff)",
                color:        "#000",
                boxShadow:   "0 0 32px 4px #00f2ff44",
              }}
            >
              Launch Dashboard
              <ArrowRight size={16} />
            </Link>
          </motion.div>
        </div>
      </section>

    </main>
  );
}