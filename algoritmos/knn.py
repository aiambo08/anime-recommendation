import math
import numpy as np
import pandas as pd
import os

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
        errores_absolutos = []
        predicciones_log = []
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
                errores_absolutos.append(abs(prediccion - rating_real))
                predicciones_log.append({
                    'user_id': u,
                    'anime_id': i,
                    'rating_real': rating_real,
                    'rating_predicho': round(prediccion, 2)
                })
                
        if len(errores_cuadraticos) == 0:
            return float('inf'), float('inf'), 0.0, pd.DataFrame()
            
        rmse = math.sqrt(sum(errores_cuadraticos) / len(errores_cuadraticos))
        mae = sum(errores_absolutos) / len(errores_absolutos)
        cobertura = (total_test - no_predecibles) / total_test * 100
        
        df_preds = pd.DataFrame(predicciones_log)
        return rmse, mae, cobertura, df_preds


def generar_resultados_knn_frontend(df_train, n_neighbors=6, output_file='results/resultados_knn.csv'):
    """
    Genera un archivo CSV con las relaciones Source-Target a partir de un modelo KNN 
    para ser visualizadas en el frontend (anime-nexus). Basado en sklearn NearestNeighbors.
    """
    from sklearn.neighbors import NearestNeighbors
    from scipy.sparse import csr_matrix
    
    print(">> Generando métricas KNN Item-Item con sklearn para frontend...")
    
    # Crear mappear de IDs a índices
    user_ids = df_train['user_id'].unique()
    anime_ids = df_train['anime_id'].unique()
    
    user2idx = {u: idx for idx, u in enumerate(user_ids)}
    anime2idx = {a: idx for idx, a in enumerate(anime_ids)}
    idx2anime = {idx: a for a, idx in anime2idx.items()}
    
    NUM_USERS = len(user2idx)
    NUM_ITEMS = len(anime2idx)
    
    row_idx = df_train['user_id'].map(user2idx).values
    col_idx = df_train['anime_id'].map(anime2idx).values
    
    # Matriz User-Item
    matrix_user_item = csr_matrix(
        (df_train['rating'].values.astype('float32'), (row_idx, col_idx)),
        shape=(NUM_USERS, NUM_ITEMS)
    )
    
    item_item_matrix = matrix_user_item.transpose()
    knn_model = NearestNeighbors(metric='cosine', algorithm='brute')
    knn_model.fit(item_item_matrix)
    
    distances, indices = knn_model.kneighbors(item_item_matrix, n_neighbors=n_neighbors)
    
    resultados = []
    for i in range(len(idx2anime)):
        source_anime = idx2anime[i]
        
        for j in range(1, len(indices[i])):
            target_anime = idx2anime[indices[i][j]]
            distancia = distances[i][j]
            similitud = 1 - distancia if distancia <= 1 else 1 / (1 + distancia)
            
            resultados.append({
                'source': source_anime,
                'target': target_anime,
                'distance': distancia,
                'similarity': similitud,
                'rank': j
            })
            
    df_knn_results = pd.DataFrame(resultados)
    df_knn_results.to_csv(output_file, index=False)
    print(f"✅ Resultados KNN exportados correctamente al frontend en {output_file}")


def run_knn(df_train, df_test, k_values=[5, 10, 20, 30, 50], sim_metric='jmsd', results_file='results/resultados_k_optimo.csv', force_recompute=False):
    # Crear la carpeta de resultados si no existe
    os.makedirs(os.path.dirname(results_file), exist_ok=True)
    
    # # Generar resultados para el frontend si no existen
    # frontend_file = 'results/resultados_knn.csv'
    # if not os.path.exists(frontend_file):
    #     generar_resultados_knn_frontend(df_train, n_neighbors=6, output_file=frontend_file)

    print(">> Inicializando modelo KNN...")
    knn = KNNRecommender(df_train)

    # Si existe el archivo y NO forzamos recalcular, leemos de disco
    if os.path.exists(results_file) and not force_recompute:
        print(f"Cargando resultados de K guardados previamente desde {results_file}...")
        df_results = pd.read_csv(results_file)
        
        # Extraemos automáticamente el mejor K basado en el menor RMSE
        best_k = int(df_results.loc[df_results['RMSE'].idxmin(), 'K'])
        print(f">> Generando predicciones de muestra para el mejor K (k = {best_k}) a partir del test...")
        
        # Evaluamos rápidamente el test sample solo con el best_k para obtener la muestra de predicciones
        _, _, _, best_df_preds = knn.evaluate(df_test, best_k, sim_metric)
        
        return df_results, knn, best_k, best_df_preds

    # Si no existe el archivo o forzamos recalcular
    print(f">> Evaluando KNN con métrica: {sim_metric}")
    results = []
    best_k = None
    best_df_preds = None
    best_rmse = float('inf')
    
    for k in k_values:
        rmse_k, mae_k, cobertura_k, df_preds_k = knn.evaluate(df_test, k, sim_metric)
        results.append({
            'K': k, 
            'RMSE': rmse_k,
            'MAE': mae_k,
            'Cobertura': cobertura_k
        })
        print(f"  K={k:3d} | RMSE: {rmse_k:.4f} | MAE: {mae_k:.4f} | Cobertura: {cobertura_k:.2f}%")
        
        if rmse_k < best_rmse:
            best_rmse = rmse_k
            best_k = k
            best_df_preds = df_preds_k
            
    df_results = pd.DataFrame(results)
    df_results.to_csv(results_file, index=False)
    print(f"Resultados guardados de búsqueda en '{results_file}'")
    
    return df_results, knn, best_k, best_df_preds

if __name__ == "__main__":
    pass
