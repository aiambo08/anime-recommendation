/**
 * public/workers/joinWorker.js
 * ─────────────────────────────────────────────────────────────
 * Web Worker — performs the JOIN between a recommendation result
 * CSV and the anime metadata map, entirely off the main thread.
 *
 * Message protocol (main → worker):
 *   {
 *     type:     "JOIN",
 *     results:  RawResultRow[],   // parsed from resultados_*.csv
 *     animeMap: [number, AnimeRow][]  // serialised Map entries
 *   }
 *
 * Message protocol (worker → main):
 *   { type: "JOIN_COMPLETE", data: EnrichedResult[] }
 *   { type: "JOIN_ERROR",    message: string }
 *
 * ─────────────────────────────────────────────────────────────
 * Also handles CSV PARSE for recommendation result files:
 *
 * Message protocol (main → worker):
 *   { type: "PARSE_RESULTS", file: File, model: string, animeMapEntries: [...] }
 *
 * Message protocol (worker → main):
 *   { type: "PROGRESS",       percent: number }
 *   { type: "PARSE_COMPLETE", data: EnrichedResult[], model: string }
 *   { type: "PARSE_ERROR",    message: string }
 */

/* global self, importScripts */
importScripts("https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js");

const CHUNK_SIZE = 1024 * 256; // 256 KB — result files are small, keep it snappy

// ── Normalisation helpers ─────────────────────────────────────

/**
 * Try to extract anime_id from a parsed row.
 * Result CSVs may use different column names, e.g.
 *   "anime_id", "Anime_id", "item_id", "id"
 */
function extractAnimeId(row) {
  const candidates = ["anime_id", "Anime_id", "item_id", "id", "animeId"];
  for (const key of candidates) {
    const v = row[key];
    if (v !== undefined && v !== null && v !== "") {
      const n = Number(v);
      if (!isNaN(n)) return n;
    }
  }
  return null;
}

/**
 * Try to extract the recommendation score.
 * Columns seen in various output CSVs:
 *   "score", "Score", "predicted_rating", "similarity", "distance"
 */
function extractScore(row) {
  const candidates = ["score", "Score", "predicted_rating", "similarity", "distance", "value"];
  for (const key of candidates) {
    const v = row[key];
    if (v !== undefined && v !== null && v !== "") {
      const n = Number(v);
      if (!isNaN(n)) return n;
    }
  }
  return 0;
}

/**
 * Try to extract a rank / position column if present.
 */
function extractRank(row) {
  const candidates = ["rank", "Rank", "position", "k"];
  for (const key of candidates) {
    const v = row[key];
    if (v !== undefined && v !== null) {
      const n = Number(v);
      if (!isNaN(n)) return n;
    }
  }
  return null;
}

// ── JOIN logic ────────────────────────────────────────────────
function performJoin(rawRows, animeMap, model) {
  const enriched = [];

  for (const row of rawRows) {
    const animeId = extractAnimeId(row);
    if (animeId === null) continue;

    const meta  = animeMap.get(animeId);
    const score = extractScore(row);
    const rank  = extractRank(row);

    enriched.push({
      anime_id:  animeId,
      score,
      rank,
      model,
      // Metadata from anime.csv (may be undefined if ID not found)
      title:     meta?.name    ?? `Anime #${animeId}`,
      genre:     meta?.genre   ?? "Unknown",
      type:      meta?.type    ?? "Unknown",
      episodes:  meta?.episodes ?? "?",
      meta_rating: meta?.rating ?? null,
      members:   meta?.members ?? 0,
    });
  }

  // Sort by score descending (higher = better recommendation)
  enriched.sort((a, b) => b.score - a.score);

  return enriched;
}

// ── Message handler ───────────────────────────────────────────
self.onmessage = function (e) {
  const msg = e.data;

  // ── Direct JOIN (pre-parsed rows) ─────────────────────────
  if (msg.type === "JOIN") {
    try {
      const animeMap = new Map(msg.animeMap);
      const result   = performJoin(msg.results, animeMap, msg.model ?? "UNKNOWN");
      self.postMessage({ type: "JOIN_COMPLETE", data: result });
    } catch (err) {
      self.postMessage({ type: "JOIN_ERROR", message: err.message });
    }
    return;
  }

  // ── Parse result CSV then JOIN in one pass ────────────────
  if (msg.type === "PARSE_RESULTS") {
    const { file, model, animeMapEntries } = msg;
    const animeMap = new Map(animeMapEntries);
    const rawRows  = [];

    Papa.parse(file, {
      header:        true,
      skipEmptyLines: true,
      dynamicTyping:  true,
      chunkSize:      CHUNK_SIZE,

      chunk(results) {
        for (const row of results.data) rawRows.push(row);

        const pct = Math.min(
          Math.round((rawRows.length / Math.max(file.size / 50, 1)) * 100),
          99
        );
        self.postMessage({ type: "PROGRESS", percent: pct });
      },

      complete() {
        try {
          const enriched = performJoin(rawRows, animeMap, model);
          self.postMessage({ type: "PARSE_COMPLETE", data: enriched, model });
        } catch (err) {
          self.postMessage({ type: "PARSE_ERROR", message: err.message });
        }
      },

      error(err) {
        self.postMessage({ type: "PARSE_ERROR", message: err.message });
      },
    });

    return;
  }
};
