import numpy as np
import math
import random
from scipy.special import expit
from scipy.sparse import coo_matrix
from sklearn.metrics import mean_squared_error, mean_absolute_error

class BernoulliMatrixFactorization:
    """
    Modelo de Recomendación basado en Bernoulli Matrix Factorization (BMF) probabilístico estándar.
    En lugar de crear 10 submodelos (ineficiente), estandariza los ratings como probabilidades.
    """
    def __init__(self, num_factors=20, learning_rate=0.05, regularization=0.1, num_iterations=20, random_state=42):
        self.num_factors = num_factors
        self.learning_rate = learning_rate
        self.regularization = regularization
        self.num_iterations = num_iterations
        self.random_state = random_state
        self.R_MIN = 1.0
        self.R_MAX = 10.0
        
        self.U = None 
        self.V = None 
        self.num_users = 0
        self.num_items = 0
        self.global_mean = 0.0

    def fit(self, R_train):
        print(f"🚀 Iniciando entrenamiento BMF Probabilístico Estándar...")
        self.num_users, self.num_items = R_train.shape
        
        coo_train = R_train.tocoo()
        train_users = coo_train.row.astype(int)
        train_items = coo_train.col.astype(int)
        
        # Transformar ratings [1, 10] a probabilidad esperada [0, 1]
        train_probs = (coo_train.data.astype('float32') - self.R_MIN) / (self.R_MAX - self.R_MIN)
        self.global_mean = np.mean(coo_train.data)
        
        np.random.seed(self.random_state)
        # Inicialización de factores [0, 1] escalados
        self.U = np.random.uniform(0, 1, (self.num_users, self.num_factors)).astype('float32')
        self.V = np.random.uniform(0, 1, (self.num_items, self.num_factors)).astype('float32')
        
        n_ratings = len(train_probs)
        
        # Stochastic Gradient Descent (SGD) Secuencial optimizado (sin multithread pesado)
        for epoch in range(self.num_iterations):
            idx = np.random.permutation(n_ratings)
            u_shuf = train_users[idx]
            i_shuf = train_items[idx]
            t_shuf = train_probs[idx]
            
            error_acum = 0.0
            for n in range(n_ratings):
                u = u_shuf[n]
                i = i_shuf[n]
                t = t_shuf[n]
                
                dot = np.dot(self.U[u], self.V[i])
                pred_prob = expit(dot)
                error = t - pred_prob
                error_acum += np.abs(error)
                
                u_old = self.U[u].copy()
                self.U[u] += self.learning_rate * (error * self.V[i] - self.regularization * self.U[u])
                self.V[i] += self.learning_rate * (error * u_old - self.regularization * self.V[i])
                
            print(f" -> Época {epoch+1}/{self.num_iterations} - Error Logístico MAE Temp: {error_acum/n_ratings:.4f}")
            
        print("✅ Entrenamiento BMF finalizado.")

    def predict(self, users, items):
        users = np.asarray(users)
        items = np.asarray(items)
        preds = np.full(len(users), self.global_mean, dtype='float32') # Default fallback global

        # Filtrar solo índices válidos (Cold-Start bypass/anti-crash)
        valid_mask = (users < self.num_users) & (items < self.num_items)
        u_valid = users[valid_mask]
        i_valid = items[valid_mask]

        # Inferencia vectorizada inmediata
        if len(u_valid) > 0:
            dots = np.sum(self.U[u_valid] * self.V[i_valid], axis=1)
            probs = expit(dots) # Sigmoide
            
            # Reescalar de [0, 1] a [1, 10] numéricos
            scaled_ratings = probs * (self.R_MAX - self.R_MIN) + self.R_MIN
            preds[valid_mask] = scaled_ratings
            
        return preds

    def evaluate_rmse_mae(self, test_users, test_items, test_ratings):
        preds = self.predict(test_users, test_items)
        rmse = np.sqrt(mean_squared_error(test_ratings, preds))
        mae = mean_absolute_error(test_ratings, preds)
        return rmse, mae

    def evaluate_ranking(self, test_users, test_items, test_ratings, R_train, n_recommendations=5, theta=8, num_negatives=100):
        # Mapear data temporal
        user_test_data = {}
        for u, i, true_r in zip(test_users, test_items, test_ratings):
            if u >= self.num_users or i >= self.num_items: continue # Bypass crashing
            if u not in user_test_data:
                user_test_data[u] = {'items': [], 'true_ratings': []}
            user_test_data[u]['items'].append(i)
            user_test_data[u]['true_ratings'].append(true_r)
            
        precisions, recalls, ndcgs = [], [], []
        np.random.seed(self.random_state)
        
        all_item_indices = np.arange(self.num_items)
        # Extraer filas como arrays estáticos
        train_csr = R_train.tocsr()
        
        for u, data in user_test_data.items():
            true_ratings = np.array(data['true_ratings'])
            items = np.array(data['items'])
            
            relevant_items = items[true_ratings >= theta]
            if len(relevant_items) == 0:
                continue
                
            train_items_seen = train_csr.indices[train_csr.indptr[u]:train_csr.indptr[u+1]]
            
            # --- Vectorized Negative Sampling (Súper veloz sin bucles) ---
            seen_total = np.union1d(train_items_seen, items)
            unseen_items = np.setdiff1d(all_item_indices, seen_total, assume_unique=True)
            
            if len(unseen_items) == 0:
                continue
            
            n_negs = min(num_negatives, len(unseen_items))
            negative_items = np.random.choice(unseen_items, size=n_negs, replace=False)
            # -------------------------------------------------------------
            
            items_to_evaluate = np.concatenate([relevant_items, negative_items])
            user_array = np.full(len(items_to_evaluate), u)
            
            best_preds = self.predict(user_array, items_to_evaluate)
            
            # Top-K Particionado lineal sin .sort pesado iterativo
            idx_top = np.argpartition(best_preds, -n_recommendations)[-n_recommendations:]
            top_n_items = items_to_evaluate[idx_top]
            
            # Como argpartition no respeta riguroso orden local, ordenamos solo esos pequeños n recs
            sub_sort = np.argsort(best_preds[idx_top])[::-1]
            top_n_items = top_n_items[sub_sort]

            relevant_set = set(relevant_items)
            hits = sum(1 for item in top_n_items if item in relevant_set)
            
            precisions.append(hits / n_recommendations)
            recalls.append(hits / len(relevant_items))
            
            # NDCG Local vectorizado
            dcg = 0
            for pos, item in enumerate(top_n_items):
                if item in relevant_set:
                    idx_in_test = np.where(items == item)[0][0]
                    real_rating = true_ratings[idx_in_test]
                    dcg += (pos_weight := (2**real_rating - 1) / math.log2(pos + 2))
                    
            rel_true_val_sorted = np.sort(true_ratings[true_ratings >= theta])[::-1][:n_recommendations]
            idcg = sum((2**val - 1) / math.log2(pos + 2) for pos, val in enumerate(rel_true_val_sorted))
            
            ndcgs.append(dcg / idcg if idcg > 0 else 0.0)
            
        avg_precision = np.mean(precisions) if precisions else 0.0
        avg_recall = np.mean(recalls) if recalls else 0.0
        avg_f1 = 2 * (avg_precision * avg_recall) / (avg_precision + avg_recall) if (avg_precision + avg_recall) > 0 else 0.0
        avg_ndcg = np.mean(ndcgs) if ndcgs else 0.0
        
        return avg_precision, avg_recall, avg_f1, avg_ndcg