import os
import math
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader
from sklearn.neighbors import NearestNeighbors
from sklearn.metrics import mean_absolute_error, mean_squared_error

# Importamos el protocolo de evaluación unificado para que Precision@K y nDCG@K
# sean comparables entre todos los modelos (KNN, PMF, BMF, GMF, MLP).
from ranking_eval import evaluate_ranking_at_k

# =====================================================================
# 1. ARQUITECTURA DE LA RED NEURONAL (GMF Nivel PyTorch)
# =====================================================================
class GMFModel(nn.Module):
    def __init__(self, num_users, num_items, latent_dim):
        super().__init__()
        self.user_embedding = nn.Embedding(num_users, latent_dim)
        self.item_embedding = nn.Embedding(num_items, latent_dim)
        self.fc = nn.Linear(latent_dim, 1)

    def forward(self, user_ids, item_ids):
        u_emb = self.user_embedding(user_ids)
        i_emb = self.item_embedding(item_ids)
        # Operación lineal directa mediante multiplicación de Hadamard
        interact = torch.mul(u_emb, i_emb)
        return self.fc(interact).flatten()


# =====================================================================
# 2. CLASE WRAPPER PARA INTEGRACIÓN CON EL BACKEND
# =====================================================================
class GMFRecommender:
    def __init__(self, num_users, num_items, latent_dim=40, lr=0.00628):
        """
        Inicializa el modelo GMF y gestiona automáticamente el dispositivo (GPU/CPU).
        Utiliza por defecto los hiperparámetros óptimos encontrados con Optuna.
        """
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.model = GMFModel(num_users, num_items, latent_dim).to(self.device)
        self.lr = lr
        self.num_users = num_users
        self.num_items = num_items

    def fit(self, df_train, epochs=10, batch_size=2048):
        """
        Transforma los datos tabulares en Tensores, crea el DataLoader 
        y ejecuta el bucle de descenso del gradiente.
        """
        print(f"Entrenando GMF en dispositivo: {self.device}...")
        
        users_t = torch.tensor(df_train['user_id'].values, dtype=torch.long)
        items_t = torch.tensor(df_train['anime_id'].values, dtype=torch.long)
        ratings_t = torch.tensor(df_train['rating'].values, dtype=torch.float32)
        
        dataset = TensorDataset(users_t, items_t, ratings_t)
        loader = DataLoader(
            dataset, 
            batch_size=batch_size, 
            shuffle=True, 
            num_workers=4, 
            pin_memory=True if self.device.type == 'cuda' else False
        )
        
        optimizer = torch.optim.Adam(self.model.parameters(), lr=self.lr)
        loss_fn = nn.MSELoss()
        
        for epoch in range(epochs):
            self.model.train()
            running_loss = 0.0
            
            for b_u, b_i, b_r in loader:
                b_u = b_u.to(self.device, non_blocking=True)
                b_i = b_i.to(self.device, non_blocking=True)
                b_r = b_r.to(self.device, non_blocking=True)
                
                optimizer.zero_grad()
                preds = self.model(b_u, b_i)
                loss = loss_fn(preds, b_r)
                loss.backward()
                optimizer.step()
                
                running_loss += loss.detach()
                
            epoch_loss = running_loss.item() / len(loader)
            print(f"  Época {epoch+1:2d}/{epochs} | Train MSE: {epoch_loss:.4f}")

    def predict_batch(self, users: np.ndarray, items: np.ndarray) -> np.ndarray:
        """
        Predicción vectorizada sobre arrays de usuarios e ítems.
        Devuelve scores recortados en [1, 10] listos para evaluate_ranking_at_k.
        """
        self.model.eval()
        with torch.no_grad():
            u_t = torch.tensor(users, dtype=torch.long).to(self.device)
            i_t = torch.tensor(items, dtype=torch.long).to(self.device)
            preds = self.model(u_t, i_t).cpu().numpy()
        return np.clip(preds, 1.0, 10.0).astype(np.float32)

    def evaluate(self, df_test):
        """
        Evalúa el modelo en el conjunto de test (RMSE, MAE, Cobertura).
        Para métricas de ranking usa evaluate_ranking().
        """
        self.model.eval()
        with torch.no_grad():
            users_test = torch.tensor(df_test['user_id'].values, dtype=torch.long).to(self.device)
            items_test = torch.tensor(df_test['anime_id'].values, dtype=torch.long).to(self.device)
            preds = self.model(users_test, items_test).cpu().numpy()

        ratings_reales = df_test['rating'].values
        mae = mean_absolute_error(ratings_reales, preds)
        rmse = math.sqrt(mean_squared_error(ratings_reales, preds))

        cobertura = 100.0
        return rmse, mae, cobertura

    def evaluate_ranking(
        self,
        df_test: pd.DataFrame,
        k: int = 10,
        threshold: float = 7.0,
        n_users_sample: int = None,
        random_state: int = 42
    ):
        """
        Calcula Precision@K y nDCG@K sobre el test set usando el protocolo
        unificado full-test-set (sin negative sampling).

        Parámetros
        ----------
        df_test : pd.DataFrame
            Columnas necesarias: ['user_id', 'anime_id', 'rating'].
        k : int
            Longitud de la lista de recomendación (default 10).
        threshold : float
            Rating mínimo para considerar un ítem como relevante (default 7.0).
        n_users_sample : int o None
            Si se especifica, evalúa sobre una muestra aleatoria de N usuarios
            (útil para tablas de tuning donde se quiere rapidez). Si es None,
            evalúa sobre todos los usuarios del test set.
        random_state : int
            Semilla para la muestra de usuarios (garantiza reproducibilidad).

        Retorna
        -------
        precision_at_k : float
        ndcg_at_k : float
        """
        if n_users_sample is not None:
            # Seleccionamos usuarios con suficientes registros en test
            conteo = df_test['user_id'].value_counts()
            usuarios_validos = conteo[conteo >= k].index
            rng = np.random.default_rng(random_state)
            n = min(n_users_sample, len(usuarios_validos))
            usuarios_sel = rng.choice(usuarios_validos, size=n, replace=False)
            df_eval = df_test[df_test['user_id'].isin(usuarios_sel)].copy()
        else:
            df_eval = df_test

        return evaluate_ranking_at_k(
            predict_fn=self.predict_batch,
            df_test=df_eval,
            k=k,
            threshold=threshold
        )


