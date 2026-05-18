/**
 * lib/useJikanAnime.ts
 * ─────────────────────────────────────────────────────────────
 * Jikan (MyAnimeList unofficial) API integration.
 *
 * Rate limiting: Jikan enforces ≤3 req/sec and ≤60 req/min.
 * Strategy: in-memory LRU cache + 380ms throttle between requests.
 *
 * Usage:
 *   const { data, loading, error } = useJikanAnime(malId);
 *
 * Note: malId must be a real MyAnimeList anime_id.
 *       The joinWorker resolves internal indices to MAL IDs
 *       before populating EnrichedResult.anime_id.
 */
"use client";

import { useState, useEffect, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────

export interface JikanImage {
  image_url:       string;
  small_image_url: string;
  large_image_url: string;
}

export interface JikanAnime {
  mal_id:    number;
  url:       string;
  title:     string;
  title_english: string | null;
  images:    { jpg: JikanImage; webp: JikanImage };
  synopsis:  string | null;
  score:     number | null;
  scored_by: number | null;
  rank:      number | null;
  popularity:number | null;
  episodes:  number | null;
  status:    string | null;
  aired:     { string: string } | null;
  genres:    { mal_id: number; name: string }[];
  studios:   { mal_id: number; name: string }[];
  themes:    { mal_id: number; name: string }[];
  year:      number | null;
  season:    string | null;
  type:      string | null;
  source:    string | null;
  trailer:   { url: string | null; youtube_id: string | null } | null;
  duration:  string | null;
}

// ─── Cache & throttle ─────────────────────────────────────────

const cache = new Map<number, JikanAnime | null>();

// Simple async queue throttled to 1 request per 380ms
let lastRequestTime = 0;
const MIN_GAP_MS = 380;

async function throttledFetch(malId: number): Promise<JikanAnime | null> {
  // Respect rate limit
  const now = Date.now();
  const wait = Math.max(0, lastRequestTime + MIN_GAP_MS - now);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestTime = Date.now();

  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}`, {
      headers: { "Accept": "application/json" },
    });

    if (res.status === 429) {
      // Rate limited — back off 1 second and retry once
      await new Promise((r) => setTimeout(r, 1000));
      const retry = await fetch(`https://api.jikan.moe/v4/anime/${malId}`, {
        headers: { "Accept": "application/json" },
      });
      if (!retry.ok) return null;
      const retryJson = await retry.json();
      return retryJson.data ?? null;
    }

    if (!res.ok) return null;  // 404 or other error
    const json = await res.json();
    return json.data ?? null;
  } catch {
    return null;
  }
}

// In-flight deduplication: prevent duplicate requests for the same ID
const inFlight = new Map<number, Promise<JikanAnime | null>>();

export async function fetchJikanAnime(malId: number): Promise<JikanAnime | null> {
  if (cache.has(malId)) return cache.get(malId)!;

  if (inFlight.has(malId)) return inFlight.get(malId)!;

  const promise = throttledFetch(malId).then((data) => {
    cache.set(malId, data);
    inFlight.delete(malId);
    return data;
  });

  inFlight.set(malId, promise);
  return promise;
}

// ─── React hook ───────────────────────────────────────────────

interface JikanHookState {
  data:    JikanAnime | null;
  loading: boolean;
  error:   string | null;
}

/**
 * Hook to fetch a single anime from Jikan by MAL ID.
 * Returns cached data instantly if already fetched.
 * Pass `null` to skip fetching (e.g. when ID is not yet known).
 */
export function useJikanAnime(malId: number | null | undefined): JikanHookState {
  const [state, setState] = useState<JikanHookState>({
    data:    malId !== null && malId !== undefined ? (cache.get(malId) ?? null) : null,
    loading: false,
    error:   null,
  });

  const lastId = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    if (malId === null || malId === undefined || malId <= 0) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    // Don't re-fetch if same ID
    if (lastId.current === malId && !state.loading) return;
    lastId.current = malId;

    // Serve from cache instantly
    if (cache.has(malId)) {
      setState({ data: cache.get(malId) ?? null, loading: false, error: null });
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    fetchJikanAnime(malId).then((data) => {
      setState({ data, loading: false, error: data === null ? "Not found on MAL" : null });
    }).catch((err) => {
      setState({ data: null, loading: false, error: String(err) });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [malId]);

  return state;
}
