/**
 * lib/store.ts
 * ─────────────────────────────────────────────────────────────
 * Global Zustand store for the Anime Recommendation Nexus.
 * Holds parsed CSV data, loading/error state, and derived
 * metadata look-up maps that feed every visualisation module.
 */
import { create } from "zustand";
import { devtools } from "zustand/middleware";

// ─── Raw CSV types ────────────────────────────────────────────

export interface AnimeRow {
  anime_id:  number;
  name:      string;
  genre:     string;
  type:      string;
  episodes:  string;
  rating:    number;
  members:   number;
}

export interface RatingRow {
  user_id:  number;
  anime_id: number;
  rating:   number;
}

// ─── Enriched recommendation result (after JOIN) ──────────────

export interface EnrichedResult {
  anime_id:    number;
  score:       number;
  rank:        number | null;
  model:       ModelKey;
  // From anime.csv JOIN
  title:       string;
  genre:       string;
  type:        string;
  episodes:    string;
  meta_rating: number | null;
  members:     number;
}

/** Legacy alias kept for backwards compat with Module 01 components */
export type RecommendationResult = EnrichedResult;

export type ModelKey = "KNN" | "PMF" | "BMF" | "NCF";

// ─── Per-model async state ────────────────────────────────────

export interface ModelState {
  results:  EnrichedResult[];
  loading:  boolean;
  error:    string | null;
  progress: number;  // 0-100
  fileName: string | null;
}

const emptyModel = (): ModelState => ({
  results:  [],
  loading:  false,
  error:    null,
  progress: 0,
  fileName: null,
});

// ─── Store Shape ──────────────────────────────────────────────

export interface NexusState {
  // ── Raw parsed data ────────────────────────────────────────
  animeData:  AnimeRow[];
  ratingData: RatingRow[];

  /** O(1) lookup: anime_id → AnimeRow (built when animeData is set) */
  animeMap:   Map<number, AnimeRow>;

  // ── Source CSV loading state ───────────────────────────────
  loadingAnime:    boolean;
  loadingRatings:  boolean;
  errorAnime:      string | null;
  errorRatings:    string | null;
  ratingProgress:  number;

  // ── Per-model recommendation state ────────────────────────
  models: Record<ModelKey, ModelState>;

  // ── Actions: source CSVs ──────────────────────────────────
  setAnimeData:      (rows: AnimeRow[])  => void;
  setRatingData:     (rows: RatingRow[]) => void;
  setLoadingAnime:   (v: boolean)        => void;
  setLoadingRatings: (v: boolean)        => void;
  setErrorAnime:     (e: string | null)  => void;
  setErrorRatings:   (e: string | null)  => void;
  setRatingProgress: (p: number)         => void;

  // ── Actions: per-model results ────────────────────────────
  setModelResults:   (model: ModelKey, rows: EnrichedResult[], fileName: string) => void;
  setModelLoading:   (model: ModelKey, loading: boolean, progress?: number)      => void;
  setModelError:     (model: ModelKey, error: string | null)                     => void;
  setModelProgress:  (model: ModelKey, progress: number)                         => void;
  clearModelResults: (model: ModelKey)                                           => void;

  // ── Legacy shim (Module 01 compat) ────────────────────────
  /** @deprecated Use setModelResults instead */
  setResults: (model: ModelKey, rows: EnrichedResult[]) => void;

  resetAll: () => void;
}

// ─── Initial state ────────────────────────────────────────────

const initial = {
  animeData:       [] as AnimeRow[],
  ratingData:      [] as RatingRow[],
  animeMap:        new Map<number, AnimeRow>(),
  loadingAnime:    false,
  loadingRatings:  false,
  errorAnime:      null  as string | null,
  errorRatings:    null  as string | null,
  ratingProgress:  0,
  models: {
    KNN: emptyModel(),
    PMF: emptyModel(),
    BMF: emptyModel(),
    NCF: emptyModel(),
  } as Record<ModelKey, ModelState>,
};

// ─── Store ────────────────────────────────────────────────────

