"use client";
/**
 * lib/useRecommendationData.ts
 * ─────────────────────────────────────────────────────────────
 * The central data-engine hook for the Anime Recommendation Nexus.
 *
 * Responsibilities:
 *  1. Accept a recommendation result CSV (File) + target model key.
 *  2. Dispatch parsing + JOIN to the joinWorker (off main thread).
 *  3. Store enriched results in Zustand (setModelResults).
 *  4. Expose memoised, sorted/filtered views via `useMemo`.
 *
 * Usage:
 *   const { loadResultFile, getResults, getSortedResults } =
 *     useRecommendationData();
 *
 *   // On file drop:
 *   loadResultFile(file, "KNN");
 *
 *   // In render:
 *   const knnRows = getResults("KNN");
 *   const top10   = getSortedResults("KNN", { limit: 10, sortBy: "score" });
 */

import { useCallback, useMemo, useRef } from "react";
import {
  useNexusStore,
  EnrichedResult,
  ModelKey,
  enrichResult,
} from "./store";

// ─── Worker message types (mirrors joinWorker.js protocol) ───

interface WorkerProgress  { type: "PROGRESS";       percent: number; }
interface WorkerComplete  { type: "PARSE_COMPLETE"; data: EnrichedResult[]; model: ModelKey; }
interface WorkerError     { type: "PARSE_ERROR";    message: string; }
type WorkerMessage = WorkerProgress | WorkerComplete | WorkerError;

// ─── Sort / filter options ────────────────────────────────────

export type SortField = "score" | "meta_rating" | "members" | "title" | "rank";
export type SortDir   = "asc" | "desc";

export interface FilterOptions {
  genre?:    string;      // substring match on genre string
  type?:     string;      // exact match: "TV", "Movie", …
  minScore?: number;
  maxScore?: number;
}

export interface SortOptions {
  sortBy?:   SortField;
  sortDir?:  SortDir;
  limit?:    number;
}

// ─── Hook ─────────────────────────────────────────────────────

