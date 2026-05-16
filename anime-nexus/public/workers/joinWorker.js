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
 *
 * ─────────────────────────────────────────────────────────────
 * Supported CSV schemas:
 *   Generic:  anime_id | Anime_id | item_id | id | animeId  →  score | predicted_rating | similarity
 *   KNN:      source, target, distance, similarity, rank     →  "target" = recommended anime ID,
 *                                                               "similarity" = recommendation score
 */

/* global self, importScripts */
importScripts("https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js");

const CHUNK_SIZE = 1024 * 256; // 256 KB — result files are small, keep it snappy

// ── Normalisation helpers ─────────────────────────────────────

/**
 * Try to extract the recommended anime_id from a parsed row.
 *
 * Candidate column names (ordered by preference):
 *   - "anime_id"  / "Anime_id"  — generic output format
 *   - "target"                  — KNN item-based format (resultados_knn.csv)
 *                                 columns: source, target, distance, similarity, rank
 *   - "item_id" / "id" / "animeId" — other model formats
 */
function extractAnimeId(row) {
  const candidates = ["anime_id", "Anime_id", "target", "item_id", "id", "animeId"];
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
 *
 * KNN format uses "similarity" (0-1, higher = more similar = better recommendation).
 * IMPORTANT: "similarity" is checked BEFORE "distance" to avoid picking the wrong column.
 * If only "distance" is available, we invert it (1 - distance) so that sort order
 * (descending by score) correctly yields nearest neighbours first.
 */
function extractScore(row) {
  // Prefer explicit positive-correlation columns
  const preferredCandidates = ["score", "Score", "predicted_rating", "similarity", "value"];
  for (const key of preferredCandidates) {
    const v = row[key];
    if (v !== undefined && v !== null && v !== "") {
      const n = Number(v);
      if (!isNaN(n)) return n;
    }
  }
  // Fallback: invert distance so "higher = better" is preserved
  const d = row["distance"];
  if (d !== undefined && d !== null && d !== "") {
    const n = Number(d);
    if (!isNaN(n)) return 1 - n;
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
  let skippedNoId = 0;

  for (const row of rawRows) {
    const animeId = extractAnimeId(row);
    if (animeId === null) {
      skippedNoId++;
      continue;
    }

    const meta  = animeMap.get(animeId);
    const score = extractScore(row);
    const rank  = extractRank(row);

    enriched.push({
      anime_id:    animeId,
      score,
      rank,
      model,
      // Metadata from anime.csv JOIN (falls back gracefully if ID not in map)
      title:       meta ? meta.name     : ("Anime #" + animeId),
      genre:       meta ? meta.genre    : "Unknown",
      type:        meta ? meta.type     : "Unknown",
      episodes:    meta ? meta.episodes : "?",
      meta_rating: meta ? meta.rating   : null,
      members:     meta ? meta.members  : 0,
    });
  }

  // ── Diagnostic logging ────────────────────────────────────
  if (skippedNoId > 0) {
    var detectedCols = rawRows[0] ? Object.keys(rawRows[0]).join(", ") : "N/A";
    console.warn(
      "[joinWorker] " + model + ": SKIPPED " + skippedNoId + "/" + rawRows.length + " rows — " +
      "no recognisable anime_id column found.\n" +
      "Detected columns: [" + detectedCols + "]\n" +
      "Supported columns: anime_id, Anime_id, target, item_id, id, animeId"
    );
  }

  // Sort by score descending (higher = better recommendation)
  enriched.sort(function(a, b) { return b.score - a.score; });

  console.log(
    "[joinWorker] " + model + ": JOIN complete — " +
    enriched.length + " enriched rows out of " + rawRows.length + " raw rows" +
    (skippedNoId ? " (" + skippedNoId + " skipped)" : "") +
    " | animeMap size: " + animeMap.size
  );

  return enriched;
}

// ── Message handler ───────────────────────────────────────────
self.onmessage = function (e) {
  var msg = e.data;

  // ── Direct JOIN (pre-parsed rows) ─────────────────────────
  if (msg.type === "JOIN") {
    try {
      var animeMapJoin = new Map(msg.animeMap);
      var resultJoin   = performJoin(msg.results, animeMapJoin, msg.model || "UNKNOWN");
      self.postMessage({ type: "JOIN_COMPLETE", data: resultJoin });
    } catch (err) {
      self.postMessage({ type: "JOIN_ERROR", message: err.message });
    }
    return;
  }

  // ── Parse result CSV then JOIN in one pass ────────────────
  if (msg.type === "PARSE_RESULTS") {
    var file           = msg.file;
    var model          = msg.model;
    var animeMapEntries = msg.animeMapEntries;
    var animeMap       = new Map(animeMapEntries);
    var rawRows        = [];

    console.log(
      "[joinWorker] " + model + ": starting parse of \"" + file.name + "\"" +
      " (" + (file.size / 1024).toFixed(1) + " KB)" +
      " | animeMap entries: " + animeMapEntries.length
    );

    Papa.parse(file, {
      header:         true,
      skipEmptyLines: true,
      dynamicTyping:  true,
      chunkSize:      CHUNK_SIZE,

      chunk: function(results) {
        for (var i = 0; i < results.data.length; i++) {
          rawRows.push(results.data[i]);
        }
        var pct = Math.min(
          Math.round((rawRows.length / Math.max(file.size / 50, 1)) * 100),
          99
        );
        self.postMessage({ type: "PROGRESS", percent: pct });
      },

      complete: function() {
        try {
          // Log detected headers so schema mismatches surface immediately in DevTools
          if (rawRows.length > 0) {
            console.log(
              "[joinWorker] " + model + ": CSV headers detected: [" +
              Object.keys(rawRows[0]).join(", ") + "]"
            );
          } else {
            console.warn(
              "[joinWorker] " + model + ": CSV parsed 0 rows — file may be empty or malformed."
            );
          }

          var enriched = performJoin(rawRows, animeMap, model);

          // ── SUCCESS verification log ──────────────────────
          console.log(
            "%c[NEXUS] " + model + " DATA COMMITTED TO MEMORY — " +
            enriched.length + " recommendations ready.",
            "color: #00f2ff; font-weight: bold; font-family: monospace;"
          );

          self.postMessage({ type: "PARSE_COMPLETE", data: enriched, model: model });
        } catch (err) {
          self.postMessage({ type: "PARSE_ERROR", message: err.message });
        }
      },

      error: function(err) {
        self.postMessage({ type: "PARSE_ERROR", message: err.message });
      },
    });

    return;
  }
};
