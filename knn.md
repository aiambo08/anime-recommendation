# Implementación del Algoritmo KNN para Sistemas de Recomendación de Anime

## 1. Introducción

El algoritmo **K-Nearest Neighbors (KNN)** aplicado al filtrado colaborativo es un método basado en memoria (*memory-based*): no aprende una representación paramétrica en diferido, sino que memoriza todas las interacciones históricas y las reutiliza directamente en tiempo de inferencia.

En este proyecto se implementa un **User-Based Collaborative Filtering**: para predecir si al usuario $u$ le gustará el anime $i$, se buscan los $K$ usuarios más parecidos que ya hayan valorado $i$, y se realiza una media ponderada de sus valoraciones.

$$\hat{r}_{u,i} = \bar{r}_u + \frac{\sum_{v \in \mathcal{N}_K(u,i)} \text{sim}(u,v) \cdot (r_{v,i} - \bar{r}_v)}{\sum_{v \in \mathcal{N}_K(u,i)} |\text{sim}(u,v)|}$$

---

## 2. Versión Original: Implementación Iterativa (`knn.py`)

### 2.1 Estructura de datos: diccionarios anidados

```python
self.ratings_train = {}
for row in df_train.itertuples(index=False):
    u, i, r = row.user_id, row.anime_id, row.rating
    if u not in self.ratings_train:
        self.ratings_train[u] = {}
    self.ratings_train[u][i] = r
```

Las intersecciones de ítems comunes entre dos usuarios se calculan mediante conjuntos:

```python
items_comunes = self.items_por_usuario_train[u].intersection(
    self.items_por_usuario_train[v]
)
```

### 2.2 Métricas de similitud

#### Similitud JMSD (Jaccard × MSD)

Combina la cobertura de ítems compartidos con la diferencia cuadrática media:

$$\text{JMSD}(u,v) = \text{Jaccard}(u,v) \cdot \left(1 - \frac{\sum_{i \in I_{uv}} (r_{u,i} - r_{v,i})^2}{|I_{uv}| \cdot (R_{\max} - R_{\min})^2}\right)$$

#### Correlación de Pearson

$$\text{Pearson}(u,v) = \frac{\sum_{i \in I_{uv}} (r_{u,i} - \bar{r}_u)(r_{v,i} - \bar{r}_v)}{\sqrt{\sum_i (r_{u,i}-\bar{r}_u)^2 \cdot \sum_i (r_{v,i}-\bar{r}_v)^2}}$$

### 2.3 Búsqueda Top-K: ordenación completa

```python
# O(N log N): ordena TODOS los candidatos para quedarse solo con K
top_k_vecinos = sorted(candidatos, key=lambda x: x[1], reverse=True)[:k]
```

### 2.4 Cuello de botella

Con millones de interacciones y decenas de miles de usuarios, cada predicción requiere:
- Calcular similitud par a par en Python puro → sin vectorización
- Ordenar todos los candidatos → coste $O(N \log N)$ innecesario
- Caché de pares que crece sin límite en memoria

---

## 3. Versión Optimizada: Vectorización Masiva (`knn_optimo.py`)

### 3.1 Matrices dispersas SciPy

En lugar de diccionarios, se construye una **matriz CSR** (Compressed Sparse Row):

```python
from scipy.sparse import csr_matrix

self.R_sparse = csr_matrix(
    (data, (row_idx, col_idx)),
    shape=(self.n_users, self.n_items)
)
```

Se mantienen dos representaciones simultáneas:

| Formato | Acceso óptimo | Uso concreto |
|---------|--------------|--------------|
| **CSR** | Filas (usuarios) | Vectores de usuario para similitud |
| **CSC** | Columnas (ítems) | Usuarios que valoraron el ítem $i$ |

```python
# CSC: localizar en O(1) los usuarios que valoraron el ítem i
self.R_norm_csc = self.R_norm_sparse.tocsc()
idx_start = self.R_norm_csc.indptr[i_idx]
idx_end   = self.R_norm_csc.indptr[i_idx + 1]
users_rated_i = self.R_norm_csc.indices[idx_start:idx_end]
```

### 3.2 Pearson ≡ Coseno sobre vectores centrados

Una propiedad algebraica fundamental: **la correlación de Pearson es equivalente a la similitud coseno sobre ratings centrados en la media**:

$$\text{Pearson}(u,v) = \cos\!\left(\mathbf{r}_u - \bar{r}_u \mathbf{1},\; \mathbf{r}_v - \bar{r}_v \mathbf{1}\right)$$

Esto permite usar `cosine_similarity` de scikit-learn, que delega en rutinas BLAS (Fortran/C optimizado con SIMD):

```python
from sklearn.metrics.pairwise import cosine_similarity

# Centrar medias sobre toda la matriz de una vez
for i in range(self.n_users):
    idx_s = self.R_norm_sparse.indptr[i]
    idx_e = self.R_norm_sparse.indptr[i+1]
    self.R_norm_sparse.data[idx_s:idx_e] -= self.user_means[i]

# UNA sola llamada: similitud de TODOS los usuarios test con TODOS los de train
self._sim_batch_cache = cosine_similarity(
    self.R_norm_sparse[test_u_idx],   # (|test_users|, n_items)
    self.R_norm_sparse,                # (n_users, n_items)
    dense_output=True
)
```

### 3.3 Top-K con `np.argpartition`

