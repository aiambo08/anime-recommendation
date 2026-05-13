/**
 * public/workers/csvWorker.js
 * ─────────────────────────────────────────────────────────────
 * Web Worker — parses CSV files off the main thread using
 * PapaParse's streaming (chunk) mode, so the UI never freezes
 * even for the 111 MB rating.csv.
 *
 * Message protocol (main → worker):
 *   { type: "PARSE", file: File, dataType: "anime" | "ratings" }
 *
 * Message protocol (worker → main):
 *   { type: "PROGRESS", percent: number }
 *   { type: "COMPLETE", data: Row[], dataType: string }
 *   { type: "ERROR",    message: string }
 */

/* global self, importScripts */
importScripts("https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js");

const CHUNK_SIZE = 1024 * 512; // 512 KB per chunk

self.onmessage = function (e) {
  const { type, file, dataType } = e.data;

  if (type !== "PARSE") return;

  const rows = [];
  let totalSize = file.size;
  let processedBytes = 0;

  Papa.parse(file, {
    header:      true,
    skipEmptyLines: true,
    chunkSize:   CHUNK_SIZE,
    dynamicTyping: true,

    chunk(results, parser) {
      // Accumulate rows
      for (const row of results.data) {
        rows.push(row);
      }

      // Estimate progress (PapaParse doesn't expose byte position directly,
      // so we use row count × average row size heuristic)
      processedBytes += results.data.length * (totalSize / Math.max(rows.length, 1));
      const percent = Math.min(Math.round((processedBytes / totalSize) * 100), 99);

      self.postMessage({ type: "PROGRESS", percent });
    },

    complete() {
      self.postMessage({ type: "COMPLETE", data: rows, dataType });
    },

    error(err) {
      self.postMessage({ type: "ERROR", message: err.message });
    },
  });
};
