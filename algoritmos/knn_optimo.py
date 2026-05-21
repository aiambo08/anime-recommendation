import math
import numpy as np
import pandas as pd
import os
from scipy.sparse import csr_matrix
from sklearn.metrics.pairwise import cosine_similarity

class KNNRecommender:
    def __init__(self, df_train):
        self.R_MIN = 1.0
        self.R_MAX = 10.0
        
        print(">> Construyendo matrices dispersas para KNN Vectorizado...")
        
        # 1. Map IDs
        self.user_ids = df_train['user_id'].unique()
        self.anime_ids = df_train['anime_id'].unique()
        self.user2idx = {u: idx for idx, u in enumerate(self.user_ids)}
        self.anime2idx = {a: idx for idx, a in enumerate(self.anime_ids)}
        
        row_idx = df_train['user_id'].map(self.user2idx).values
        col_idx = df_train['anime_id'].map(self.anime2idx).values
        data = df_train['rating'].values.astype('float32')
        
        self.n_users = len(self.user_ids)
        self.n_items = len(self.anime_ids)
        
        # 2. Matrices 
        # (CSR -> Óptimo para filas/usuarios | CSC -> Óptimo para columnas/ítems)
        self.R_sparse = csr_matrix((data, (row_idx, col_idx)), shape=(self.n_users, self.n_items))
        
        # 3. Precalcular Medias por Usuario
        sums = self.R_sparse.sum(axis=1).A1
        counts = self.R_sparse.getnnz(axis=1)
        self.user_means = np.divide(sums, counts, out=np.zeros_like(sums), where=counts!=0)
        
        # 4. Matriz Vectorizada de Ratings Centralizados (Rating - Media)
        # La similitud coseno en datos centrados en medias es = Correlación de Pearson
        self.R_norm_sparse = self.R_sparse.copy()
        for i in range(self.n_users):
            if counts[i] > 0:
                idx_start = self.R_norm_sparse.indptr[i]
                idx_end = self.R_norm_sparse.indptr[i+1]
                self.R_norm_sparse.data[idx_start:idx_end] -= self.user_means[i]
        
        # Convertir a CSC nos permite encontrar qué usuarios valoraron X ítem inmediatamente
        self.R_norm_csc = self.R_norm_sparse.tocsc()
        
        # Sistema de Caché Interno para lotes (batch) de similitud
        self._test_users_cache = None
        self._sim_batch_cache = None
        self._u_idx_map_cache = {}

    def _prepare_sim_batch(self, test_df):
        """Calcula de forma masiva (Dot Product) la similitud Pearson de los usuarios del Test vs Todo el Train.
        Esto elimina millones de iteraciones."""
        test_users = test_df['user_id'].unique()
        # Si la lista de test users es la misma que la iteración de K anterior, reutilizamos similitud
        if self._test_users_cache is not None and np.array_equal(self._test_users_cache, test_users):
            return 
            
        test_u_idx = [self.user2idx[u] for u in test_users if u in self.user2idx]
        self._sim_batch_cache = cosine_similarity(self.R_norm_sparse[test_u_idx], self.R_norm_sparse, dense_output=True)
        self._u_idx_map_cache = {u_idx: i for i, u_idx in enumerate(test_u_idx)}
        self._test_users_cache = test_users

    def evaluate(self, test_df, k, sim_metric='pearson_vectorized'):
        self._prepare_sim_batch(test_df)
        
        errores_cuadraticos = []
        errores_absolutos = []
        no_predecibles = 0
        predicciones_lista = []
        total_test = len(test_df)
        
        for row in test_df.itertuples(index=False):
            u, i, rating_real = row.user_id, row.anime_id, row.rating
            
            if u not in self.user2idx or i not in self.anime2idx:
                no_predecibles += 1
                continue
                
            u_idx = self.user2idx[u]
            i_idx = self.anime2idx[i]
            
            # Buscar usuarios que han puntuado ese item
            idx_start = self.R_norm_csc.indptr[i_idx]
            idx_end = self.R_norm_csc.indptr[i_idx+1]
            users_rated_i = self.R_norm_csc.indices[idx_start:idx_end]
            ratings_v_norm = self.R_norm_csc.data[idx_start:idx_end]
            
            # Eliminar auto-similitud
            mask = users_rated_i != u_idx
            users_rated_i = users_rated_i[mask]
            ratings_v_norm = ratings_v_norm[mask]
            
            if len(users_rated_i) == 0:
                no_predecibles += 1
                continue
                
            # Extraer las similitudes masivas
            sim_idx = self._u_idx_map_cache[u_idx]
            sims = self._sim_batch_cache[sim_idx, users_rated_i]
            
            # Solo tomamos vecinos con similitud positiva util
            pos_mask = sims > 0
            sims = sims[pos_mask]
            users_rated_i = users_rated_i[pos_mask]
            ratings_v_norm = ratings_v_norm[pos_mask]
            
            if len(sims) == 0:
                no_predecibles += 1
                continue
            
            # Obtener los Top K vecinos de forma veloz sin ordenar todo el array
            if len(sims) > k:
                top_k_indices = np.argpartition(sims, -k)[-k:]
                top_sims = sims[top_k_indices]
                top_ratings_norm = ratings_v_norm[top_k_indices]
            else:
                top_sims = sims
                top_ratings_norm = ratings_v_norm
                
            denom = np.sum(top_sims)
            if denom == 0:
                no_predecibles += 1
                continue
                
            # Cálculo de la Inferencia Final
            pred = self.user_means[u_idx] + np.sum(top_sims * top_ratings_norm) / denom
            pred = max(self.R_MIN, min(pred, self.R_MAX))
            
            errores_cuadraticos.append((pred - rating_real) ** 2)
            errores_absolutos.append(abs(pred - rating_real))
            predicciones_lista.append({
                'user_id': u,
                'anime_id': i,
                'rating_real': rating_real,
                'rating_predicho': pred
            })
            
        # Concluyendo Evaluación
        if len(errores_cuadraticos) == 0:
            return float('inf'), float('inf'), 0.0, 0.0, 0.0, pd.DataFrame()

        rmse = math.sqrt(sum(errores_cuadraticos) / len(errores_cuadraticos))
        mae = sum(errores_absolutos) / len(errores_absolutos)
        cobertura = (total_test - no_predecibles) / total_test * 100
        
        df_preds = pd.DataFrame(predicciones_lista)
        precisions = []
        ndcgs = []
        threshold = 7.0

        if not df_preds.empty:
            for _, grupo in df_preds.groupby("user_id"):
                top_k = grupo.sort_values("rating_predicho", ascending=False).head(k)
                hits = sum(top_k["rating_real"] >= threshold)
                precisions.append(hits / min(k, 10))

                dcg = sum((2**r - 1) / np.log2(pos + 1) for pos, r in enumerate(top_k["rating_real"], start=1))
                ideal = grupo.sort_values("rating_real", ascending=False).head(k)
                idcg = sum((2**r - 1) / np.log2(pos + 1) for pos, r in enumerate(ideal["rating_real"], start=1))
                ndcgs.append(dcg / idcg if idcg > 0 else 0)

        precision_at_10 = np.mean(precisions) if precisions else 0.0
        ndcg_at_10 = np.mean(ndcgs) if ndcgs else 0.0

        return rmse, mae, cobertura, precision_at_10, ndcg_at_10, df_preds

