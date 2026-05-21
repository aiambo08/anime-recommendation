// components/ModelComparisonTable.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Tabla comparativa completa: RMSE, MAE, Precision@10, nDCG@10
// Lee el CSV results/models_summary.csv via API route para estar siempre
// actualizada con los últimos resultados del notebook.
// ─────────────────────────────────────────────────────────────────────────────
"use client";

import React from "react";
import { motion } from "framer-motion";

// ─── Tipos ───────────────────────────────────────────────────────────────────
export interface ModelMetric {
  model:       string;
  full_name:   string;
  paradigm:    string;
  rmse:        number;
  mae:         number;
  precision10: number | null;
  ndcg10:      number | null;
  coverage:    number;
  best_params: string;
  color:       string;
}

interface Props {
  metrics: ModelMetric[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function best(arr: (number | null)[], minimize = true): number | null {
  const nums = arr.filter((v): v is number => v !== null);
  if (!nums.length) return null;
  return minimize ? Math.min(...nums) : Math.max(...nums);
}

function cell(
  val: number | null,
  bestVal: number | null,
  color: string,
  minimize = true,
  fmt: (v: number) => string = (v) => v.toFixed(4)
) {
  if (val === null) return <span className="text-white/20 text-xs">—</span>;
  const isBest = bestVal !== null && Math.abs(val - bestVal) < 1e-6;
  return (
    <span
      className="font-mono text-xs"
      style={{
        color:      isBest ? color : undefined,
        fontWeight: isBest ? 700   : 400,
        textShadow: isBest ? `0 0 8px ${color}88` : undefined,
      }}
    >
      {fmt(val)}
      {isBest && (
        <span className="ml-1 text-[9px] opacity-60 uppercase tracking-widest">
          ★
        </span>
      )}
    </span>
  );
}

// ─── Mini bar visual ─────────────────────────────────────────────────────────
function Bar({
  val,
  max,
  color,
  minimize,
}: {
  val:      number | null;
  max:      number;
  color:    string;
  minimize: boolean;
}) {
  if (val === null) return <div className="w-full h-1 bg-white/5 rounded-full" />;
  // si menor = mejor → invertimos la barra
  const pct = minimize
    ? ((max - val) / max) * 100
    : (val / max) * 100;
  return (
    <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden mt-1">
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        whileInView={{ width: `${Math.max(4, pct)}%` }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      />
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export function ModelComparisonTable({ metrics }: Props) {
  const bestRmse  = best(metrics.map((m) => m.rmse));
  const bestMae   = best(metrics.map((m) => m.mae));
  const bestPrec  = best(metrics.map((m) => m.precision10), false);
  const bestNdcg  = best(metrics.map((m) => m.ndcg10),      false);
  const maxRmse   = Math.max(...metrics.map((m) => m.rmse));
  const maxMae    = Math.max(...metrics.map((m) => m.mae));

  const fadeUp = (i: number) => ({
    initial:     { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport:    { once: true },
    transition:  { duration: 0.45, ease: "easeOut" as const, delay: i * 0.06 },
  });

  const colHead = "py-3 px-4 text-[10px] uppercase tracking-widest text-white/30 font-normal";

  return (
    <div className="overflow-x-auto rounded-sm border border-white/10">
      <table className="w-full border-collapse text-xs">
        {/* ── Header ── */}
        <thead>
          <tr className="border-b border-white/10">
            <th className={`${colHead} text-left`}>Model</th>
            <th className={`${colHead} text-right`}>
              <span title="Root Mean Square Error — prediction accuracy">RMSE ↓</span>
            </th>
            <th className={`${colHead} text-right`}>
              <span title="Mean Absolute Error — prediction accuracy">MAE ↓</span>
            </th>
            <th className={`${colHead} text-right`}>
              <span title="Precision at 10 — ranking quality (full test-set protocol, threshold ≥ 7.0)">
                P@10 ↑
              </span>
            </th>
            <th className={`${colHead} text-right`}>
              <span title="Normalized Discounted Cumulative Gain at 10 — ranking quality">
                nDCG@10 ↑
              </span>
            </th>
            <th className={`${colHead} text-left hidden lg:table-cell`}>Paradigm</th>
            <th className={`${colHead} text-left hidden xl:table-cell`}>Best params</th>
          </tr>
        </thead>

        {/* ── Body ── */}
        <tbody>
          {metrics.map((m, i) => (
            <motion.tr
              key={m.model}
              {...fadeUp(i)}
              className="border-b border-white/[0.05] hover:bg-white/[0.025] transition-colors group"
            >
              {/* Model name */}
              <td className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      background: m.color,
                      boxShadow:  `0 0 6px 2px ${m.color}66`,
                    }}
                  />
                  <div>
                    <span className="font-bold font-mono" style={{ color: m.color }}>
                      {m.model}
                    </span>
                    <span className="ml-2 text-white/30 text-[10px] hidden sm:inline">
                      {m.full_name}
                    </span>
                  </div>
                </div>
              </td>

              {/* RMSE */}
              <td className="py-3 px-4 text-right">
                <div>
                  {cell(m.rmse, bestRmse, m.color)}
                  <Bar val={m.rmse} max={maxRmse} color={m.color} minimize={true} />
                </div>
              </td>

              {/* MAE */}
              <td className="py-3 px-4 text-right">
                <div>
                  {cell(m.mae, bestMae, m.color)}
                  <Bar val={m.mae} max={maxMae} color={m.color} minimize={true} />
                </div>
              </td>

              {/* Precision@10 */}
              <td className="py-3 px-4 text-right">
                <div>
                  {cell(m.precision10, bestPrec, m.color, false)}
                  {m.precision10 !== null && (
                    <Bar
                      val={m.precision10}
                      max={1}
                      color={m.color}
                      minimize={false}
                    />
                  )}
                </div>
              </td>

              {/* nDCG@10 */}
              <td className="py-3 px-4 text-right">
                <div>
                  {cell(m.ndcg10, bestNdcg, m.color, false)}
                  {m.ndcg10 !== null && (
                    <Bar
                      val={m.ndcg10}
                      max={1}
                      color={m.color}
                      minimize={false}
                    />
                  )}
                </div>
              </td>

              {/* Paradigm */}
              <td className="py-3 px-4 text-white/30 text-[10px] hidden lg:table-cell">
                {m.paradigm}
              </td>

              {/* Best params */}
              <td className="py-3 px-4 text-white/25 text-[10px] hidden xl:table-cell font-mono">
                {m.best_params}
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>

      {/* ── Leyenda P@10 / nDCG@10 ── */}
      <div className="px-4 py-3 border-t border-white/10 flex flex-wrap gap-4 text-[10px] text-white/25">
        <span>
          <strong className="text-white/40">P@10</strong> — fraction of top-10 recommended items
          rated ≥ 7.0 by the user (full test-set protocol, no negative sampling)
        </span>
        <span>
          <strong className="text-white/40">nDCG@10</strong> — ranking quality discounted by
          position; binary relevance (≥ 7.0)
        </span>
        <span>
          <strong className="text-white/40">★</strong> — best value in column
        </span>
        <span className="text-white/15">
          KNN / PMF / BMF ranking metrics pending unified evaluation
        </span>
      </div>
    </div>
  );
}