export function useRecommendationData() {
  // One worker ref per model key so concurrent uploads work
  const workerRefs = useRef<Partial<Record<ModelKey, Worker>>>({});

  const store     = useNexusStore();
  const animeMap  = useNexusStore((s) => s.animeMap);
  const models    = useNexusStore((s) => s.models);

  // ── Core action: parse result CSV + JOIN ─────────────────────

  const loadResultFile = useCallback(
    (file: File, model: ModelKey) => {
      // Tear down any existing worker for this model
      workerRefs.current[model]?.terminate();

      store.setModelLoading(model, true, 0);
      store.setModelError(model, null);

      const worker = new Worker("/workers/joinWorker.js");
      workerRefs.current[model] = worker;

      worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
        const msg = e.data;

        if (msg.type === "PROGRESS") {
          store.setModelProgress(model, msg.percent);
        }

        if (msg.type === "PARSE_COMPLETE") {
          store.setModelResults(model, msg.data, file.name);
          worker.terminate();
          delete workerRefs.current[model];
        }

        if (msg.type === "PARSE_ERROR") {
          store.setModelError(model, msg.message ?? "Parse failed");
          worker.terminate();
          delete workerRefs.current[model];
        }
      };

      worker.onerror = (err) => {
        store.setModelError(model, `Worker error: ${err.message}`);
        worker.terminate();
        delete workerRefs.current[model];
      };

      // Serialise the Map to a transferable array for the worker
      const animeMapEntries = Array.from(animeMap.entries());

      worker.postMessage({
        type:    "PARSE_RESULTS",
        file,
        model,
        animeMapEntries,
      });
    },
    [animeMap, store]
  );

  // ── Trigger a JOIN on already-loaded raw results ─────────────
  // (useful when anime.csv loads AFTER the result CSV)

  const rejoinModel = useCallback(
    (model: ModelKey) => {
      const current = models[model].results;
      if (current.length === 0 || animeMap.size === 0) return;

      // Re-enrich synchronously on the main thread since data is already in memory
      const re = current.map((r) => enrichResult(r, model, animeMap));
      store.setModelResults(model, re, models[model].fileName ?? "");
    },
    [animeMap, models, store]
  );

  // ── Raw accessor ─────────────────────────────────────────────

  const getResults = useCallback(
    (model: ModelKey): EnrichedResult[] => models[model].results,
    [models]
  );

  // ── Memoised sorted + filtered view ─────────────────────────

  /**
   * Returns a stable sorted/filtered/sliced array.
   * Re-computed only when model results or options change.
   */
  const getSortedResults = useCallback(
    (
      model: ModelKey,
      filter: FilterOptions = {},
      sort:   SortOptions   = {}
    ): EnrichedResult[] => {
      const raw = models[model].results;
      if (raw.length === 0) return [];

      // Filter
      let filtered = raw;

      if (filter.genre) {
        const g = filter.genre.toLowerCase();
        filtered = filtered.filter((r) => r.genre.toLowerCase().includes(g));
      }
      if (filter.type) {
        filtered = filtered.filter((r) => r.type === filter.type);
      }
      if (filter.minScore !== undefined) {
        filtered = filtered.filter((r) => r.score >= filter.minScore!);
      }
      if (filter.maxScore !== undefined) {
        filtered = filtered.filter((r) => r.score <= filter.maxScore!);
      }

      // Sort
      const { sortBy = "score", sortDir = "desc" } = sort;
      const dir = sortDir === "desc" ? -1 : 1;

      const sorted = [...filtered].sort((a, b) => {
        if (sortBy === "title") {
          return dir * a.title.localeCompare(b.title);
        }
        const av = a[sortBy] ?? 0;
        const bv = b[sortBy] ?? 0;
        return dir * (Number(av) - Number(bv));
      });

      // Limit
      return sort.limit ? sorted.slice(0, sort.limit) : sorted;
    },
    [models]
  );

  // ── Memoised aggregate stats ──────────────────────────────────

  const getModelStats = useCallback(
    (model: ModelKey) => {
      const results = models[model].results;
      if (results.length === 0) {
        return { count: 0, avgScore: 0, avgRating: 0, genreDistribution: {} };
      }

      const avgScore  = results.reduce((s, r) => s + r.score, 0) / results.length;
      const avgRating = results
        .filter((r) => r.meta_rating !== null)
        .reduce((s, r) => s + (r.meta_rating ?? 0), 0) /
        Math.max(results.filter((r) => r.meta_rating !== null).length, 1);

      // Genre frequency map
      const genreDistribution: Record<string, number> = {};
      for (const r of results) {
        for (const g of r.genre.split(",").map((x) => x.trim())) {
          if (g) genreDistribution[g] = (genreDistribution[g] ?? 0) + 1;
        }
      }

      return { count: results.length, avgScore, avgRating, genreDistribution };
    },
    [models]
  );

  // ── Cross-model comparison (stable memoised array) ───────────

  const allResults = useMemo<EnrichedResult[]>(
    () => [
      ...models.KNN.results,
      ...models.PMF.results,
      ...models.BMF.results,
      ...models.NCF.results,
    ],
    [models]
  );

  /** Unique anime IDs that appear in ALL four model outputs */
  const consensusIds = useMemo<number[]>(() => {
    const modelKeys: ModelKey[] = ["KNN", "PMF", "BMF", "NCF"];
    const populated = modelKeys.filter((m) => models[m].results.length > 0);
    if (populated.length < 2) return [];

    const idSets = populated.map(
      (m) => new Set(models[m].results.map((r) => r.anime_id))
    );
    const [first, ...rest] = idSets;
    const intersect = Array.from(first).filter((id) => rest.every((s) => s.has(id)));
    return intersect;
  }, [models]);

  // ── Derived loading / error states ───────────────────────────

  const isAnyModelLoading = useMemo(
    () => Object.values(models).some((m) => m.loading),
    [models]
  );

  return {
    // Actions
    loadResultFile,
    rejoinModel,
    clearModel: store.clearModelResults,

    // Accessors
    getResults,
    getSortedResults,
    getModelStats,

    // Derived
    allResults,
    consensusIds,
    isAnyModelLoading,

    // Expose raw model state for UI
    modelStates: models,
  };
}

// ─── Selector hooks (fine-grained subscriptions) ──────────────

/** Subscribe only to a single model's results — prevents re-renders from other models */
export function useModelResults(model: ModelKey) {
  return useNexusStore((s) => s.models[model].results);
}

export function useModelState(model: ModelKey) {
  return useNexusStore((s) => s.models[model]);
}

export function useAnimeMap() {
  return useNexusStore((s) => s.animeMap);
}
