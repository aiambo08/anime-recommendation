# Anime Nexus: Agent Instructions

This file provides contextual knowledge, boundaries, and conventions for AI coding agents working on the Anime Nexus project.

## 🏗️ Project Architecture & Components

This project is a hybrid Machine Learning & Data Visualization application comparing Recommender Systems on an Anime dataset. The goals are academic analysis mapped to a high-fidelity visual dashboard.

1. **Python ML Backend (`algoritmos/`)**
   - **Scope:** Implementation of PMF, BMF, GMF, MLP, KNN, and Hybrid Recommender Systems.
   - **Stack:** Python 3.13, PyTorch, Pandas/Polars, Optuna (Hyperparameter tuning), Scikit-Learn.
   - **Workflow:** Jupyter Notebooks (`anime.ipynb`) and scripts (`preprocess.py`) dump results into `results/` (CSV files and `.pth` weights).
   - **Run Environment:** Managed by `uv`.

2. **Next.js Frontend Dashboard (`anime-nexus/`)**
   - **Scope:** A web application to visualize results via Technical Analysis, Force Graphs, and Gachapon UIs.
   - **Stack:** Next.js 14 (App router), React 18, TailwindCSS, Zustand, Framer Motion, Recharts, D3, Papaparse.
   - **Workflow:** Web App runs on port 3001. State is centralized in `lib/store.ts`.

## 📋 Conventions & Rules

### Global Options
- **Bilingual Structure:** Be aware the root instructions and assignment context are in Spanish (`README.md`). Python code (`/algoritmos`) features Spanish variables/comments, while Frontend code (`anime-nexus`) adheres to English. Follow the ambient language of the file you are editing.

### Frontend Development (`anime-nexus/`)
- Ensure "wow-factor" by using **Framer Motion** for state transitions and interactions.
- Avoid main-thread blocking when parsing model outputs (`.csv`); utilize the Web Worker pattern defined in `useCsvWorker.ts`.
- All hook-dependent or animated components require `"use client";`.

### Python Development (`algoritmos/`)
- **Reproducibility:** Seed logic (`np.random.seed`, `torch.manual_seed`) must be maintained when evaluating and training algorithms.
- **Dependency Management:** Use `uv` commands instead of standard `pip` when adding Python packages. 
- Ensure you perform parameter optimization using Optuna where applicable. 

## 🤖 Defined Agent Roles

The project expects interactions categorized implicitly into these personas. Prompt the user for clarification if the specific task overlaps.

- **Lead Architect:** Oversee Next.js structure, TypeScript typing (`lib/store.ts`), and structural integrity.
- **Data Scientist Agent:** Handle Python algorithms, CSV pre-processing, matrix factorization structures, and PyTorch tuning.
- **Motion & Viz Designer:** Focus exclusively on UI features (`KnnForceGraph.tsx`, `GachaponMachine.tsx`), Recharts integration, and Framer Motion fidelity.

## 🛠️ Common Commands

**Python / ML**
```bash
uv run preprocess.py
```

**Frontend**
```bash
cd anime-nexus
npm run dev # Accessible at http://localhost:3001
```

## 🔗 Related Documentation
- Assignment guidelines: [README.md](README.md)
