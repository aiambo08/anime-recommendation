import math
import numpy as np
import pandas as pd
import os
import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader
from sklearn.neighbors import NearestNeighbors
from sklearn.metrics import mean_absolute_error, mean_squared_error


# =====================================================================
# 1. ARQUITECTURA DE LA RED NEURONAL (PyTorch Módulo Base)
# =====================================================================
class MLPModel(nn.Module):
    def __init__(self, num_users, num_items, latent_dim):
        super().__init__()
        self.user_embedding = nn.Embedding(num_users, latent_dim)
        self.item_embedding = nn.Embedding(num_items, latent_dim)
        self.mlp = nn.Sequential(
            nn.Linear(latent_dim * 2, 64),
            nn.ReLU(),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 1)
        )

    def forward(self, user_ids, item_ids):
        u_emb = self.user_embedding(user_ids)
        i_emb = self.item_embedding(item_ids)
        vector = torch.cat([u_emb, i_emb], dim=-1)
        return self.mlp(vector).flatten()


# =====================================================================
# 2. CLASE WRAPPER PARA INTEGRACIÓN CON EL BACKEND
# =====================================================================
class MLPRecommender:
    def __init__(self, num_users, num_items, latent_dim=16, lr=0.001):
        """
        Inicializa el modelo MLP y gestiona automáticamente el dispositivo (GPU/CPU).
        Utiliza por defecto los hiperparámetros óptimos encontrados con Optuna.
        """
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.model = MLPModel(num_users, num_items, latent_dim).to(self.device)
        self.lr = lr
        self.num_users = num_users
        self.num_items = num_items

    def fit(self, df_train, epochs=10, batch_size=2048):
        """
        Transforma los datos tabulares en Tensores, crea el DataLoader 
        y ejecuta el bucle de descenso del gradiente.
        """
        print(f"Entrenando MLP en dispositivo: {self.device}...")
        
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

    def evaluate(self, df_test):
        """
        Evalúa el modelo en el conjunto de test y devuelve las métricas.
        """
        self.model.eval()
        with torch.no_grad():
            users_test = torch.tensor(df_test['user_id'].values, dtype=torch.long).to(self.device)
            items_test = torch.tensor(df_test['anime_id'].values, dtype=torch.long).to(self.device)
            preds = self.model(users_test, items_test).cpu().numpy()
            
        ratings_reales = df_test['rating'].values
        mae = mean_absolute_error(ratings_reales, preds)
        rmse = math.sqrt(mean_squared_error(ratings_reales, preds))
        
        # Cobertura en redes neuronales suele ser 100% para elementos conocidos
        cobertura = 100.0 
        return rmse, mae, cobertura


# =====================================================================
# 3. EXTRACCIÓN DE RELACIONES PARA EL FRONTEND (EMBEDDINGS)
# =====================================================================
def generar_resultados_mlp_frontend(wrapper, df_train, n_neighbors=6, output_file='results/resultados_mlp_frontend.csv'):
    """
    Extrae la capa de embeddings latentes del modelo ya entrenado y calcula 
    la similitud del coseno matricial pura para encontrar animes relacionados.
    """
    print(">> Extrayendo Embeddings de la GPU y generando grafos de similitud...")
    
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
    print(f"✅ Embeddings proyectados y exportados para el frontend en {output_file}")


# =====================================================================
# 4. FUNCIÓN ORQUESTADORA (Punto de entrada del backend)
# =====================================================================
def run_mlp(df_train, df_test, force_recompute=False, **kwargs):
    """
    Función de ejecución principal. Carga pesos previos si existen, o entrena 
    desde cero si se requiere, generando finalmente los ficheros del frontend.
    """
    # Creamos directorios si no existen
    os.makedirs('results', exist_ok=True)
    weights_file = 'results/MLP_weights.pth'
    frontend_file = 'results/resultados_mlp_frontend.csv'
    
    # Calculamos dimensiones dinámicas en base a los datos
    num_users = df_train['user_id'].max() + 1
    num_items = df_train['anime_id'].max() + 1
    
    print(">> Inicializando framework neuronal MLP...")
    mlp_recommender = MLPRecommender(
        num_users=num_users, 
        num_items=num_items, 
        latent_dim=kwargs.get('latent_dim', 16),
        lr=kwargs.get('lr', 0.001)
    )
    
    # Lógica de carga o re-entrenamiento
    if os.path.exists(weights_file) and not force_recompute:
        print(f"Cargando red pre-entrenada desde {weights_file}...")
        mlp_recommender.model.load_state_dict(torch.load(weights_file, map_location=mlp_recommender.device, weights_only=True))
    else:
        print("Iniciando entrenamiento profundo desde cero...")
        mlp_recommender.fit(df_train, epochs=kwargs.get('epochs', 10))
        torch.save(mlp_recommender.model.state_dict(), weights_file)
        print(f"Pesos de la red guardados en {weights_file}")
        
    # Evaluación
    rmse, mae, cobertura = mlp_recommender.evaluate(df_test)
    print(f">> Evaluación Final MLP | RMSE: {rmse:.4f} | MAE: {mae:.4f} | Cobertura: {cobertura:.2f}%")
    
    # Exportación para visualización web
    if not os.path.exists(frontend_file) or force_recompute:
        generar_resultados_mlp_frontend(mlp_recommender, df_train, n_neighbors=6, output_file=frontend_file)
        
    return {"RMSE": rmse, "MAE": mae, "Cobertura": cobertura}, mlp_recommender

if __name__ == "__main__":
    pass