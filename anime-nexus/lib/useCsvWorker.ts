/**
 * lib/useCsvWorker.ts
 * ─────────────────────────────────────────────────────────────
 * React hook that instantiates the CSV Web Worker and wires it
 * to the Zustand store. Memoised so the worker is only created
 * once per mount.
 */
"use client";

import { useCallback, useRef } from "react";
import { useNexusStore, AnimeRow, RatingRow } from "./store";

type DataType = "anime" | "ratings";

interface WorkerMessage {
  type:     "PROGRESS" | "COMPLETE" | "ERROR";
  percent?: number;
  data?:    AnimeRow[] | RatingRow[];
  dataType?: DataType;
  message?: string;
}

export function useCsvWorker() {
  const workerRef = useRef<Worker | null>(null);
  const store     = useNexusStore();

  const parse = useCallback((file: File, dataType: DataType) => {
    // Teardown previous worker if still running
    if (workerRef.current) {
      workerRef.current.terminate();
    }

    // Set loading flags
    if (dataType === "anime")   store.setLoadingAnime(true);
    if (dataType === "ratings") store.setLoadingRatings(true);

    const worker = new Worker("/workers/csvWorker.js");
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const msg = e.data;

      if (msg.type === "PROGRESS" && msg.percent !== undefined) {
        store.setRatingProgress(msg.percent);
      }

      if (msg.type === "COMPLETE" && msg.data) {
        if (msg.dataType === "anime") {
          store.setAnimeData(msg.data as AnimeRow[]);
          store.setLoadingAnime(false);
          store.setErrorAnime(null);
        } else {
          store.setRatingData(msg.data as RatingRow[]);
          store.setLoadingRatings(false);
          store.setErrorRatings(null);
          store.setRatingProgress(100);
        }
        worker.terminate();
      }

      if (msg.type === "ERROR") {
        const err = msg.message ?? "Unknown parse error";
        if (dataType === "anime")   { store.setErrorAnime(err);   store.setLoadingAnime(false); }
        if (dataType === "ratings") { store.setErrorRatings(err); store.setLoadingRatings(false); }
        worker.terminate();
      }
    };

    worker.onerror = (err) => {
      const msg = `Worker error: ${err.message}`;
      if (dataType === "anime")   { store.setErrorAnime(msg);   store.setLoadingAnime(false); }
      if (dataType === "ratings") { store.setErrorRatings(msg); store.setLoadingRatings(false); }
      worker.terminate();
    };

    worker.postMessage({ type: "PARSE", file, dataType });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { parse };
}