# =====================================================================
# 3. EXTRACCIÓN DE RELACIONES PARA EL FRONTEND (EMBEDDINGS)
# =====================================================================
def generar_resultados_gmf_frontend(wrapper, df_train, n_neighbors=6, output_file='results/resultados_gmf_frontend.csv'):
    """
    Extrae la capa de embeddings latentes (40 dimensiones) del modelo GMF ya entrenado 
    y calcula la similitud del coseno matricial pura para encontrar animes relacionados.
    """
    print(">> Extrayendo Embeddings Lineales de la GPU y generando grafos de similitud...")
    
    # Extraemos la matriz de pesos completa de la capa de items y la pasamos a la CPU
    item_embeddings_completos = wrapper.model.item_embedding.weight.data.cpu().numpy()
    
    # Filtramos solo los animes que realmente existen en nuestro dataset de entrenamiento
    anime_ids_existentes = np.sort(df_train['anime_id'].unique())
    embeddings_validos = item_embeddings_completos[anime_ids_existentes]
    
    # Usamos NearestNeighbors con distancia coseno sobre el espacio vectorial latente
    knn_model = NearestNeighbors(metric='cosine', algorithm='brute')
    knn_model.fit(embeddings_validos)
    
    distances, indices = knn_model.kneighbors(embeddings_validos, n_neighbors=n_neighbors)
    
    resultados = []
    for i in range(len(anime_ids_existentes)):
        source_anime = anime_ids_existentes[i]
        
        # Empezamos en 1 para ignorar el propio anime (distancia 0)
        for j in range(1, len(indices[i])):
            target_anime = anime_ids_existentes[indices[i][j]]
            distancia = distances[i][j]
            similitud = 1 - distancia if distancia <= 1 else 1 / (1 + distancia)
            
            resultados.append({
                'source': source_anime,
                'target': target_anime,
                'distance': distancia,
                'similarity': similitud,
                'rank': j
            })
            
    df_resultados = pd.DataFrame(resultados)
    df_resultados.to_csv(output_file, index=False)
    print(f"✅ Embeddings GMF proyectados y exportados para el frontend en {output_file}")