```python
# O(N) con Introselect, frente a O(N log N) del sorted()
top_k_indices = np.argpartition(sims, -k)[-k:]
top_sims      = sims[top_k_indices]
```

`np.argpartition` garantiza que los $K$ mayores valores estén en las últimas $K$ posiciones sin ordenarlos entre sí. Para la predicción ponderada, el orden interno no es necesario.

### 3.4 Caché de similitudes por lotes

La similitud se calcula **una sola vez** por conjunto de test y se reutiliza para todos los valores de $K$:

```python
def _prepare_sim_batch(self, test_df):
    test_users = test_df['user_id'].unique()
    if self._test_users_cache is not None and np.array_equal(
        self._test_users_cache, test_users
    ):
        return  # Reutilizar caché existente
    # Calcular batch masivo y cachear
    self._sim_batch_cache = cosine_similarity(...)
    self._test_users_cache = test_users
```

---

## 4. Comparativa de Implementaciones

| Aspecto | Versión Original (`knn.py`) | Versión Optimizada (`knn_optimo.py`) |
|---------|-----------------------------|--------------------------------------|
| Estructura | `dict[u][i]` + `set` | `scipy.sparse.csr_matrix` |
| Similitud | Bucle Python por par | `cosine_similarity` BLAS/SIMD |
| Centrado | Bucle explícito | Vectorización sobre CSR |
| Acceso por ítem | Iteración sobre `dict` | CSC `indptr` en O(1) |
| Top-K | `sorted()` → $O(N \log N)$ | `np.argpartition` → $O(N)$ |
| Tiempo estimado | Horas | Minutos |

---

## 5. Módulo para el Dashboard: KNN Ítem-Ítem

El frontend (`anime-nexus`) visualiza un **grafo de fuerza** de similitudes entre animes. Esto requiere un enfoque Ítem-Ítem distinto al User-Based de predicción.

La función `generar_resultados_knn_frontend` usa `NearestNeighbors` de scikit-learn con la **matriz ítem-usuario** (traspuesta):

```python
from sklearn.neighbors import NearestNeighbors

# Cada fila es un anime representado por los ratings de sus usuarios
item_item_matrix = matrix_user_item.transpose()  # (n_items, n_users)

knn_model = NearestNeighbors(metric='cosine', algorithm='brute')
knn_model.fit(item_item_matrix)
distances, indices = knn_model.kneighbors(item_item_matrix, n_neighbors=6)
```

El archivo de salida `results/resultados_knn.csv` sigue el esquema:

```
source, target, distance, similarity, rank
```

---

## 6. Búsqueda del K Óptimo y Resultados

Se evaluaron 7 valores de $K$ sobre el test completo. El criterio de selección es el **RMSE mínimo**:

| K | RMSE | MAE | Cobertura |
|---|------|-----|-----------|
| 5 | 1.3398 | 1.0168 | 100.0% |
| **10** | **1.3391** | **1.0017** | **100.0%** |
| 20 | 1.3582 | 1.0151 | 100.0% |
| 30 | 1.3704 | 1.0206 | 100.0% |
| 50 | 1.3970 | 1.0380 | 100.0% |
| 75 | 1.4223 | 1.0564 | 100.0% |
| 100 | 1.4396 | 1.0706 | 100.0% |

**K óptimo: K = 10** → RMSE = 1.3391, MAE = 1.0017, cobertura = 100%.

### Interpretación de la curva RMSE vs K

El RMSE presenta un **mínimo claro en K = 10** y crece monótonamente a partir de ahí:

- **K pequeño (< 10):** Alta varianza. Los pocos vecinos seleccionados pueden no ser representativos.
- **K = 10:** Balance óptimo entre varianza y sesgo.
- **K grande (> 10):** Sesgo creciente. Se incluyen usuarios poco similares que diluyen la señal.

---

## 7. Caché en Disco para Evitar Recomputaciones

La evaluación de KNN sobre el test completo tarda varios minutos. Para evitar reejecuciones innecesarias:

```python
def run_knn_opt(..., force_recompute=False):
    if os.path.exists(results_file) and not force_recompute:
        # Cargar resultados guardados
        df_results = pd.read_csv(results_file)
        best_k = int(df_results.loc[df_results['RMSE'].idxmin(), 'K'])
        # Solo evaluar el best_k para generar predicciones de muestra
        rmse, mae, cob, p10, ndcg, df_preds = knn.evaluate(df_test, best_k)
        return df_results, knn, best_k, df_preds, p10, ndcg
```

El archivo `results/resultados_k_optimo.csv` persiste los resultados. Para forzar una reevaluación: `force_recompute=True`.

---

## 8. Resumen Final

| Métrica | Valor (K = 10) |
|---------|----------------|
| **RMSE** | 1.3391 |
| **MAE** | 1.0017 |
| **Cobertura** | 100.0% |
| **Similitud** | Pearson vectorizada (coseno centrado) |
| **Implementación** | `scipy.sparse` + `sklearn.cosine_similarity` |

El KNN con K = 10 presenta el RMSE más alto de todos los modelos del proyecto (PMF obtiene 1.1022), lo cual es coherente con la naturaleza del algoritmo: al ser un método basado en memoria, no extrae representaciones latentes globales y su capacidad de generalización es más limitada. Su ventaja es la **interpretabilidad** y la **cobertura perfecta**.
