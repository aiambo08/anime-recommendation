/**
 * app/api/models/route.ts
 * ──────────────────────────────────────────────────────────────────────────
 * GET /api/models
 * Lee results/models_summary.csv desde el disco (una carpeta arriba del
 * proyecto Next.js) y lo devuelve como JSON.
 * Así el frontend siempre muestra los valores actuales del notebook sin
 * necesidad de hardcodear nada en el código.
 */

import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// results/ está un nivel por encima de anime-nexus/
const CSV_PATH = resolve(process.cwd(), "..", "results", "models_summary.csv");

/** Parsea un CSV con soporte para campos entre comillas (como best_params). */
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const header = splitCSVRow(lines[0]);

  return lines.slice(1).map((line) => {
    const values = splitCSVRow(line);
    const obj: Record<string, string> = {};
    header.forEach((key, i) => {
      obj[key.trim()] = (values[i] ?? "").trim();
    });
    return obj;
  });
}

function splitCSVRow(row: string): string[] {
  const result: string[] = [];
  let inQuotes = false;
  let current = "";

  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

const NUMERIC_FIELDS = ["rmse", "mae", "precision10", "ndcg10", "coverage"];

export async function GET() {
  if (!existsSync(CSV_PATH)) {
    return NextResponse.json(
      { error: `CSV not found at ${CSV_PATH}` },
      { status: 404 }
    );
  }

  try {
    const text = readFileSync(CSV_PATH, "utf-8");
    const rows = parseCSV(text);

    // Convertir campos numéricos y manejar NaN / vacíos
    const data = rows.map((row) => {
      const out: Record<string, unknown> = { ...row };
      for (const field of NUMERIC_FIELDS) {
        const v = row[field];
        out[field] = v === "" || v === "nan" || v === "None" ? null : parseFloat(v);
      }
      return out;
    });

    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" }, // sin caché: siempre datos frescos
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
