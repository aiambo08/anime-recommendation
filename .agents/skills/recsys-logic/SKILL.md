# Skill: RecSys Domain Logic
**Description:** Connects model results with the user's profile.

## Business Rules
- **Enrichment:** Join the `anime_id` from results with the `name` and `genre` from `anime.csv`.
- **API Integration:** Use the `Jikan API` (`/anime/{id}`) to fetch poster images if not present in the local dataset.
- **Normalization:** Prediction scores should be displayed as "Match %" (0-100).

## Validation Prompt
"Is this anime consistent with the user's profile?" (Diversity check to avoid filter bubbles).