export const useNexusStore = create<NexusState>()(
  devtools(
    (set) => ({
      ...initial,

      // ── Source CSVs ──────────────────────────────────────

      setAnimeData: (rows) => {
        const map = new Map<number, AnimeRow>();
        for (const r of rows) map.set(r.anime_id, r);
        set({ animeData: rows, animeMap: map }, false, "setAnimeData");
      },

      setRatingData: (rows) =>
        set({ ratingData: rows }, false, "setRatingData"),

      setLoadingAnime:   (v) => set({ loadingAnime: v },   false, "setLoadingAnime"),
      setLoadingRatings: (v) => set({ loadingRatings: v }, false, "setLoadingRatings"),
      setErrorAnime:     (e) => set({ errorAnime: e },     false, "setErrorAnime"),
      setErrorRatings:   (e) => set({ errorRatings: e },   false, "setErrorRatings"),
      setRatingProgress: (p) => set({ ratingProgress: p }, false, "setRatingProgress"),

      // ── Per-model results ─────────────────────────────────

      setModelResults: (model, rows, fileName) =>
        set(
          (s) => ({
            models: {
              ...s.models,
              [model]: { results: rows, loading: false, error: null, progress: 100, fileName },
            },
          }),
          false,
          `setModelResults/${model}`
        ),

      setModelLoading: (model, loading, progress) =>
        set(
          (s) => ({
            models: {
              ...s.models,
              [model]: {
                ...s.models[model],
                loading,
                ...(progress !== undefined ? { progress } : {}),
              },
            },
          }),
          false,
          `setModelLoading/${model}`
        ),

      setModelError: (model, error) =>
        set(
          (s) => ({
            models: {
              ...s.models,
              [model]: { ...s.models[model], error, loading: false },
            },
          }),
          false,
          `setModelError/${model}`
        ),

      setModelProgress: (model, progress) =>
        set(
          (s) => ({
            models: {
              ...s.models,
              [model]: { ...s.models[model], progress },
            },
          }),
          false,
          `setModelProgress/${model}`
        ),

      clearModelResults: (model) =>
        set(
          (s) => ({ models: { ...s.models, [model]: emptyModel() } }),
          false,
          `clearModelResults/${model}`
        ),

      // ── Legacy shim ───────────────────────────────────────

      setResults: (model, rows) =>
        set(
          (s) => ({
            models: {
              ...s.models,
              [model]: { ...s.models[model], results: rows },
            },
          }),
          false,
          `setResults/${model}`
        ),

      resetAll: () =>
        set(
          {
            ...initial,
            animeMap: new Map(),
            models: {
              KNN: emptyModel(),
              PMF: emptyModel(),
              BMF: emptyModel(),
              NCF: emptyModel(),
            },
          },
          false,
          "resetAll"
        ),
    }),
    { name: "NexusStore" }
  )
);

// ─── Pure helpers ─────────────────────────────────────────────

/** Enrich a raw recommendation row with metadata from the anime map.
 *  Used when you already have the animeMap in-memory and don't need
 *  the full worker pipeline. */
export function enrichResult(
  raw: { anime_id: number; score: number; rank?: number | null },
  model: ModelKey,
  animeMap: Map<number, AnimeRow>
): EnrichedResult {
  const meta = animeMap.get(raw.anime_id);
  return {
    anime_id:    raw.anime_id,
    score:       raw.score,
    rank:        raw.rank ?? null,
    model,
    title:       meta?.name     ?? `Anime #${raw.anime_id}`,
    genre:       meta?.genre    ?? "Unknown",
    type:        meta?.type     ?? "Unknown",
    episodes:    meta?.episodes ?? "?",
    meta_rating: meta?.rating   ?? null,
    members:     meta?.members  ?? 0,
  };
}

/** Genre list extracted from a comma-separated genre string */
export function parseGenres(genre: string): string[] {
  return genre
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
}

/** Normalise a score to 0–1 range given an array of results */
export function normaliseScores(results: EnrichedResult[]): EnrichedResult[] {
  if (results.length === 0) return results;
  const max = Math.max(...results.map((r) => r.score));
  const min = Math.min(...results.map((r) => r.score));
  const range = max - min || 1;
  return results.map((r) => ({ ...r, score: (r.score - min) / range }));
}
