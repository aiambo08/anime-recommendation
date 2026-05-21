# algoritmos/ranking_eval.py
"""
Módulo de evaluación de ranking unificada.

Proporciona una única función `evaluate_ranking_at_k` que aplica el mismo
protocolo a todos los modelos (KNN, PMF, BMF, GMF, MLP), garantizando que
Precision@K y NDCG@K sean directamente comparables entre ellos.

Protocolo elegido: FULL TEST SET sin negative sampling.
  - Evaluación sobre TODOS los pares (usuario, ítem) del test set.
  - Un ítem es relevante si su rating real >= threshold.
  - Top-K se forma con los K ítems mejor predichos por cada modelo
    entre los que el usuario tiene en su test set.

Justificación de la elección:
  El protocolo de negative sampling (NBR) es más común en la literatura NCF
  (He et al., 2017) pero requiere un modelo que puntúe ítems no observados.
  El protocolo full test set es más conservador y válido para comparar
  simultáneamente modelos basados en predicción de rating (PMF, KNN) y
  modelos de ranking puro (NCF), siempre que la comparación se haga sobre
  el mismo subconjunto de ítems del test.

Uso:
    from algoritmos.ranking_eval import evaluate_ranking_at_k

    # Modelo con método predict_batch(users, items) → array de scores
    p_at_k, ndcg_at_k = evaluate_ranking_at_k(
        predict_fn = lambda u, i: model.predict_batch(u, i),
        df_test    = df_test,
        k          = 10,
        threshold  = 7.0
    )
"""

import numpy as np
import pandas as pd


def evaluate_ranking_at_k(predict_fn, df_test, k=10, threshold=7.0):
    """
    Calcula Precision@K y NDCG@K sobre el test set completo.

    Parámetros
    ----------
    predict_fn : callable
        Función que acepta (users_array, items_array) → scores_array.
        Los arrays son np.ndarray de int64.
    df_test : pd.DataFrame
        DataFrame con columnas ['user_id', 'anime_id', 'rating'].
    k : int
        Longitud de la lista de recomendación a evaluar.
    threshold : float
        Umbral de rating a partir del cual un ítem se considera relevante.

    Retorna
    -------
    precision_at_k : float
    ndcg_at_k : float
    """
    precisions = []
    ndcgs = []

    for user_id, grupo in df_test.groupby("user_id"):
        if len(grupo) == 0:
            continue

        users_arr = grupo["user_id"].values.astype(np.int64)
        items_arr = grupo["anime_id"].values.astype(np.int64)
        real_ratings = grupo["rating"].values.astype(np.float32)

        # Obtener scores del modelo
        scores = predict_fn(users_arr, items_arr)
        scores = np.asarray(scores, dtype=np.float32)

        # Top-K por score descendente (partición eficiente)
        n = len(scores)
        effective_k = min(k, n)

        if effective_k == n:
            top_k_idx = np.arange(n)
        else:
            top_k_idx = np.argpartition(scores, -effective_k)[-effective_k:]

        # Ordenar los top-K por score (de mayor a menor)
        top_k_idx = top_k_idx[np.argsort(scores[top_k_idx])[::-1]]

        top_k_real = real_ratings[top_k_idx]

        # ── Precision@K ──────────────────────────────────────────────────────
        # Fracción de ítems en el top-K que son relevantes.
        # Denominador = min(k, |test del usuario|) para no penalizar usuarios
        # con pocos ítems en test.
        hits = np.sum(top_k_real >= threshold)
        precisions.append(hits / effective_k)

        # ── NDCG@K ───────────────────────────────────────────────────────────
        # Ganancia binaria: rel=1 si rating >= threshold, rel=0 si no.
        # Esto evita que ratings extremos (ej: 10) dominen sobre ratings buenos
        # (ej: 8), haciendo la métrica más interpretable y estable.
        relevance = (top_k_real >= threshold).astype(np.float32)
        positions = np.arange(1, effective_k + 1, dtype=np.float32)
        dcg = np.sum(relevance / np.log2(positions + 1))

        # IDCG: colocar todos los relevantes al principio
        n_relevant = int(np.sum(real_ratings >= threshold))
        ideal_relevance = np.zeros(effective_k, dtype=np.float32)
        ideal_relevance[:min(n_relevant, effective_k)] = 1.0
        idcg = np.sum(ideal_relevance / np.log2(positions + 1))

        ndcgs.append(dcg / idcg if idcg > 0 else 0.0)

    precision_at_k = float(np.mean(precisions)) if precisions else 0.0
    ndcg_at_k = float(np.mean(ndcgs)) if ndcgs else 0.0

    return precision_at_k, ndcg_at_k


def make_predict_fn_from_df(model_predict, clip_min=1.0, clip_max=10.0):
    """
    Envuelve un método predict(user, item) -> float en una función vectorizada.
    Útil para KNN y PMF que no tienen predict_batch nativo.

    Ejemplo:
        fn = make_predict_fn_from_df(knn.prediction_knn_with_k(k=10))
        p, n = evaluate_ranking_at_k(fn, df_test)
    """
    def predict_fn(users, items):
        scores = []
        for u, i in zip(users, items):
            s = model_predict(u, i)
            scores.append(s if s is not None else clip_min)
        return np.clip(np.array(scores, dtype=np.float32), clip_min, clip_max)
    return predict_fn
