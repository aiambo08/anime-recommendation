"use client";
/**
 * components/viz/PmfBmfRadar.tsx
 * ─────────────────────────────────────────────────────────────
 * Dual Radar Chart — PMF (solid) + BMF (semi-transparent uncertainty area).
 *
 * Axes = top-8 genres across both models' results.
 * PMF metric  = average score for that genre
 * BMF metric  = same, rendered as a semi-transparent shaded region
 *               to convey Bayesian posterior "width" (uncertainty).
 *
 * Built with Recharts RadarChart — no custom canvas, fully responsive.
 */
import { useMemo } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, ResponsiveContainer, Legend, Tooltip,
} from "recharts";
import { useModelResults } from "@/lib/useRecommendationData";
import { parseGenres } from "@/lib/store";
import { EmptyViz } from "./KnnForceGraph";

const PMF_COLOR = "#fff000";
const BMF_COLOR = "#ffcc00";

// ─── Build per-genre score averages ──────────────────────────

function genreScoreMap(results: ReturnType<typeof useModelResults>) {
  const totals: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const r of results) {
    for (const g of parseGenres(r.genre)) {
      totals[g] = (totals[g] ?? 0) + r.score;
      counts[g] = (counts[g] ?? 0) + 1;
    }
  }
  const map: Record<string, number> = {};
  for (const g in totals) map[g] = totals[g] / counts[g];
  return map;
}

// Normalise values to 0–100 for radar display
function normalise(val: number, max: number) {
  return max === 0 ? 0 : (val / max) * 100;
}

// ─── Component ────────────────────────────────────────────────

export function PmfBmfRadar() {
  const pmfResults = useModelResults("PMF");
  const bmfResults = useModelResults("BMF");

  const chartData = useMemo(() => {
    const pmfMap = genreScoreMap(pmfResults);
    const bmfMap = genreScoreMap(bmfResults);

    // Union of top genres across both models
    const allGenres = Array.from(
      new Set([
        ...Object.keys(pmfMap).sort((a, b) => (pmfMap[b] ?? 0) - (pmfMap[a] ?? 0)).slice(0, 8),
        ...Object.keys(bmfMap).sort((a, b) => (bmfMap[b] ?? 0) - (bmfMap[a] ?? 0)).slice(0, 8),
      ])
    ).slice(0, 10);

    const maxPmf = Math.max(...allGenres.map((g) => pmfMap[g] ?? 0), 0.0001);
    const maxBmf = Math.max(...allGenres.map((g) => bmfMap[g] ?? 0), 0.0001);
    const globalMax = Math.max(maxPmf, maxBmf);

    return allGenres.map((genre) => ({
      genre,
      PMF:        normalise(pmfMap[genre] ?? 0, globalMax),
      BMF:        normalise(bmfMap[genre] ?? 0, globalMax),
      // BMF uncertainty band (±15% of value to simulate posterior width)
      BMF_upper:  Math.min(normalise((bmfMap[genre] ?? 0) * 1.15, globalMax), 100),
      BMF_lower:  Math.max(normalise((bmfMap[genre] ?? 0) * 0.85, globalMax), 0),
    }));
  }, [pmfResults, bmfResults]);

  const hasData = pmfResults.length > 0 || bmfResults.length > 0;

  if (!hasData) {
    return (
      <EmptyViz
        label="PMF / BMF RADAR"
        color={PMF_COLOR}
        hint="Load PMF and/or BMF results to render genre radar"
      />
    );
  }

  return (
    <div className="w-full h-full min-h-[360px] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 mb-2 px-1">
        <span className="font-mono text-2xs" style={{ color: PMF_COLOR }}>
          ▬ PMF (SOLID)
        </span>
        <span className="font-mono text-2xs" style={{ color: BMF_COLOR, opacity: 0.7 }}>
          ▬ BMF (UNCERTAINTY BAND)
        </span>
        <span className="ml-auto font-mono text-2xs text-nt-muted">
          {chartData.length} genre axes
        </span>
      </div>

      <ResponsiveContainer width="100%" height="100%" minHeight={320}>
        <RadarChart data={chartData} outerRadius="70%">
          <PolarGrid
            stroke="#1e1e2e"
            strokeDasharray="3 3"
          />
          <PolarAngleAxis
            dataKey="genre"
            tick={{
              fill: "#64748b",
              fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          />
          <PolarRadiusAxis
            angle={30}
            domain={[0, 100]}
            tick={{ fill: "#334155", fontSize: 8 }}
            tickCount={4}
          />

          {/* BMF uncertainty band — rendered as two transparent radars */}
          <Radar
            name="BMF upper"
            dataKey="BMF_upper"
            stroke="none"
            fill={BMF_COLOR}
            fillOpacity={0.08}
            legendType="none"
          />
          <Radar
            name="BMF lower"
            dataKey="BMF_lower"
            stroke="none"
            fill="#0a0a0a"
            fillOpacity={0.4}
            legendType="none"
          />

          {/* BMF — semi-transparent surface */}
          <Radar
            name="BMF"
            dataKey="BMF"
            stroke={BMF_COLOR}
            strokeWidth={1.5}
            strokeDasharray="4 2"
            fill={BMF_COLOR}
            fillOpacity={0.12}
            dot={{ fill: BMF_COLOR, strokeWidth: 0, r: 3 }}
          />

          {/* PMF — solid, fully opaque */}
          <Radar
            name="PMF"
            dataKey="PMF"
            stroke={PMF_COLOR}
            strokeWidth={2}
            fill={PMF_COLOR}
            fillOpacity={0.18}
            dot={{ fill: PMF_COLOR, strokeWidth: 0, r: 4 }}
          />

          <Tooltip
            contentStyle={{
              background: "#111118",
              border: `1px solid ${PMF_COLOR}33`,
              borderRadius: 2,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              color: "#e2e8f0",
            }}
            formatter={(value: number, name: string) =>
              name.includes("upper") || name.includes("lower")
                ? null
                : [`${value.toFixed(1)}`, name]
            }
          />
          <Legend
            iconType="circle"
            wrapperStyle={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              color: "#64748b",
            }}
            formatter={(value) =>
              value === "PMF" || value === "BMF" ? value : null
            }
          />
        </RadarChart>
      </ResponsiveContainer>

      {/* Uncertainty note */}
      <p className="mt-1 font-mono text-2xs text-nt-muted text-center">
        BMF shaded band = ±15% posterior uncertainty simulation
      </p>
    </div>
  );
}
