# pmf.py

import os
import numpy as np
import pandas as pd
from scipy import sparse

class PMFRecommender:
    """
    Implementación sencilla de Probabilistic Matrix Factorization (PMF) con sesgos.

    El modelo predice una valoración con la siguiente fórmula:
        r̂ = μ + b_u + b_i + P_u · Q_i

    donde μ es la media global, b_u y b_i son los sesgos de usuario e ítem y
    P, Q son las matrices de factores latentes.
    """

    def __init__(self, n_users, n_items, n_factors=50, lr=0.005, reg=0.05,
                 random_state=42):
        # Hiperparámetros
        self.n_users = n_users
        self.n_items = n_items
        self.n_factors = n_factors
        self.lr = lr
        self.reg = reg
        self.random_state = random_state

        # Rango de valoraciones (por defecto de 1 a 10 para MAL)
        self.R_MIN = 1.0
        self.R_MAX = 10.0

        # Inicialización reproducible
        np.random.seed(self.random_state)
        self.P = np.random.normal(0, 0.1, (n_users, n_factors)).astype('float32')
        self.Q = np.random.normal(0, 0.1, (n_items, n_factors)).astype('float32')
        self.bu = np.zeros(n_users, dtype='float32')
        self.bi = np.zeros(n_items, dtype='float32')
        self.mu = 0.0  # media global

    def _compute_rmse(self, R_sparse):
        """Calcula el RMSE solo sobre las entradas observadas de una matriz dispersa."""
        coo = R_sparse.tocoo()
        users = coo.row
        items = coo.col
        ratings = coo.data
        # Predicciones vectorizadas
        preds = self.mu + self.bu[users] + self.bi[items] + np.sum(self.P[users] * self.Q[items], axis=1)
        preds = np.clip(preds, self.R_MIN, self.R_MAX)
        return float(np.sqrt(np.mean((ratings - preds) ** 2)))

    def fit(self, R_train, R_test, mu, epochs=20, patience=3):
        """
        Entrena el modelo mediante descenso por gradiente estocástico (SGD).
        Devuelve un diccionario con el historial de RMSE y el mejor RMSE en test.
        """
        self.mu = float(mu)
        coo = R_train.tocoo()
        train_users = coo.row.astype(int)
        train_items = coo.col.astype(int)
        train_ratings = coo.data.astype('float32')
        n_ratings = len(train_ratings)

        history = {"train_rmse": [], "test_rmse": []}
        best_rmse = float('inf')
        no_improve = 0
        # Copias para restaurar el mejor modelo
        best_P = self.P.copy()
        best_Q = self.Q.copy()
        best_bu = self.bu.copy()
        best_bi = self.bi.copy()

        for epoch in range(epochs):
            # Barajar índices para SGD
            indices = np.random.permutation(n_ratings)
            for idx in indices:
                u = train_users[idx]
                i = train_items[idx]
                r = train_ratings[idx]
                # Predicción y error
                r_hat = self.mu + self.bu[u] + self.bi[i] + np.dot(self.P[u], self.Q[i])
                e = r - r_hat
                # Copia de P[u]
                pu_old = self.P[u].copy()
                # Actualización de factores
                self.P[u] += self.lr * (e * self.Q[i] - self.reg * self.P[u])
                self.Q[i] += self.lr * (e * pu_old - self.reg * self.Q[i])
                # Actualización de sesgos
                self.bu[u] += self.lr * (e - self.reg * self.bu[u])
                self.bi[i] += self.lr * (e - self.reg * self.bi[i])

            # Evaluación por época
            train_rmse = self._compute_rmse(R_train)
            test_rmse = self._compute_rmse(R_test)
            history["train_rmse"].append(train_rmse)
            history["test_rmse"].append(test_rmse)
            print(
                f"  Época {epoch+1:2d}/{epochs} | Train RMSE: {train_rmse:.4f} | Test RMSE: {test_rmse:.4f}"
            )
            # Comprobar mejora
            if test_rmse < best_rmse - 1e-4:
                best_rmse = test_rmse
                best_P = self.P.copy()
                best_Q = self.Q.copy()
                best_bu = self.bu.copy()
                best_bi = self.bi.copy()
                no_improve = 0
            else:
                no_improve += 1
                if no_improve >= patience:
                    print(f"Early stopping en la época {epoch+1}")
                    break

        # Restaurar el mejor modelo
        self.P = best_P
        self.Q = best_Q
        self.bu = best_bu
        self.bi = best_bi
        return history, best_rmse

    def predict(self, user_id, item_id):
        """Devuelve la predicción de un usuario e ítem dados, o None si están fuera de rango."""
        if user_id < 0 or user_id >= self.n_users or item_id < 0 or item_id >= self.n_items:
            return None
        pred = self.mu + self.bu[user_id] + self.bi[item_id] + np.dot(self.P[user_id], self.Q[item_id])
        pred = np.clip(pred, self.R_MIN, self.R_MAX)
        return float(pred)

    def evaluate_predictions(self, R_test):
        """Devuelve un DataFrame con las valoraciones reales y predichas para el conjunto de test."""
        coo = R_test.tocoo()
        rows = coo.row.astype(int)
        cols = coo.col.astype(int)
        ratings = coo.data.astype('float32')
        preds = self.mu + self.bu[rows] + self.bi[cols] + np.sum(self.P[rows] * self.Q[cols], axis=1)
        preds = np.clip(preds, self.R_MIN, self.R_MAX)
        return pd.DataFrame({
            "user_id": rows,
            "anime_id": cols,
            "rating_real": ratings,
            "rating_predicho": np.round(preds, 2)
        })

    def recommend(self, user_id, df_train, top_n=10):
        """Recomienda ítems no valorados previamente por el usuario, ordenados por la predicción."""
        if user_id < 0 or user_id >= self.n_users:
            return pd.DataFrame()
        valorados = set(df_train[df_train["user_id"] == user_id]["anime_id"].values)
        recomendaciones = []
        for i in range(self.n_items):
            if i not in valorados:
                pred = self.predict(user_id, i)
                if pred is not None:
                    recomendaciones.append({"anime_id": i, "predicted_rating": round(pred, 2)})
        recomendaciones = sorted(recomendaciones, key=lambda x: x["predicted_rating"], reverse=True)
        return pd.DataFrame(recomendaciones[:top_n])


