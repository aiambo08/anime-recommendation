"use client";
/**
 * components/viz/KnnForceGraph.tsx
 * ─────────────────────────────────────────────────────────────
 * D3 Force-Directed Graph for KNN similarity visualisation.
 *
 * Nodes  = top-N recommended anime (from KNN results)
 * Edges  = genre overlap between two anime
 *          (weight = Jaccard similarity of genre sets)
 *
 * Uses D3 simulation entirely inside a useEffect — React never
 * touches the SVG DOM after mount, keeping renders cheap.
 */
import { useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";
import { useModelResults } from "@/lib/useRecommendationData";
import { EnrichedResult, parseGenres } from "@/lib/store";

// ─── Config ───────────────────────────────────────────────────
const MAX_NODES    = 40;   // limit nodes for readability
const MIN_JACCARD  = 0.20; // minimum edge weight to render
const KNN_COLOR    = "#00f2ff";
const ACCENT_DIM   = "#00f2ff22";

interface Node extends d3.SimulationNodeDatum {
  id:     number;
  label:  string;
  score:  number;
  genres: string[];
  radius: number;
}
interface Link extends d3.SimulationLinkDatum<Node> {
  weight: number;
}

// ─── Jaccard helper ───────────────────────────────────────────
function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  const inter = a.filter((g) => sb.has(g)).length;
  const union  = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

// ─── Component ───────────────────────────────────────────────
export function KnnForceGraph() {
  const results      = useModelResults("KNN");
  const svgRef       = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Build graph data from results
  const { nodes, links } = useMemo(() => {
    const top = results.slice(0, MAX_NODES);

    const nodes: Node[] = top.map((r) => ({
      id:     r.anime_id,
      label:  r.title,
      score:  r.score,
      genres: parseGenres(r.genre),
      radius: 4 + r.score * 10,   // size ∝ score
    }));

    // Build edges for pairs with sufficient genre overlap
    const links: Link[] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const w = jaccard(nodes[i].genres, nodes[j].genres);
        if (w >= MIN_JACCARD) {
          links.push({ source: nodes[i], target: nodes[j], weight: w });
        }
      }
    }
    return { nodes, links };
  }, [results]);

  // D3 simulation — runs whenever nodes/links change AND whenever the container gets real dimensions
  useEffect(() => {
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!svg || !container || nodes.length === 0) return;

    // Capture a non-null reference for the closure (TypeScript narrows here)
    const svgEl: SVGSVGElement = svg;
    let cleanup: (() => void) | undefined;

    function mount() {
      const rect = svgEl.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;
      if (W === 0 || H === 0) return; // not yet visible, observer will retry

      // Clear previous render
      d3.select(svgEl).selectAll("*").remove();

      // Defs — glow filter
      const defs = d3.select(svgEl).append("defs");
      const filter = defs.append("filter").attr("id", "knn-glow");
      filter.append("feGaussianBlur")
        .attr("stdDeviation", "3")
        .attr("result", "coloredBlur");
      const feMerge = filter.append("feMerge");
      feMerge.append("feMergeNode").attr("in", "coloredBlur");
      feMerge.append("feMergeNode").attr("in", "SourceGraphic");

      const g = d3.select(svgEl).append("g");

      // Zoom
      const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 4])
        .on("zoom", (event) => g.attr("transform", event.transform));
      d3.select(svgEl).call(zoom);


      // Simulation
      const sim = d3.forceSimulation<Node>(nodes)
        .force("link", d3.forceLink<Node, Link>(links)
          .id((d) => d.id)
          .distance((l) => 80 - l.weight * 40)
          .strength((l) => l.weight * 0.6)
        )
        .force("charge", d3.forceManyBody().strength(-120))
        .force("center",  d3.forceCenter(W / 2, H / 2))
        .force("collide", d3.forceCollide<Node>((d) => d.radius + 4));

      // Links
      const link = g.append("g")
        .selectAll<SVGLineElement, Link>("line")
        .data(links)
        .join("line")
        .attr("stroke", KNN_COLOR)
        .attr("stroke-opacity", (l) => l.weight * 0.5)
        .attr("stroke-width",   (l) => l.weight * 2);

      // Nodes
      const node = g.append("g")
        .selectAll<SVGGElement, Node>("g")
        .data(nodes)
        .join("g")
        .call(
          d3.drag<SVGGElement, Node>()
            .on("start", (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
            .on("drag",  (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
            .on("end",   (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
        );

      node.append("circle")
        .attr("r", (d) => d.radius)
        .attr("fill",   ACCENT_DIM)
        .attr("stroke", KNN_COLOR)
        .attr("stroke-width", 1.5)
        .attr("filter", "url(#knn-glow)")
        .style("cursor", "grab");

      node.append("circle")
        .attr("r",    (d) => d.radius + 3)
        .attr("fill", "none")
        .attr("stroke", KNN_COLOR)
        .attr("stroke-opacity", (d) => d.score * 0.3)
        .attr("stroke-width", 0.5)
        .attr("stroke-dasharray", "2 3");

      node.filter((d) => d.score > 0.6)
        .append("text")
        .attr("dy", (d) => -(d.radius + 6))
        .attr("text-anchor", "middle")
        .attr("fill", KNN_COLOR)
        .attr("font-family", "'JetBrains Mono', monospace")
        .attr("font-size", "9px")
        .attr("opacity", 0.85)
        .text((d) => d.label.slice(0, 18) + (d.label.length > 18 ? "…" : ""));

      node.append("title")
        .text((d) => `${d.label}\nScore: ${d.score.toFixed(4)}\n${d.genres.join(", ")}`);

      sim.on("tick", () => {
        link
          .attr("x1", (d) => (d.source as Node).x ?? 0)
          .attr("y1", (d) => (d.source as Node).y ?? 0)
          .attr("x2", (d) => (d.target as Node).x ?? 0)
          .attr("y2", (d) => (d.target as Node).y ?? 0);
        node.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
      });

      cleanup = () => { sim.stop(); };
    }

    // Try mounting immediately; if container has no size yet, observe resize
    mount();

    const ro = new ResizeObserver(() => {
      if (cleanup) { cleanup(); cleanup = undefined; }
      mount();
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      cleanup?.();
    };
  }, [nodes, links]);


  // ── Empty state (rendered when no data — SVG is NOT mounted) ──
  if (results.length === 0) {
    return <EmptyViz label="KNN FORCE GRAPH" color={KNN_COLOR} hint="Load KNN results to render similarity graph" />;
  }

  // ── Data available — mount SVG so D3 can bind to it ──────────
  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[400px]">
      {/* Legend */}
      <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
        <span className="font-mono text-2xs" style={{ color: KNN_COLOR }}>
          ● NODE SIZE = SCORE
        </span>
        <span className="font-mono text-2xs" style={{ color: KNN_COLOR, opacity: 0.6 }}>
          — EDGE = GENRE OVERLAP
        </span>
        <span className="font-mono text-2xs text-nt-muted">
          {nodes.length} nodes · {links.length} edges
        </span>
      </div>
      <svg
        ref={svgRef}
        className="w-full h-full"
        style={{ minHeight: 400, background: "transparent" }}
      />
    </div>
  );
}


// ─── Shared empty state ───────────────────────────────────────
export function EmptyViz({ label, color, hint }: { label: string; color: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-3">
      <div
        className="h-16 w-16 rounded-sm border flex items-center justify-center"
        style={{ borderColor: color + "44", color }}
      >
        <span className="font-display text-xs tracking-widest">{label.split(" ")[0]}</span>
      </div>
      <p className="font-display text-xs tracking-widest uppercase" style={{ color }}>
        {label}
      </p>
      <p className="font-mono text-2xs text-nt-muted text-center max-w-xs">{hint}</p>
    </div>
  );
}

