# Skill: Advanced Data Visualization
**Description:** Transforms recommendation metrics (KNN, PMF, BMF, NCF) into interactive charts.

## Methodology per Technique
- **KNN:** Implement `D3.js` for a Force-Directed Graph.
- **PMF/BMF:** Use `Recharts` for Radar Charts. For BMF, add a gradient area to represent variance/uncertainty.
- **NCF:** Create a 10x10 grid (Canvas or CSS Grid) representing neural activation.

## Visual Constraints
- Colors: KNN (Cyan #00f2ff), PMF (Yellow #fff000), NCF (Magenta #ff00ff).
- Interactivity: Tooltips must display the anime name retrieved from `anime.csv`.