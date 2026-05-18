/**
 * public/workers/joinWorker.js
 * ─────────────────────────────────────────────────────────────
 * Web Worker — performs the JOIN between a recommendation result
 * CSV and the anime metadata map, entirely off the main thread.
 *
 * ─── ID RESOLUTION STRATEGY ──────────────────────────────────
 * KNN csv  → "target" = real MAL anime_id (direct lookup)
 * PMF/BMF/GMF/MLP csv → "target" = internal index (0-based)
 *                       must be resolved via idx2anime map first
 *
 * Message protocol (main → worker):
 *   {
 *     type:         "PARSE_RESULTS",
 *     file:         File,
 *     model:        string,
 *     animeMapEntries: [number, AnimeRow][],   // mal_id → AnimeRow
 *     idx2animeEntries?: [number, number][]    // index → mal_id  (for latent models)
 *   }
 *
 * Message protocol (worker → main):
 *   { type: "PROGRESS",       percent: number }
 *   { type: "PARSE_COMPLETE", data: EnrichedResult[], model: string }
 *   { type: "PARSE_ERROR",    message: string }
 */

/* global self, importScripts */
importScripts("https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js");

const CHUNK_SIZE = 1024 * 256; // 256 KB

// ── Models that use internal indices (not MAL IDs) in "target" ──
const LATENT_MODELS = ["PMF", "BMF", "GMF", "MLP", "NCF"];

// ── Normalisation helpers ─────────────────────────────────────

/**
 * Extract the recommended item identifier from a CSV row.
 * For latent models, "target" = internal index → must be translated via idx2anime.
 * For KNN, "target" = real MAL anime_id.
 */
function extractRawTarget(row) {
  const candidates = ["target", "anime_id", "Anime_id", "item_id", "id", "animeId"];
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
 * Resolve a raw target value to a real MAL anime_id.
 * For KNN the raw value IS the MAL id. For latent models it's an index.
 */
function resolveAnimeId(rawTarget, model, idx2anime) {
  if (rawTarget === null) return null;
  if (LATENT_MODELS.includes(model) && idx2anime) {
    const malId = idx2anime.get(rawTarget);
    return malId !== undefined ? malId : null;
  }
  return rawTarget; // KNN: already a MAL id
}

/**
 * Extract the recommendation score.
 * KNN / all models use "similarity" (higher = better).
 * Fallback inverts "distance".
 */
function extractScore(row) {
  const preferredCandidates = ["score", "Score", "predicted_rating", "similarity", "value"];
  for (const key of preferredCandidates) {
    const v = row[key];
    if (v !== undefined && v !== null && v !== "") {
      const n = Number(v);
      if (!isNaN(n)) return n;
    }
  }
  const d = row["distance"];
  if (d !== undefined && d !== null && d !== "") {
    const n = Number(d);
    if (!isNaN(n)) return 1 - n;
  }
  return 0;
}

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
function performJoin(rawRows, animeMap, model, idx2anime) {
  const enriched = [];
  let skippedNoId = 0;
  let skippedNoMapping = 0;

  for (const row of rawRows) {
    const rawTarget = extractRawTarget(row);
    if (rawTarget === null) { skippedNoId++; continue; }

    const animeId = resolveAnimeId(rawTarget, model, idx2anime);
    if (animeId === null) { skippedNoMapping++; continue; }

    const meta  = animeMap.get(animeId);
    const score = extractScore(row);
    const rank  = extractRank(row);

    enriched.push({
      anime_id:    animeId,        // always a real MAL id after resolution
      raw_index:   rawTarget,      // preserved for debugging
      score,
      rank,
      model,
      title:       meta ? meta.name     : ("Anime #" + animeId),
      genre:       meta ? meta.genre    : "Unknown",
      type:        meta ? meta.type     : "Unknown",
      episodes:    meta ? meta.episodes : "?",
      meta_rating: meta ? meta.rating   : null,
      members:     meta ? meta.members  : 0,
    });
  }

  // Diagnostic logging
  if (skippedNoId > 0) {
    var detectedCols = rawRows[0] ? Object.keys(rawRows[0]).join(", ") : "N/A";
    console.warn(
      "[joinWorker] " + model + ": SKIPPED " + skippedNoId + "/" + rawRows.length + " rows — no target column.\n" +
      "Detected columns: [" + detectedCols + "]"
    );
  }
  if (skippedNoMapping > 0) {
    console.warn(
      "[joinWorker] " + model + ": " + skippedNoMapping + " rows had no idx→MAL mapping (idx2anime incomplete)."
    );
  }

  // Sort by score descending
  enriched.sort(function(a, b) { return b.score - a.score; });

  console.log(
    "[joinWorker] " + model + ": JOIN complete — " +
    enriched.length + " enriched rows out of " + rawRows.length + " raw rows" +
    " | animeMap size: " + animeMap.size +
    (LATENT_MODELS.includes(model) ? " | idx2anime size: " + (idx2anime ? idx2anime.size : 0) : "")
  );

  return enriched;
}

// ── Message handler ───────────────────────────────────────────
self.onmessage = function (e) {
  var msg = e.data;

  if (msg.type === "PARSE_RESULTS") {
    var file            = msg.file;
    var model           = msg.model;
    var animeMapEntries = msg.animeMapEntries || [];
    var idx2animeRaw    = msg.idx2animeEntries || [];

    var animeMap  = new Map(animeMapEntries);
    var idx2anime = idx2animeRaw.length > 0 ? new Map(idx2animeRaw) : null;
    var rawRows   = [];

    console.log(
      "[joinWorker] " + model + ": starting parse of \"" + file.name + "\"" +
      " (" + (file.size / 1024).toFixed(1) + " KB)" +
      " | animeMap: " + animeMapEntries.length +
      " | idx2anime: " + idx2animeRaw.length +
      " | isLatentModel: " + LATENT_MODELS.includes(model)
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
          if (rawRows.length > 0) {
            console.log(
              "[joinWorker] " + model + ": CSV headers detected: [" +
              Object.keys(rawRows[0]).join(", ") + "]"
            );
          } else {
            console.warn("[joinWorker] " + model + ": CSV parsed 0 rows.");
          }

          var enriched = performJoin(rawRows, animeMap, model, idx2anime);

          console.log(
            "%c[NEXUS] " + model + " DATA COMMITTED — " +
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

  // Legacy JOIN (pre-parsed rows, no idx2anime needed in this path)
  if (msg.type === "JOIN") {
    try {
      var animeMapJoin = new Map(msg.animeMap);
      var resultJoin   = performJoin(msg.results, animeMapJoin, msg.model || "UNKNOWN", null);
      self.postMessage({ type: "JOIN_COMPLETE", data: resultJoin });
    } catch (err) {
      self.postMessage({ type: "JOIN_ERROR", message: err.message })
    }
    return;
  }
};
