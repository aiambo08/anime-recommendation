import numpy as np
import math
import random
from scipy.special import expit
from sklearn.metrics import mean_squared_error, mean_absolute_error

class BernoulliMatrixFactorization:
    """
    Modelo de Recomendación basado en Bernoulli Matrix Factorization (BMF).
    Entrena una matriz de factores latentes para cada posible valoración (score).
    """
    def __init__(self, num_factors=20, learning_rate=0.05, regularization=0.1, num_iterations=10, random_state=42):
        self.num_factors = num_factors
        self.learning_rate = learning_rate
        self.regularization = regularization
        self.num_iterations = num_iterations
        self.random_state = random_state
        
        self.scores = np.arange(1, 11)
        self.num_scores = len(self.scores)
        
        self.U = None
        self.V = None
        self.num_users = 0
        self.num_items = 0

    def fit(self, R_train):
        self.num_users, self.num_items = R_train.shape
        coo_train = R_train.tocoo()
        train_users = coo_train.row.astype(int)
        train_items = coo_train.col.astype(int)
        train_ratings = coo_train.data.astype('float32')
        n_ratings = len(train_ratings)

        np.random.seed(self.random_state)
        self.U = np.random.uniform(0, 1, (self.num_scores, self.num_users, self.num_factors)).astype('float32')
        self.V = np.random.uniform(0, 1, (self.num_scores, self.num_items, self.num_factors)).astype('float32')

        print("Comenzando el entrenamiento de BMF...")
        for s_idx, score in enumerate(self.scores):
            target = (train_ratings == score).astype(float)
            for epoch in range(self.num_iterations):
                idx = np.random.permutation(n_ratings)
                u_shuf = train_users[idx]
                i_shuf = train_items[idx]
                t_shuf = target[idx]
                
                for n in range(n_ratings):
                    u = u_shuf[n]
                    i = i_shuf[n]
                    t = t_shuf[n]
                    
                    dot = np.dot(self.U[s_idx, u], self.V[s_idx, i])
                    pred = expit(dot)
                    error = t - pred
                    u_old = self.U[s_idx, u].copy()
                    
                    self.U[s_idx, u] += self.learning_rate * (error * self.V[s_idx, i] - self.regularization * self.U[s_idx, u])
                    self.V[s_idx, i] += self.learning_rate * (error * u_old - self.regularization * self.V[s_idx, i])
                    
        print(" Entrenamiento BMF finalizado.")

    def predict(self, users, items):
        best_preds = np.zeros(len(users))
        best_probs = np.zeros(len(users)) - 1
        
        for s_idx, score in enumerate(self.scores):
            dot = np.sum(self.U[s_idx, users] * self.V[s_idx, items], axis=1)
            prob = expit(dot)
            mask = prob > best_probs
            best_probs[mask] = prob[mask]
            best_preds[mask] = score
            
        return best_preds

    def evaluate_rmse_mae(self, test_users, test_items, test_ratings):
        preds = self.predict(test_users, test_items)
        rmse = np.sqrt(mean_squared_error(test_ratings, preds))
        mae = mean_absolute_error(test_ratings, preds)
        return rmse, mae

    def evaluate_ranking(self, test_users, test_items, test_ratings, R_train, n_recommendations=5, theta=8, num_negatives=100):
        """
        Evalúa métricas de Ranking utilizando Negative Sampling y previene IndexErrors.
        """
        user_test_data = {}
        for u, i, true_r in zip(test_users, test_items, test_ratings):
            if u not in user_test_data:
                user_test_data[u] = {'items': [], 'true_ratings': []}
            user_test_data[u]['items'].append(i)
            user_test_data[u]['true_ratings'].append(true_r)
            
        precisions, recalls, ndcgs = [], [], []
        random.seed(self.random_state)
        
        for u, data in user_test_data.items():
            true_ratings = np.array(data['true_ratings'])
            items = np.array(data['items'])
            
            relevant_items = items[true_ratings >= theta]
            if len(relevant_items) == 0:
                continue
                
            train_items_seen = set(R_train[u].indices)
            test_items_seen = set(items)
            negative_items = set()
            
            # Seguridad: no pedir más negativos de los que existen en el vocabulario del modelo
            max_posibles = self.num_items - len(train_items_seen) - len(test_items_seen)
            n_negs = min(num_negatives, max_posibles)
            
            while len(negative_items) < n_negs:
                neg_item = random.randint(0, self.num_items - 1)
                if neg_item not in train_items_seen and neg_item not in test_items_seen:
                    negative_items.add(neg_item)
                    
            items_to_evaluate = np.array(list(relevant_items) + list(negative_items))
            user_array = np.full(len(items_to_evaluate), u)
            best_preds = self.predict(user_array, items_to_evaluate)
            
            top_n_idx = np.argsort(best_preds)[::-1][:n_recommendations]
            top_n_items = items_to_evaluate[top_n_idx]
            relevant_set = set(relevant_items)
            hits = sum(1 for item in top_n_items if item in relevant_set)
            
            precisions.append(hits / n_recommendations)
            recalls.append(hits / len(relevant_items))
            
            dcg = 0
            for pos, item in enumerate(top_n_items):
                if item in relevant_set:
                    idx_in_test = np.where(items == item)[0][0]
                    real_rating = true_ratings[idx_in_test]
                    dcg += (2**real_rating - 1) / math.log2(pos + 2)
                    
            relevant_true_ratings = true_ratings[true_ratings >= theta]
            ideal_idx = np.argsort(relevant_true_ratings)[::-1][:n_recommendations]
            idcg = sum((2**relevant_true_ratings[idx] - 1) / math.log2(pos + 2) for pos, idx in enumerate(ideal_idx))
            ndcgs.append(dcg / idcg if idcg > 0 else 0)
            
        avg_precision = np.mean(precisions) if precisions else 0
        avg_recall = np.mean(recalls) if recalls else 0
        avg_f1 = 2 * (avg_precision * avg_recall) / (avg_precision + avg_recall) if (avg_precision + avg_recall) > 0 else 0
        avg_ndcg = np.mean(ndcgs) if ndcgs else 0
        
        return avg_precision, avg_recall, avg_f1, avg_ndcg