import math
import numpy as np
import pandas as pd

class KNNRecommender:
    def __init__(self, df_train):
        """
        Inicializa las estructuras de datos necesarias para las consultas rápidas
        de los vecinos en K-Nearest Neighbors.
        """
        self.R_MIN = 1
        self.R_MAX = 10
        
        print("Construyendo matriz interna KNN...")
        self.ratings_train = {}
        for row in df_train.itertuples(index=False):
            u, i, r = row.user_id, row.anime_id, row.rating
            if u not in self.ratings_train:
                self.ratings_train[u] = {}
            self.ratings_train[u][i] = r

        self.items_por_usuario_train = {u: set(v.keys()) for u, v in self.ratings_train.items()}

        self.usuarios_por_item_train = {}
        for u, items in self.items_por_usuario_train.items():
            for i in items:
                self.usuarios_por_item_train.setdefault(i, set()).add(u)

        self.items_train = set(df_train["anime_id"].unique())
        
        # Cache medias
        self.user_means_cache = {u: self._rating_average_train(u) for u in self.ratings_train}

    def _rating_average_train(self, u):
        if u not in self.ratings_train:
            return np.nan
        votos = self.ratings_train.get(u, {})
        return sum(votos.values()) / len(votos) if votos else np.nan

    def correlation_similarity(self, u, v):
        if u not in self.ratings_train or v not in self.ratings_train:
            return None
        items_comunes = self.items_por_usuario_train[u].intersection(self.items_por_usuario_train[v])
        if len(items_comunes) == 0:
            return None
            
        media_u = self.user_means_cache[u]
        media_v = self.user_means_cache[v]
        num, denom, denom1 = 0, 0, 0
        
        for i in items_comunes:
            diff_u = self.ratings_train[u][i] - media_u
            diff_v = self.ratings_train[v][i] - media_v
            num += diff_u * diff_v
            denom += diff_u ** 2
            denom1 += diff_v ** 2
            
        denominador = np.sqrt(denom1 * denom)
        return num / denominador if denominador > 0 else None

    def jmsd_similarity(self, u, v):
        if u not in self.ratings_train or v not in self.ratings_train:
            return None
        items_comun = self.items_por_usuario_train[u].intersection(self.items_por_usuario_train[v])
        if len(items_comun) == 0:
            return None
            
        items_union = self.items_por_usuario_train[u].union(self.items_por_usuario_train[v])
        jaccard = len(items_comun) / len(items_union)
        
        cuadr_diff = sum((self.ratings_train[u][i] - self.ratings_train[v][i])**2 for i in items_comun)
        msd = (1 / len(items_comun)) * cuadr_diff
        return jaccard * (1 - msd)

    def prediction_knn(self, u, i, k, sim_metric='jmsd'):
        if u not in self.ratings_train or i not in self.items_train:
            return None
        
        sim_func = self.jmsd_similarity if sim_metric == 'jmsd' else self.correlation_similarity

        candidatos = []
        for v in self.usuarios_por_item_train.get(i, set()):
            if v == u:
                continue
            sim = sim_func(u, v)
            if sim is not None:
                candidatos.append((v, sim))
        
        if not candidatos:
            return None

        top_k_vecinos = sorted(candidatos, key=lambda x: x[1], reverse=True)[:k]
        media_u = self.user_means_cache[u]
        num = denom = 0.0
        
        for v, sim in top_k_vecinos:
            media_v = self.user_means_cache[v]
            num += sim * (self.ratings_train[v][i] - media_v)
            denom += abs(sim)
        
        if denom == 0:
            return None
        
        pred = media_u + num / denom
        return float(np.clip(pred, self.R_MIN, self.R_MAX))

    def evaluate(self, test_df, k, sim_metric='jmsd'):
        errores_cuadraticos = []
        no_predecibles = 0
        total_test = len(test_df)
        
        for row in test_df.itertuples(index=False):
            u = row.user_id
            i = row.anime_id
            rating_real = row.rating
            
            prediccion = self.prediction_knn(u, i, k, sim_metric)
            
            if prediccion is None:
                no_predecibles += 1
            else:
                errores_cuadraticos.append((prediccion - rating_real) ** 2)
                
        if len(errores_cuadraticos) == 0:
            return float('inf'), 0.0
            
        rmse = math.sqrt(sum(errores_cuadraticos) / len(errores_cuadraticos))
        cobertura = (total_test - no_predecibles) / total_test * 100
        return rmse, cobertura


def run_knn(df_train, df_test, k_values=[5, 10, 20], sim_metric='jmsd'):
    print(">> Inicializando modelo KNN...")
    knn = KNNRecommender(df_train)
    
    results = []
    print(f">> Evaluando KNN con métrica: {sim_metric}")
    for k in k_values:
        rmse_k, cobertura_k = knn.evaluate(df_test, k, sim_metric)
        results.append({'K': k, 'RMSE': rmse_k, 'Cobertura': cobertura_k})
        print(f"  K={k:3d} | RMSE: {rmse_k:.4f} | Cobertura: {cobertura_k:.2f}%")
        
    return pd.DataFrame(results), knn

if __name__ == "__main__":
    pass
