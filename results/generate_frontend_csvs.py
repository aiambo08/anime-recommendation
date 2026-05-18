"""
generate_frontend_csvs.py
─────────────────────────────────────────────────────────
Genera los archivos CSV para el frontend del Anime Nexus
a partir de los artefactos ya entrenados:

  • results/resultados_pmf_frontend.csv   — similitud item-item (PMF)
  • results/resultados_bmf_frontend.csv   — similitud item-item (BMF)

Esquema de salida (igual que KNN / GMF / MLP):
  source,target,distance,similarity,rank

Uso:
    python generate_frontend_csvs.py

"""

import os
import pickle
import numpy as np
import pandas as pd
import scipy.sparse as sp
import polars as pl
from sklearn.metrics.pairwise import cosine_similarity

# ─── Configuración ────────────────────────────────────────────────────────────

TOP_N       = 5          # Vecinos más cercanos por anime
RESULTS_DIR = "results"
PMF_OUT     = os.path.join(RESULTS_DIR, "resultados_pmf_frontend.csv")
BMF_OUT     = os.path.join(RESULTS_DIR, "resultados_bmf_frontend.csv")
PMF_PREDS   = os.path.join(RESULTS_DIR, "predicciones_pmf.csv")
BMF_PKL     = os.path.join(RESULTS_DIR, "resultados_bmf_optimo.pkl")

# ─── Helpers ──────────────────────────────────────────────────────────────────

