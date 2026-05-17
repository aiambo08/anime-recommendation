import math
import numpy as np
import pandas as pd
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize
import scipy.sparse as sp

class HybridRecommender:
    def __init__(self, df_train, df_anime, num_users, num_items, raw_anime2idx, n_factors=30, alpha=0.6, r_min=1, r_max=10):
        """
        SISTEMA DE RECOMENDACIÓN HÍBRIDO OPTIMIZADO
        
        Parámetros:
        - num_users, num_items: Cantidades extraídas del mapeo.
        - raw_anime2idx: Diccionario para traducir el anime.csv original a la matriz del parquet.
        """
        self.num_users = num_users
        self.num_items = num_items
        self.raw_anime2idx = raw_anime2idx
        
        self.R_MIN = r_min
        self.R_MAX = r_max
        self.n_factors = n_factors
        self.alpha = alpha
        
        self.df_train = df_train.copy()
        self.df_anime = df_anime.copy()
        
        # Medias globales y por usuario/ítem (usando los IDs mapeados de train.parquet)
        self.global_mean = self.df_train['rating'].mean()
        self.user_means = self.df_train.groupby('user_id')['rating'].mean().to_dict()
        self.anime_means = self.df_train.groupby('anime_id')['rating'].mean().to_dict()
        
        print(">> Inicializando Modelo Híbrido...")
        self._prepare_content_features()
        
    def _prepare_content_features(self):
        """Alinea el metadato del CSV original con los índices [0 a N] de las matrices dispersas"""
        print("   [Contenido] Procesando géneros y tipos de anime con TF-IDF...")
        
        # 1. Traducir los IDs originales de anime.csv a los índices mapeados
        self.df_anime['mapped_idx'] = self.df_anime['anime_id'].map(self.raw_anime2idx)
        df_anime_mapped = self.df_anime.dropna(subset=['mapped_idx']).copy()
        df_anime_mapped['mapped_idx'] = df_anime_mapped['mapped_idx'].astype(int)
        
        # 2. Crear un corpus perfecto donde el índice de la lista coincida con el mapped_idx
        corpus = ["Unknown Unknown"] * self.num_items
        for _, row in df_anime_mapped.iterrows():
            idx = row['mapped_idx']
            genre = str(row['genre']) if pd.notna(row['genre']) else 'Unknown'
            atype = str(row['type']) if pd.notna(row['type']) else 'Unknown'
            corpus[idx] = f"{genre} {atype}"
            
        # Vectorizar (ignorar comas)
        self.tfidf = TfidfVectorizer(token_pattern=r'[^,]+')
        self.tfidf_matrix = self.tfidf.fit_transform(corpus) # Shape: (num_items, vocabulario)
        
    def fit(self):
        """Entrena SVD y calcula perfiles de contenido vía multiplicación rápida de matrices"""
        print(">> Entrenando el modelo híbrido...")
        
        row_idx = self.df_train['user_id'].values
        col_idx = self.df_train['anime_id'].values
        ratings = self.df_train['rating'].values
        
        # ---- 1. ENTRENAMIENTO COLABORATIVO (SVD) ----
        print("   [Colaborativo] Factorización SVD sobre matriz dispersa...")
        R_sparse = sp.csr_matrix(
            (ratings.astype('float32'), (row_idx, col_idx)),
            shape=(self.num_users, self.num_items)
        )
        
        self.svd = TruncatedSVD(n_components=self.n_factors, random_state=42)
        self.user_embeddings = self.svd.fit_transform(R_sparse)
        self.item_embeddings = self.svd.components_.T
        
        # ---- 2. PERFILES DE CONTENIDO MATRICIAL (Vectores de Usuario) ----
        print("   [Contenido] Construyendo perfiles de usuario vía Álgebra Lineal...")
        # Pesos: (rating - user_mean + 1.0). Vectorizado para ser casi instantáneo.
        user_means_mapped = self.df_train['user_id'].map(self.user_means).fillna(self.global_mean).values
        weights = ratings - user_means_mapped + 1.0
        weights = np.maximum(weights, 0.1)
        
        W_sparse = sp.csr_matrix(
            (weights, (row_idx, col_idx)),
            shape=(self.num_users, self.num_items)
        )
        
        # MAGIA: (Usuarios x Ítems) dot (Ítems x TFIDF) = (Usuarios x TFIDF) en microsegundos
        user_content_raw = W_sparse.dot(self.tfidf_matrix)
        self.user_content_profiles = normalize(user_content_raw, axis=1, norm='l2')

        print("✅ ¡Entrenamiento híbrido completado!")

    def predict(self, u, i):
        """Genera una predicción controlando usuarios o ítems fuera de rango"""
        if u >= self.num_users or i >= self.num_items or u < 0 or i < 0:
            return self.global_mean
            
        # 1. Componente Colaborativo
        base_pred = self.user_means.get(u, self.global_mean) + self.anime_means.get(i, self.global_mean) - self.global_mean
        collab_pred = base_pred + np.dot(self.user_embeddings[u], self.item_embeddings[i])
        collab_pred = np.clip(collab_pred, self.R_MIN, self.R_MAX)
        
        # 2. Componente de Contenido
        user_prof = self.user_content_profiles[u]
        anime_vec = self.tfidf_matrix[i]
        sim = user_prof.multiply(anime_vec).sum() # Producto punto de dos filas dispersas = Coseno
        
        content_pred = self.user_means.get(u, self.global_mean) + (sim - 0.2) * 5.0
        content_pred = np.clip(content_pred, self.R_MIN, self.R_MAX)
            
        # 3. Fusión Híbrida Lineal
        final_pred = (self.alpha * collab_pred) + ((1.0 - self.alpha) * content_pred)
        return float(np.clip(final_pred, self.R_MIN, self.R_MAX))

    def evaluate(self, test_df):
        errores_cuadraticos = []
        errores_absolutos = []
        predicciones_log = []
        total_test = len(test_df)
        
        for row in test_df.itertuples(index=False):
            u = row.user_id
            i = row.anime_id
            rating_real = row.rating
            
            prediccion = self.predict(u, i)
            
            errores_cuadraticos.append((prediccion - rating_real) ** 2)
            errores_absolutos.append(abs(prediccion - rating_real))
            predicciones_log.append({
                'user_id': u,
                'anime_id': i, # Este anime_id es el mapeado (0 a N)
                'rating_real': rating_real,
                'rating_predicho': round(prediccion, 2)
            })
                
        rmse = math.sqrt(sum(errores_cuadraticos) / total_test)
        mae = sum(errores_absolutos) / total_test
        
        return rmse, mae, 100.0, pd.DataFrame(predicciones_log)