def generar_resultados_knn_frontend(df_train, n_neighbors=6, output_file='results/resultados_knn.csv'):
    from sklearn.neighbors import NearestNeighbors
    print(">> Generando métricas KNN Item-Item con sklearn para frontend...")
    
    user_ids = df_train['user_id'].unique()
    anime_ids = df_train['anime_id'].unique()
    
    user2idx = {u: idx for idx, u in enumerate(user_ids)}
    anime2idx = {a: idx for idx, a in enumerate(anime_ids)}
    idx2anime = {idx: a for a, idx in anime2idx.items()}
    
    NUM_USERS = len(user2idx)
    NUM_ITEMS = len(anime2idx)
    
    row_idx = df_train['user_id'].map(user2idx).values
    col_idx = df_train['anime_id'].map(anime2idx).values
    
    matrix_user_item = csr_matrix((df_train['rating'].values.astype('float32'), (row_idx, col_idx)), shape=(NUM_USERS, NUM_ITEMS))
    
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
                'source': source_anime, 'target': target_anime,
                'distance': distancia, 'similarity': similitud, 'rank': j
            })
            
    pd.DataFrame(resultados).to_csv(output_file, index=False)
    print(f"✅ Resultados KNN exportados correctamente en {output_file}")


def run_knn_opt(df_train, df_test, k_values=[5, 10, 20, 30, 50], sim_metric='vectorized', results_file='results/resultados_k_optimo.csv', force_recompute=False):
    os.makedirs(os.path.dirname(results_file), exist_ok=True)
    
    frontend_file = 'results/resultados_knn.csv'
    if not os.path.exists(frontend_file):
        generar_resultados_knn_frontend(df_train, n_neighbors=6, output_file=frontend_file)

    knn = KNNRecommender(df_train)

    if os.path.exists(results_file) and not force_recompute:
        print(f"Cargando resultados de K guardados previamente desde {results_file}...")
        df_results = pd.read_csv(results_file)
        best_k = int(df_results.loc[df_results['RMSE'].idxmin(), 'K'])
        rmse_k, mae_k, cobertura_k, p_at_10, ndcg_at_10, df_preds_k = knn.evaluate(df_test, best_k, sim_metric)
        return df_results, knn, best_k, df_preds_k, p_at_10, ndcg_at_10

    print(f">> Evaluando KNN Vectorizado...")
    results = []
    best_k = None
    best_df_preds = None
    best_rmse = float('inf')
    best_p_at_10 = 0.0
    best_ndcg_at_10 = 0.0
    
    for k in k_values:
        rmse_k, mae_k, cobertura_k, p_at_10, ndcg_at_10, df_preds_k = knn.evaluate(df_test, k, sim_metric)
        results.append({
            'K': k, 'RMSE': rmse_k, 'MAE': mae_k, 'Cobertura': cobertura_k,
            'Precision@10': p_at_10, 'NDCG@10': ndcg_at_10
        })
        print(f"  K={k:3d} | RMSE: {rmse_k:.4f} | MAE: {mae_k:.4f} | Cobertura: {cobertura_k:.2f}% | P@10: {p_at_10:.4f}")
        
        if rmse_k < best_rmse:
            best_rmse = rmse_k
            best_k = k
            best_df_preds = df_preds_k
            best_p_at_10 = p_at_10
            best_ndcg_at_10 = ndcg_at_10
            
    df_results = pd.DataFrame(results)
    df_results.to_csv(results_file, index=False)
    print(f"Resultados guardados de búsqueda en '{results_file}'")
    return df_results, knn, best_k, best_df_preds, best_p_at_10, best_ndcg_at_10