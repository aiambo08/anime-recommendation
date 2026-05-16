import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix
import math

class PMFRecommender:
    def __init__(self, n_users, n_items, n_factors=50, lr=0.005, reg=0.05):
        """
        Inicializa la Factorización Matricial Probabilística.
        """
        self.n_users = n_users
        self.n_items = n_items
        self.n_factors = n_factors
        self.lr = lr
        self.reg = reg
        
        # Inicialización Gaussiana
        np.random.seed(42)
        self.P = np.random.normal(0, 0.1, (n_users, n_factors)).astype('float32')
        self.Q = np.random.normal(0, 0.1, (n_items, n_factors)).astype('float32')
        
        # Biases
        self.bu = np.zeros(n_users, dtype='float32')
        self.bi = np.zeros(n_items, dtype='float32')
        self.mu = 0.0

    def _compute_rmse_sparse(self, R_csr):
        """
        Vectorización rápida del cálculo del error.
        """
        R_coo = R_csr.tocoo()
        users = R_coo.row
        items = R_coo.col
        ratings = R_coo.data
        
        r_hat = self.mu + self.bu[users] + self.bi[items] + (self.P[users] * self.Q[items]).sum(axis=1)
        r_hat = np.clip(r_hat, 1, 10)
        return float(np.sqrt(np.mean((ratings - r_hat) ** 2)))

    def fit(self, R_train, R_test, mu, epochs=20, patience=3):
        """
        Bucle estocástico de descenso de gradiente (SGD) con early stopping.
        """
        self.mu = mu
        
        coo = R_train.tocoo()
        train_users = coo.row.astype(int)
        train_items = coo.col.astype(int)
        train_ratings = coo.data.astype('float32')
        n_ratings = len(train_ratings)
        
        history = {'train_rmse': [], 'test_rmse': []}
        best_test_rmse = float('inf')
        no_improve = 0
        
        best_P, best_Q = self.P.copy(), self.Q.copy()
        best_bu, best_bi = self.bu.copy(), self.bi.copy()
        
        for epoch in range(epochs):
            # Intercambiar índices en cada época
            idx = np.random.permutation(n_ratings)
            u_shuf, i_shuf, r_shuf = train_users[idx], train_items[idx], train_ratings[idx]
            
            for n in range(n_ratings):
                u, i, r = u_shuf[n], i_shuf[n], r_shuf[n]
                
                r_hat = self.mu + self.bu[u] + self.bi[i] + np.dot(self.P[u], self.Q[i])
                e = r - r_hat
                
                pu_old = self.P[u].copy()
                
                # Actualización de pesos
                self.P[u] += self.lr * (e * self.Q[i] - self.reg * self.P[u])
                self.Q[i] += self.lr * (e * pu_old - self.reg * self.Q[i])
                self.bu[u] += self.lr * (e - self.reg * self.bu[u])
                self.bi[i] += self.lr * (e - self.reg * self.bi[i])
            
            tr_rmse = self._compute_rmse_sparse(R_train)
            te_rmse = self._compute_rmse_sparse(R_test)
            
            history['train_rmse'].append(tr_rmse)
            history['test_rmse'].append(te_rmse)
            
            print(f"  Época {epoch+1:2d}/{epochs} | Train RMSE: {tr_rmse:.4f} | Test RMSE: {te_rmse:.4f}")
            
            # Chequeo early stopping
            if te_rmse < best_test_rmse - 1e-4:
                best_test_rmse = te_rmse
                best_P, best_Q = self.P.copy(), self.Q.copy()
                best_bu, best_bi = self.bu.copy(), self.bi.copy()
                no_improve = 0
            else:
                no_improve += 1
                if no_improve >= patience:
                    print(f"⚡ Early stopping disparado en época {epoch+1}")
                    break
        
        # Guardar en contexto la mejor iteración
        self.P, self.Q = best_P, best_Q
        self.bu, self.bi = best_bu, best_bi
        
        return history, best_test_rmse


def run_pmf(R_train_sparse, R_test_sparse, mu, n_users, n_items, **kwargs):
    print(">> Inicializando modelo PMF...")
    pmf = PMFRecommender(n_users, n_items, 
                         n_factors=kwargs.get('n_factors', 50),
                         lr=kwargs.get('lr', 0.005),
                         reg=kwargs.get('reg', 0.05))
    
    history, best_rmse = pmf.fit(R_train_sparse, R_test_sparse, mu, 
                                 epochs=kwargs.get('epochs', 20), 
                                 patience=kwargs.get('patience', 3))
    
    return history, best_rmse, pmf

if __name__ == "__main__":
    pass