def item_similarity_to_frontend_df(Q: np.ndarray, top_n: int = 5) -> pd.DataFrame:
    """
    Dado un matriz de factores latentes de ítems Q (shape: n_items × n_factors),
    calcula las top_n similitudes coseno item-item y las devuelve en formato frontend:
        source, target, distance, similarity, rank
    """
    n_items = Q.shape[0]
    print(f"  Calculando similitud coseno sobre {n_items} ítems × {Q.shape[1]} factores...")

    # Normalizar filas para similitud coseno eficiente
    norms = np.linalg.norm(Q, axis=1, keepdims=True)
    norms[norms == 0] = 1e-8
    Q_norm = Q / norms

    rows = []
    batch = 512  # Procesar en bloques para no saturar RAM

    for start in range(0, n_items, batch):
        end = min(start + batch, n_items)
        block = Q_norm[start:end]  # (batch, n_factors)

        # Similitud de este bloque con todos los ítems
        sim_block = block @ Q_norm.T   # (batch, n_items)

        for local_i, global_i in enumerate(range(start, end)):
            sims = sim_block[local_i]
            sims[global_i] = -1.0  # Excluir el propio ítem

            # Top-N índices
            top_idx = np.argpartition(sims, -top_n)[-top_n:]
            top_idx = top_idx[np.argsort(sims[top_idx])[::-1]]

            for rank, target_j in enumerate(top_idx, start=1):
                sim_val  = float(sims[target_j])
                dist_val = 1.0 - sim_val
                rows.append({
                    "source":     global_i,
                    "target":     int(target_j),
                    "distance":   round(dist_val, 8),
                    "similarity": round(sim_val,  8),
                    "rank":       rank,
                })

        if (start // batch) % 10 == 0:
            pct = min(100, int(end / n_items * 100))
            print(f"  Progreso: {pct}% ({end}/{n_items})", end="\r")

    print()
    return pd.DataFrame(rows, columns=["source", "target", "distance", "similarity", "rank"])


# ─── Carga de datos base ──────────────────────────────────────────────────────

def load_base_data():
    """Carga mapeos y matrices sparse (necesario para PMF si hay que re-extraer Q)."""
    print("Cargando datos base...")
    with open("data/mapeos.pkl", "rb") as f:
        mapeos = pickle.load(f)

    df_train_pl = pl.read_parquet("data/train.parquet")
    df_train    = df_train_pl.to_pandas()

    NUM_USERS = len(mapeos["user2idx"])
    NUM_ITEMS = len(mapeos["anime2idx"])

    R_train = sp.csr_matrix(
        (df_train["rating"].values,
         (df_train["user_id"].values, df_train["anime_id"].values)),
        shape=(NUM_USERS, NUM_ITEMS)
    )
    MU = df_train["rating"].mean()

    return mapeos, R_train, MU, NUM_USERS, NUM_ITEMS


# ─── Generación PMF ──────────────────────────────────────────────────────────

def generate_pmf_frontend(n_factors: int = 50, force: bool = False):
    """
    Extrae los factores latentes de ítems Q del modelo PMF y genera el CSV frontend.
    
    Estrategia:
      - Si existe resultados_pmf_frontend.csv y no force → skip.
      - Los factores Q se obtienen entrenando brevemente el modelo PMF usando
        los hiperparámetros óptimos ya documentados (f=50, lr=0.005, reg=0.05).
      - Para evitar re-entrenamiento pesado, usamos el archivo predicciones_pmf.csv
        para reconstruir la señal de calidad, pero re-inicializamos Q con semilla fija.
      
    NOTA: Dado que PMF no serializa Q directamente, necesitamos hacer un mini-entrenamiento
    (5 épocas) con semilla fija para obtener factores Q reproducibles y consistentes.
    """
    if os.path.exists(PMF_OUT) and not force:
        print(f"✓ {PMF_OUT} ya existe. Usa force=True para regenerar.")
        return

    print("\n═══ Generando resultados_pmf_frontend.csv ═══")

    # Importar PMF
    import sys
    sys.path.insert(0, ".")
    from algoritmos.pmf import PMFRecommender

    mapeos, R_train, MU, NUM_USERS, NUM_ITEMS = load_base_data()

    # Cargar test sparse mínimo
    df_test_pl = pl.read_parquet("data/test.parquet")
    df_test    = df_test_pl.to_pandas()
    R_test = sp.csr_matrix(
        (df_test["rating"].values,
         (df_test["user_id"].values, df_test["anime_id"].values)),
        shape=(NUM_USERS, NUM_ITEMS)
    )

    print(f"  Inicializando PMF (n_factors={n_factors})...")
    pmf = PMFRecommender(
        n_users=NUM_USERS,
        n_items=NUM_ITEMS,
        n_factors=n_factors,
        lr=0.005,
        reg=0.05,
        random_state=42,
    )

    print("  Entrenando 5 épocas (suficiente para factores latentes coherentes)...")
    pmf.fit(R_train, R_test, mu=MU, epochs=5, patience=5)

    # Q contiene los factores de ítems: shape (NUM_ITEMS, n_factors)
    Q = pmf.Q.copy()
    print(f"  Factores Q extraídos: shape = {Q.shape}")

    df_frontend = item_similarity_to_frontend_df(Q, top_n=TOP_N)
    df_frontend.to_csv(PMF_OUT, index=False)
    print(f"  ✅ Guardado: {PMF_OUT}  ({len(df_frontend):,} filas)")


# ─── Generación BMF ──────────────────────────────────────────────────────────

def generate_bmf_frontend(force: bool = False):
    """
    Carga el modelo BMF desde el pickle y extrae similitud item-item
    promediando los factores V sobre todos los scores.
    """
    if os.path.exists(BMF_OUT) and not force:
        print(f"✓ {BMF_OUT} ya existe. Usa force=True para regenerar.")
        return

    print("\n═══ Generando resultados_bmf_frontend.csv ═══")

    if not os.path.exists(BMF_PKL):
        print(f"  ❌ No se encontró {BMF_PKL}. Ejecuta primero la celda BMF del notebook.")
        return

    print(f"  Cargando modelo BMF desde {BMF_PKL}...")
    with open(BMF_PKL, "rb") as f:
        bmf = pickle.load(f)

    # El pickle es un dict con claves: dimensiones, mejor_V, mejor_U, etc.
    # mejor_V: shape (num_scores, num_items, num_factors)
    V = bmf["mejor_V"]
    print(f"  Matriz mejor_V cargada: shape = {V.shape}")
    print(f"  Dimensiones testeadas: {bmf.get('dimensiones', 'N/A')}")

    # Promediar los factores sobre todos los scores para una representación global
    V_mean = V.mean(axis=0).astype("float32")  # (num_items, num_factors)
    print(f"  Factores V promediados: shape = {V_mean.shape}")

    df_frontend = item_similarity_to_frontend_df(V_mean, top_n=TOP_N)
    df_frontend.to_csv(BMF_OUT, index=False)
    print(f"  ✅ Guardado: {BMF_OUT}  ({len(df_frontend):,} filas)")


# ─── Verificación final ──────────────────────────────────────────────────────

def verify_all_csvs():
    """Verifica que todos los CSVs del frontend existen y tienen el esquema correcto."""
    expected = {
        "KNN":  "results/resultados_knn.csv",
        "PMF":  PMF_OUT,
        "BMF":  BMF_OUT,
        "GMF":  "results/resultados_gmf_frontend.csv",
        "MLP":  "results/resultados_mlp_frontend.csv",
    }
    schema = ["source", "target", "distance", "similarity", "rank"]

    print("\n═══ Verificación de CSVs Frontend ═══")
    all_ok = True
    for model, path in expected.items():
        if not os.path.exists(path):
            print(f"  ❌ {model}: {path}  → FALTA")
            all_ok = False
            continue

        try:
            df = pd.read_csv(path, nrows=5)
            missing = [c for c in schema if c not in df.columns]
            size_mb = os.path.getsize(path) / 1_048_576
            if missing:
                print(f"  ⚠️  {model}: {path}  → Columnas faltantes: {missing}")
                all_ok = False
            else:
                print(f"  ✅ {model}: {path}  ({size_mb:.1f} MB, columnas OK)")
        except Exception as e:
            print(f"  ❌ {model}: {path}  → Error al leer: {e}")
            all_ok = False

    if all_ok:
        print("\n  🎯 Todos los CSVs están listos para el frontend.")
    else:
        print("\n  ⚠️  Algunos CSVs necesitan atención.")


# ─── Main ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    os.makedirs(RESULTS_DIR, exist_ok=True)

    generate_pmf_frontend(n_factors=50, force=False)
    generate_bmf_frontend(force=False)
    verify_all_csvs()