# =====================================================================
# 4. FUNCIÓN ORQUESTADORA (Punto de entrada del backend)
# =====================================================================
import pickle

def run_gmf(df_train, df_test, force_recompute=False, **kwargs):
    """
    Función de ejecución principal para el GMF.
    Carga automáticamente los mejores parámetros desde el estudio de Optuna (.pkl) si existen.
    """
    # Creamos directorios si no existen
    os.makedirs('results', exist_ok=True)
    weights_file = 'results/GMF_weights.pth'
    frontend_file = 'results/resultados_gmf_frontend.csv'
    optuna_file = 'optuna_study_gmf.pkl' # Ruta al estudio de Optuna GMF
    
    # 🎯 AUTOMATIZACIÓN: Intentar leer los parámetros óptimos del .pkl
    best_latent_dim = kwargs.get('latent_dim', None)
    best_lr = kwargs.get('lr', None)
    
    if (best_latent_dim is None or best_lr is None) and os.path.exists(optuna_file):
        try:
            print(f">> Detectado estudio de Optuna en '{optuna_file}'. Cargando hiperparámetros óptimos...")
            study_gmf = pickle.load(open(optuna_file, 'rb'))
            best_latent_dim = study_gmf.best_params['latent_dim']
            best_lr = study_gmf.best_params['lr']
            print(f"   [Optuna] Asignados -> latent_dim: {best_latent_dim} | lr: {best_lr:.5f}")
        except Exception as e:
            print(f"⚠️ Error al leer el .pkl de Optuna: {e}. Se usarán valores por defecto.")
            
    # Si no hay pkl ni parámetros manuales, usamos tus fallbacks clásicos del script
    if best_latent_dim is None: best_latent_dim = 40
    if best_lr is None: best_lr = 0.00628
    
    # Calculamos dimensiones dinámicas en base a los datos
    num_users = df_train['user_id'].max() + 1
    num_items = df_train['anime_id'].max() + 1
    
    print(">> Inicializando framework neuronal GMF...")
    gmf_recommender = GMFRecommender(
        num_users=num_users, 
        num_items=num_items, 
        latent_dim=best_latent_dim,
        lr=best_lr
    )
    
    # Lógica de carga o re-entrenamiento
    if os.path.exists(weights_file) and not force_recompute:
        print(f"Cargando red lineal pre-entrenada desde {weights_file}...")
        gmf_recommender.model.load_state_dict(torch.load(weights_file, map_location=gmf_recommender.device, weights_only=True))
    else:
        print(f"Iniciando entrenamiento GMF en la GPU ({kwargs.get('epochs', 10)} épocas)...")
        gmf_recommender.fit(df_train, epochs=kwargs.get('epochs', 10))
        torch.save(gmf_recommender.model.state_dict(), weights_file)
        print(f"Pesos de la red GMF guardados en {weights_file}")
        
    # Evaluación de error (RMSE, MAE)
    rmse, mae, cobertura = gmf_recommender.evaluate(df_test)
    print(f">> Evaluacion Final GMF | RMSE: {rmse:.4f} | MAE: {mae:.4f} | Cobertura: {cobertura:.2f}%")

    # Evaluación de ranking — protocolo full test set (muestra de 200 usuarios)
    # n_users_sample limita el coste sin alterar la representatividad del tuning.
    print(">> Calculando Precision@10 y nDCG@10 (muestra 200 usuarios)...")
    p_at_10, ndcg_at_10 = gmf_recommender.evaluate_ranking(
        df_test, k=10, threshold=7.0, n_users_sample=200
    )
    print(f">> Precision@10: {p_at_10:.4f} | nDCG@10: {ndcg_at_10:.4f}")

    # Exportación para visualización web
    if not os.path.exists(frontend_file) or force_recompute:
        generar_resultados_gmf_frontend(gmf_recommender, df_train, n_neighbors=6, output_file=frontend_file)

    return {
        "RMSE": rmse,
        "MAE": mae,
        "Cobertura": cobertura,
        "Precision@10": p_at_10,
        "nDCG@10": ndcg_at_10
    }, gmf_recommender

if __name__ == "__main__":
    pass