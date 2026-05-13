# Skill: Data Wrangling & Performance
**Description:** Specialist in handling large CSV files and memory optimization.

## Usage Context
Invoked when processing `rating.csv` and `anime.csv`.

## Technical Instructions
- **Streaming:** Use `PapaParse` with the `worker: true` option to avoid blocking the main thread.
- **Web Workers:** Any filtering logic for `rating.csv` (>100MB) MUST run in a Web Worker.
- **Caching:** Implement `localStorage` to persist `anime.csv` metadata once loaded.

## Decision Rules
- IF file exceeds 50MB -> Use Chunking.
- IF user searches for a non-existent ID -> Return "Unknown Anime" object with visual placeholder.