def run_pmf(
    R_train_sparse,
    R_test_sparse,
    mu,
    n_users,
    n_items,
    n_factors=50,
    lr=0.005,
    reg=0.05,
    epochs=20,
    patience=3,
    random_state=42,
    results_file="results/resultados_pmf.csv",
    preds_file="results/predicciones_pmf.csv",
    force_recompute=False
):
    """
    Crea, entrena y evalúa un modelo PMF.

    Si los resultados ya existen y no se fuerza el recálculo,
    se cargan desde disco.

    Devuelve:
        df_results, pmf, best_rmse, df_preds
    """

    os.makedirs(os.path.dirname(results_file), exist_ok=True)

    # Si ya existen resultados y no queremos recalcular, los cargamos
    if os.path.exists(results_file) and os.path.exists(preds_file) and not force_recompute:
        print(f"Cargando resultados PMF guardados previamente desde {results_file}...")

        df_results = pd.read_csv(results_file)
        df_preds = pd.read_csv(preds_file)

        best_rmse = df_results["test_RMSE"].min()

        print(">> Inicializando modelo PMF sin reentrenar...")
        print("Aviso: el modelo devuelto no contiene pesos entrenados, solo resultados y predicciones guardadas.")

        pmf = PMFRecommender(
            n_users=n_users,
            n_items=n_items,
            n_factors=n_factors,
            lr=lr,
            reg=reg,
            random_state=random_state
        )

        return df_results, pmf, best_rmse, df_preds

    print(">> Inicializando modelo PMF...")

    pmf = PMFRecommender(
        n_users=n_users,
        n_items=n_items,
        n_factors=n_factors,
        lr=lr,
        reg=reg,
        random_state=random_state
    )

    print(">> Entrenando modelo PMF...")

    history, best_rmse = pmf.fit(
        R_train=R_train_sparse,
        R_test=R_test_sparse,
        mu=mu,
        epochs=epochs,
        patience=patience
    )

    df_results = pd.DataFrame({
        "epoch": list(range(1, len(history["train_rmse"]) + 1)),
        "train_RMSE": history["train_rmse"],
        "test_RMSE": history["test_rmse"]
    })

    df_results.to_csv(results_file, index=False)

    print(f"Resultados PMF guardados en '{results_file}'")

    df_preds = pmf.evaluate_predictions(R_test_sparse)
    df_preds.to_csv(preds_file, index=False)

    print(f"Predicciones PMF guardadas en '{preds_file}'")
    print(f"Mejor RMSE test: {best_rmse:.4f}")

    return df_results, pmf, best_rmse, df_preds