# 🌸 Anime Recommendation Nexus

> **Práctica de Sistemas de Recomendación** · Computación Simbólica y Predictiva  
> Universidad Politécnica de Madrid

Un sistema de recomendación de anime de extremo a extremo que implementa, afina y compara cinco técnicas clásicas y neurales, y presenta los resultados en un dashboard interactivo con estética **Cyberpunk Neural Terminal**.

---

## 📖 Tabla de Contenidos

1. [Visión general](#-visión-general)
2. [Arquitectura del proyecto](#-arquitectura-del-proyecto)
3. [Dataset](#-dataset)
4. [Modelos implementados](#-modelos-implementados)
5. [Protocolo de evaluación](#-protocolo-de-evaluación)
6. [Resultados comparativos](#-resultados-comparativos)
7. [Pipeline de datos](#-pipeline-de-datos)
8. [Frontend — Anime Nexus Dashboard](#-frontend--anime-nexus-dashboard)
9. [Estructura de ficheros](#-estructura-de-ficheros)
10. [Instalación y ejecución](#-instalación-y-ejecución)
11. [Dependencias](#-dependencias)

---

## 🎯 Visión General

El proyecto compara **cinco técnicas de filtrado colaborativo** sobre el dataset público de valoraciones de anime de MyAnimeList (MAL):

| Familia | Técnica | Tipo |
|---------|---------|------|
| Memory-based CF | **KNN** (K-Nearest Neighbors) | Similitud ítem-ítem |
| Model-based CF  | **PMF** (Probabilistic Matrix Factorization) | Factores latentes gaussianos |
| Model-based CF  | **BMF** (Bernoulli Matrix Factorization) | Factores latentes binarios |
| Neural CF       | **GMF** (Generalized Matrix Factorization) | Red neuronal – producto elemento a elemento |
| Neural CF       | **MLP** (Multi-Layer Perceptron) | Red neuronal profunda – concatenación de embeddings |

Cada modelo ha sido ajustado cuidadosamente realizando un análisis riguroso de sus hiperparámetros (algunos mediante optimización bayesiana, otros manualmente) y evaluado con un protocolo unificado de métricas de predicción (RMSE, MAE) y ranking (Precision@10, nDCG@10).

Los resultados se visualizan en tiempo real en un **dashboard Next.js** con grafos de fuerza, mapas de calor, radar charts y la máquina Gachapon para recomendaciones interactivas.

---

## 🏗️ Arquitectura del Proyecto

```
Practica anime/
├── anime.ipynb              # Notebook principal — análisis completo end-to-end
├── preprocess.py            # ETL: limpieza y partición train/test del dataset
├── pyproject.toml           # Configuración Python (uv)
│
├── data/                    # Dataset original (no incluido en el repositorio)
│   ├── anime.csv            # Metadatos: título, género, tipo, episodios, rating
│   └── rating.csv           # Interacciones: user_id, anime_id, rating (111 MB)
│
├── algoritmos/              # Implementaciones de los modelos
│   ├── knn.py               # KNN: búsqueda de K vecinos más cercanos
│   ├── knn_optimo.py        # Script standalone para búsqueda del K óptimo
│   ├── pmf.py               # Probabilistic Matrix Factorization (PyTorch)
│   ├── bmf_model.py         # Bernoulli Matrix Factorization
│   ├── gmf.py               # GMF Neural CF (PyTorch)
│   ├── mlp.py               # MLP Neural CF (PyTorch)
│   └── ranking_eval.py      # Protocolo unificado Precision@K / nDCG@K
│
├── results/                 # Artefactos generados (pesos, CSVs, estudios Optuna)
│   ├── models_summary.csv   # Tabla comparativa final (consumida por el frontend)
│   ├── GMF_weights.pth      # Pesos del modelo GMF óptimo (~12 MB)
│   ├── MLP_weights.pth      # Pesos del modelo MLP óptimo (~13 MB)
│   ├── tuning_gmf.csv       # Historial de trials Optuna para GMF
│   ├── tuning_mlp.csv       # Historial de trials Optuna para MLP
│   ├── resultados_knn.csv   # Top-N similitudes ítem-ítem (formato frontend)
│   ├── resultados_pmf_frontend.csv
│   ├── resultados_bmf_frontend.csv
│   ├── resultados_gmf_frontend.csv
│   └── resultados_mlp_frontend.csv
│
└── anime-nexus/             # Dashboard React / Next.js
    ├── app/
    │   ├── page.tsx         # Página principal: comparativa + ecuaciones + Gachapon
    │   ├── dashboard/       # Ruta /dashboard: análisis técnico interactivo
    │   └── api/models/      # GET /api/models → lee models_summary.csv
    ├── components/
    │   ├── ModelComparisonTable.tsx
    │   ├── viz/             # KnnForceGraph, PmfBmfRadar, NcfHeatmap, TechnicalAnalysis
    │   └── gachapon/        # GachaponMachine, CapsuleModal, useGachapon
    └── lib/
        ├── store.ts         # Estado global Zustand
        ├── useCsvWorker.ts  # Web Worker para parsing de CSVs pesados
        └── useJikanAnime.ts # Integración Jikan API (metadatos en tiempo real)
```

---

## 📦 Dataset

| Fichero | Filas | Descripción |
|---------|-------|-------------|
| `anime.csv` | ~12 294 | Catálogo de anime: `anime_id`, `name`, `genre`, `type`, `episodes`, `rating`, `members` |
| `rating.csv` | ~7 813 737 | Valoraciones: `user_id`, `anime_id`, `rating` (−1 = "visto sin valorar") |

### Preprocesado (`preprocess.py`)

1. **Filtrado de interacciones implícitas** — elimina las filas con `rating == -1`.
2. **Filtrado de usuarios y ítems fríos** — solo usuarios con ≥ 20 valoraciones y ítems con ≥ 50.
3. **Re-indexación densa** — mapea `user_id` e `anime_id` originales a índices contiguos para matrices densas.
4. **Partición estratificada** — split 80/20 a nivel de usuario (últimas interacciones → test).
5. **Persistencia** — guarda `df_train.parquet` y `df_test.parquet` para reproducibilidad.

```bash
uv run preprocess.py
```

---

## 🤖 Modelos Implementados

### 1. KNN — K-Nearest Neighbors (`algoritmos/knn.py`)

Filtrado colaborativo basado en memoria. Calcula la **similitud coseno ítem-ítem** sobre la matriz de valoraciones dispersa.

**Hiperparámetros optimizados:**
- `k` (número de vecinos) — buscado en [5, 50] mediante validación cruzada por RMSE.
- **K óptimo encontrado:** `k = 10`

**Predicción:**
$$\hat{r}_{u,i} = \frac{\sum_{j \in \mathcal{N}(i)} \text{sim}(i,j) \cdot r_{u,j}}{\sum_{j \in \mathcal{N}(i)} |\text{sim}(i,j)|}$$

---

### 2. PMF — Probabilistic Matrix Factorization (`algoritmos/pmf.py`)

Factorización matricial probabilista con factores latentes gaussianos, optimizada por Descenso de Gradiente Estocástico (SGD) con parada temprana.

**Fórmula:**
$$\hat{r}_{u,i} = \mu + \mathbf{p}_u^{\top} \mathbf{q}_i$$

**Hiperparámetros óptimos** (Optuna):
- `n_factors = 50`, `lr = 0.005`, `reg = 0.05`, `epochs = 30`, `patience = 5`

---

### 3. BMF — Bernoulli Matrix Factorization (`algoritmos/bmf_model.py`)

Variante bayesiana que modela los factores latentes como variables aleatorias de Bernoulli con K estados discretos. Captura incertidumbre epistémica en las representaciones.

**Hiperparámetros óptimos:**
- `K = 10` estados de scoring, `d = 20` factores latentes

---

### 4. GMF — Generalized Matrix Factorization (`algoritmos/gmf.py`)

Primera rama del framework **Neural Collaborative Filtering (NCF)** de He et al. (2017). Generaliza PMF aprendiendo una función de interacción no lineal mediante el producto elemento a elemento de embeddings:

$$\hat{y}_{u,i} = \sigma\!\left(\mathbf{h}^{\top}(\mathbf{p}_u \odot \mathbf{q}_i)\right)$$

**Arquitectura:**
- Embedding de usuario + Embedding de ítem → producto ⊙ → capa lineal de salida

**Hiperparámetros óptimos** (Optuna, 20 trials):
- `latent_dim = 60`, `lr = 0.00284`, `epochs = 5`

**Persistencia:** `results/GMF_weights.pth`

---

### 5. MLP — Multi-Layer Perceptron (`algoritmos/mlp.py`)

Segunda rama de NCF. En lugar del producto elemento a elemento, concatena los embeddings y los pasa por capas ocultas con ReLU para capturar interacciones no lineales complejas:

$$\hat{y}_{u,i} = \sigma\!\left(\text{MLP}\!\left([\mathbf{p}_u \,\|\, \mathbf{q}_i]\right)\right)$$

**Arquitectura:**
- Concat(embedding_u, embedding_i) → [256 → 128 → 64] + Dropout(0.2) → salida

**Hiperparámetros óptimos** (Optuna, 20 trials):
- `latent_dim = 64`, `lr = 0.00961`, `epochs = 4`

**Persistencia:** `results/MLP_weights.pth`

---

## 📐 Protocolo de Evaluación

### Métricas de Predicción (RMSE / MAE)

Evaluadas sobre el **conjunto de test** (20% de interacciones por usuario):

$$\text{RMSE} = \sqrt{\frac{1}{|T|}\sum_{(u,i)\in T}(\hat{r}_{u,i} - r_{u,i})^2} \qquad \text{MAE} = \frac{1}{|T|}\sum_{(u,i)\in T}|\hat{r}_{u,i} - r_{u,i}|$$

### Métricas de Ranking (Precision@10 / nDCG@10)

Implementadas en `algoritmos/ranking_eval.py`. Protocolo **Full Test Set** (sin negative sampling):

- **Relevancia binaria:** ítem relevante si `rating_real ≥ 7.0`.
- **Top-K:** los K ítems mejor puntuados entre los que el usuario tiene en test.
- **Muestra:** 200 usuarios activos fijados con `seed=42` para reproducibilidad.

$$\text{Precision@K} = \frac{|\{i \in \text{top-K} : r_{u,i} \geq 7\}|}{K}$$

$$\text{nDCG@K} = \frac{\text{DCG@K}}{\text{IDCG@K}}, \quad \text{DCG@K} = \sum_{k=1}^{K}\frac{\text{rel}_k}{\log_2(k+1)}$$

> **Por qué Full Test Set en lugar de Negative Sampling:** El protocolo de negative sampling (NBR, He et al.) es válido para modelos de ranking puro, pero introduce sesgos cuando se comparan simultáneamente modelos basados en predicción de rating (KNN, PMF) con modelos NCF. El protocolo Full Test Set es agnóstico al paradigma y garantiza métricas directamente comparables.

---

## 📊 Resultados Comparativos

> Resultados exportados en `results/models_summary.csv` y visualizados en el dashboard.

| Modelo | RMSE ↓ | MAE ↓ | Precision@10 ↑ | nDCG@10 ↑ |
|--------|--------|-------|----------------|-----------|
| **KNN** | 1.3391 | 1.0017 | — | — |
| **PMF** | **1.1022** | **0.7312** | — | — |
| **BMF** | 1.4372 | 0.9900 | — | — |
| **GMF** | 1.2204 | 0.9292 | 0.9550 | 0.9760 |
| **MLP** | 1.1985 | 0.9049 | 0.9545 | **0.9773** |

**Conclusiones:**
- **PMF** logra el mejor RMSE y MAE: los factores latentes gaussianos modelan con precisión el espacio de valoraciones en este dataset.
- **MLP** obtiene el mejor nDCG@10, confirmando la superioridad de las interacciones no lineales para el ranking.
- **BMF** tiene el RMSE más alto, posiblemente por la discretización implícita de los factores latentes.
- Las métricas de ranking para KNN/PMF/BMF están en proceso de evaluación con el protocolo unificado.

---

## 🔄 Pipeline de Datos

```
rating.csv ──► preprocess.py ──► df_train / df_test
                                        │
                     ┌──────────────────┼──────────────────┐
                     ▼                  ▼                  ▼
                  knn.py             pmf.py / bmf.py    gmf.py / mlp.py
                     │                  │                  │
                     ▼                  ▼                  ▼
            resultados_knn.csv   resultados_pmf.csv  *_weights.pth
                     │                  │              tuning_*.csv
                     └──────────────────┴──────────────────┘
                                        │
                              results/*_frontend.csv
                              results/models_summary.csv
                                        │
                                        ▼
                              anime-nexus (Next.js)
                              /api/models ──► GET JSON
                              dashboard  ──► D3 Force Graph, Radar, Heatmap
```

---

## 🖥️ Frontend — Anime Nexus Dashboard

Dashboard interactivo en **Next.js 14** con estética **Cyberpunk Neural Terminal** (fondo negro profundo, tipografía monoespaciada, glow effects en colores `#00f2ff`, `#fff000`, `#ff6b00`, `#ff00ff`, `#c084fc`).

### Páginas

#### `/` — Home (Análisis comparativo)
- **[01] Benchmark Results**: tabla dinámica con RMSE, MAE, Precision@10, nDCG@10 cargada vía `/api/models`.
- **[02] Mathematical Foundations**: tarjetas con las ecuaciones LaTeX de cada modelo (renderizadas con KaTeX).
- **[03] Gachapon Machine**: recomendación gamificada — el usuario arrastra la palanca, la máquina escoge un anime del top-10 y lo revela con animación física.

#### `/dashboard` — Análisis Técnico
Cuatro paneles de visualización interactivos, activados tras subir los CSVs de resultados:

| Panel | Componente | Descripción |
|-------|-----------|-------------|
| **KNN Force Graph** | `KnnForceGraph.tsx` | Grafo de fuerza D3 con los ítems como nodos y similitudes como aristas |
| **PMF / BMF Radar** | `PmfBmfRadar.tsx` | Radar chart con los factores latentes de dos ítems seleccionados |
| **NCF Heatmap** | `NcfHeatmap.tsx` | Mapa de calor de embeddings GMF vs MLP |
| **Battle Royale** | `battle/` | Comparación side-by-side de las top-10 recomendaciones de los cuatro modelos |

### API Interna

```
GET /api/models
```
Lee `results/models_summary.csv` desde disco y lo devuelve como JSON sin caché (`Cache-Control: no-store`). Esto garantiza que el dashboard siempre muestra los valores más recientes tras una ejecución del notebook.

### Gestión de Estado

**Zustand** (`lib/store.ts`) mantiene el estado global:
- `knnData`, `pmfData`, `bmfData`, `gmfData`, `mlpData` — resultados de cada modelo.
- `animeMetadata` — catálogo de anime para enriquecer las visualizaciones.

### Web Workers

El parsing del CSV de 111 MB (`rating.csv`) se delega a un Web Worker (`useCsvWorker.ts`) usando **PapaParse** para no bloquear el hilo principal.

### Integración Jikan API

`useJikanAnime.ts` enriquece los resultados con metadatos en tiempo real (imagen de portada, sinopsis, puntuación MAL) para los animes recomendados, vía la API pública de Jikan (no requiere autenticación).

---

## 📁 Estructura de Ficheros

```
Practica anime/
│
├── 📓 anime.ipynb                    # Notebook principal (9 secciones)
│   ├── Sección 1–2  Carga y EDA
│   ├── Sección 3    KNN
│   ├── Sección 4    PMF
│   ├── Sección 5    BMF
│   ├── Sección 6    GMF (Optuna)
│   ├── Sección 7    MLP (Optuna)
│   ├── Sección 8    Comparativa de modelos
│   └── Sección 9    Exportación al frontend
│
├── 🐍 preprocess.py                  # ETL del dataset
├── 🐍 generate_summary.py            # Genera results/models_summary.csv
│
├── algoritmos/
│   ├── knn.py                        # KNN item-based (cosine similarity)
│   ├── knn_optimo.py                 # Script búsqueda K óptimo con caché
│   ├── pmf.py                        # PMF con SGD y early stopping
│   ├── bmf_model.py                  # BMF bayesiana con factores Bernoulli
│   ├── gmf.py                        # GMF Neural CF (PyTorch)
│   ├── mlp.py                        # MLP Neural CF (PyTorch)
│   ├── hybrid.py                     # NCF híbrido GMF+MLP
│   └── ranking_eval.py               # evaluate_ranking_at_k() — protocolo unificado
│
├── data/
│   ├── anime.csv                     # ~12 K animes (metadatos)
│   └── rating.csv                    # ~7.8 M valoraciones (111 MB)
│
├── results/
│   ├── models_summary.csv            # ← Tabla maestra consumida por el dashboard
│   ├── GMF_weights.pth               # Pesos GMF óptimo (12 MB)
│   ├── MLP_weights.pth               # Pesos MLP óptimo (13 MB)
│   ├── tuning_gmf.csv                # Historial trials Optuna GMF
│   ├── tuning_mlp.csv                # Historial trials Optuna MLP
│   ├── tuning_pmf.csv                # Historial trials Optuna PMF
│   ├── resultados_knn.csv            # Similitudes KNN (formato frontend)
│   ├── resultados_pmf_frontend.csv   # Similitudes PMF (formato frontend)
│   ├── resultados_bmf_frontend.csv   # Similitudes BMF (formato frontend)
│   ├── resultados_gmf_frontend.csv   # Similitudes GMF (formato frontend)
│   └── resultados_mlp_frontend.csv   # Similitudes MLP (formato frontend)
│
└── anime-nexus/                      # Dashboard Next.js
    ├── app/
    │   ├── page.tsx                  # Home: benchmark + ecuaciones + Gachapon
    │   ├── dashboard/page.tsx        # Análisis técnico interactivo
    │   ├── api/models/route.ts       # GET /api/models → JSON desde CSV
    │   └── globals.css               # Design tokens: colores, tipografía, glows
    ├── components/
    │   ├── ModelComparisonTable.tsx  # Tabla comparativa dinámica
    │   ├── NexusHeader.tsx           # Cabecera con navegación
    │   ├── NexusStatusOverlay.tsx    # Overlay de estado de carga de datos
    │   ├── ResultUploadZone.tsx      # Zona de arrastrar y soltar CSVs
    │   ├── DashboardUploadPanel.tsx  # Panel de carga en dashboard vacío
    │   ├── DataDashboard.tsx         # Contenedor del dashboard técnico
    │   ├── viz/
    │   │   ├── KnnForceGraph.tsx     # Grafo de fuerza D3 (KNN)
    │   │   ├── PmfBmfRadar.tsx       # Radar chart (PMF/BMF)
    │   │   ├── NcfHeatmap.tsx        # Heatmap de embeddings NCF
    │   │   └── TechnicalAnalysis.tsx # Contenedor de los 4 paneles
    │   └── gachapon/
    │       ├── GachaponMachine.tsx   # Máquina Gachapon con física Framer Motion
    │       ├── CapsuleModal.tsx      # Modal de revelación de la cápsula
    │       └── useGachapon.ts        # Lógica de estado del Gachapon
    └── lib/
        ├── store.ts                  # Estado global Zustand
        ├── useCsvWorker.ts           # Web Worker para parsear CSVs pesados
        ├── useRecommendationData.ts  # Hook de carga y unión de datos
        └── useJikanAnime.ts          # Cliente de la Jikan API
```

---

## 🚀 Instalación y Ejecución

### Requisitos Previos

| Herramienta | Versión mínima |
|-------------|---------------|
| Python | 3.13 |
| [uv](https://docs.astral.sh/uv/) | última |
| Node.js | 18 LTS |
| npm | 9+ |

> Los ficheros `data/anime.csv` y `data/rating.csv` deben obtenerse del dataset público de [Kaggle — Anime Recommendations Database](https://www.kaggle.com/datasets/CooperUnion/anime-recommendations-database) y colocarse en la carpeta `data/`.

---

### 1. Entorno Python

```bash
# Instalar dependencias Python con uv
uv sync
```

### 2. Preprocesado del Dataset

```bash
uv run preprocess.py
```

Genera `df_train.parquet` y `df_test.parquet` en el directorio raíz.

### 3. Ejecución del Notebook

Abrir `anime.ipynb` en JupyterLab o VS Code y **ejecutar todas las celdas en orden**. El notebook completo:

1. Carga y exploración del dataset (EDA).
2. Búsqueda del K óptimo para KNN.
3. Entrenamiento y evaluación de PMF con Optuna.
4. Entrenamiento y evaluación de BMF.
5. Tuning de GMF con Optuna (20 trials).
6. Tuning de MLP con Optuna (20 trials).
7. Tabla comparativa final de todos los modelos.
8. Exportación de CSVs al formato del frontend.

> ⚠️ El entrenamiento completo de GMF y MLP puede tomar **15–30 minutos** dependiendo del hardware. Los pesos pre-entrenados en `results/` permiten omitir esta etapa.

### 4. Generar `models_summary.csv` (opcional)

Si se han actualizado los valores de métricas:

```bash
uv run generate_summary.py
```

### 5. Ejecutar los Modelos de Forma Independiente

Cada algoritmo puede ejecutarse como script standalone desde la carpeta `algoritmos/`:

```bash
cd algoritmos
uv run knn_optimo.py    # KNN — búsqueda del K óptimo
uv run gmf.py           # GMF — entrenamiento y evaluación
uv run mlp.py           # MLP — entrenamiento y evaluación
uv run bmf_model.py     # BMF — entrenamiento y evaluación
uv run pmf.py           # PMF — entrenamiento y evaluación
```

### 6. Frontend — Anime Nexus Dashboard

```bash
cd anime-nexus
npm install
npm run dev            # http://localhost:3001
```

El dashboard se conecta automáticamente a `/api/models` para cargar las métricas comparativas desde `results/models_summary.csv`.

Para visualizar los grafos de similitud en `/dashboard`, usar el panel de carga (drag & drop) con los ficheros:

```
results/resultados_knn.csv
results/resultados_pmf_frontend.csv
results/resultados_bmf_frontend.csv
results/resultados_gmf_frontend.csv
results/resultados_mlp_frontend.csv
```

---

## 📚 Dependencias

### Python (gestionado con `uv`)

| Paquete | Versión | Uso |
|---------|---------|-----|
| `torch` | ≥ 2.12 | Entrenamiento GMF y MLP |
| `optuna` | ≥ 4.8 | Optimización bayesiana de hiperparámetros |
| `pandas` | ≥ 3.0 | Manipulación de datos |
| `polars` | ≥ 1.40 | Parsing rápido de CSVs grandes |
| `numpy` | ≥ 2.4 | Álgebra lineal y métricas |
| `scikit-learn` | ≥ 1.8 | NearestNeighbors, partición de datos |
| `matplotlib` / `seaborn` | — | Visualizaciones en el notebook |
| `pyarrow` | ≥ 24 | Serialización Parquet |

### JavaScript / TypeScript (gestionado con `npm`)

| Paquete | Versión | Uso |
|---------|---------|-----|
| `next` | 14.2 | Framework React (App Router) |
| `react` | 18 | UI reactiva |
| `framer-motion` | 12 | Animaciones físicas (Gachapon, transiciones) |
| `d3` | 7 | Grafo de fuerza KNN |
| `recharts` | 3 | Radar charts y gráficas de tuning |
| `zustand` | 5 | Estado global ligero |
| `papaparse` | 5 | Parsing de CSVs en Web Worker |
| `lucide-react` | — | Iconografía |
| `tailwindcss` | 3.4 | Utilidades CSS |

---

## 🎨 Estética del Dashboard

El dashboard sigue la guía de estilo **"Cyberpunk Neural Terminal"**:

- **Paleta principal:** negro profundo `#050a0f` + surface `#0a1219`
- **Colores por modelo:** KNN `#00f2ff` · PMF `#fff000` · BMF `#ff6b00` · GMF `#ff00ff` · MLP `#c084fc`
- **Tipografía:** `Orbitron` (display) + `JetBrains Mono` (código/datos)
- **Efectos:** glassmorphism, glow (`text-shadow`, `box-shadow` con color), animaciones de entrada escalonadas

---

## 📄 Referencias

- He, X., Liao, L., Zhang, H., Nie, L., Hu, X., & Chua, T.-S. (2017). **Neural Collaborative Filtering**. *WWW '17*. [arXiv:1708.05031](https://arxiv.org/abs/1708.05031)
- Mnih, A., & Salakhutdinov, R. (2007). **Probabilistic Matrix Factorization**. *NeurIPS 2007*.
- Koren, Y., Bell, R., & Volinsky, C. (2009). **Matrix Factorization Techniques for Recommender Systems**. *Computer*.
- Akiba, T., et al. (2019). **Optuna: A Next-generation Hyperparameter Optimization Framework**. *KDD '19*.

---

*Proyecto desarrollado para la asignatura Computación Simbólica y Predictiva · ETSIT-UPM · 2025-2026*