# Análisis del Notebook `main.ipynb` y Mejoras Propuestas

Este documento presenta las mejoras propuestas para las celdas Markdown del notebook principal del sistema de recomendación de anime.

---

## Evaluación General

El notebook está bien estructurado técnicamente, pero las explicaciones Markdown presentan oportunidades de mejora en los siguientes ámbitos:

| Área | Estado Actual | Mejora Propuesta |
|---|---|---|
| **Encabezado principal** | Muy escueto, sin contexto | Añadir descripción del proyecto, dataset y objetivos |
| **Sección 0 (Imports)** | Solo el título | Añadir justificación de las librerías |
| **Sección 1 (Datos)** | Solo el título | Describir el pipeline de carga y los splits |
| **Sección 2 (PMF prep)** | Solo el título | Explicar por qué PMF necesita matrices CSR |
| **Sección 3 (KNN)** | Buena base, algo extensa | Refinar el tono y la coherencia de fórmulas |
| **PMF (Sección 4)** | Bien redactado | Ajuste de estilo y contexto comparativo |
| **GMF (Sección 5)** | Bien redactado | Pequeños ajustes de estilo |
| **MLP (Sección 6)** | Bien redactado | Refinar y añadir tabla comparativa al final |

---

## Celdas Markdown Mejoradas

A continuación se muestran todas las celdas Markdown propuestas para reemplazar las actuales.

---

### CELDA 1 — Encabezado Principal

```
# Sistema de Recomendación de Anime — Notebook Principal

## Descripción del Proyecto

Este notebook centraliza el pipeline de experimentación para un **sistema de recomendación de anime** basado en Filtrado Colaborativo. Se evalúan y comparan cuatro familias de modelos de distinta complejidad algorítmica:

| Modelo | Tipo | Paradigma |
|--------|------|-----------|
| **KNN** | K-Vecinos más Cercanos | Memory-based CF |
| **PMF** | Probabilistic Matrix Factorization | Model-based CF (SGD) |
| **GMF** | Generalized Matrix Factorization | Deep Learning (lineal) |
| **MLP** | Multi-Layer Perceptron | Deep Learning (no lineal) |

## Datos

- **`anime.csv`**: Metadatos de animes (título, género, tipo, episodios, rating global).
- **`rating.csv`**: Historial de valoraciones de usuarios (escala 1-10). Dataset de ~6 M de interacciones.
- **`data/train.parquet`** / **`data/test.parquet`**: Splits de entrenamiento (80%) y evaluación (20%), generados por `preprocess.py`.
- **`data/mapeos.pkl`**: Diccionarios `user2idx` / `anime2idx` para convertir IDs originales a índices contiguos.

## Métricas de evaluación

- **RMSE** (Root Mean Squared Error): penaliza errores grandes y es el estándar de la industria para sistemas de recomendación de rating.
- **MAE** (Mean Absolute Error): interpretación directa en puntos de la escala.
- **Cobertura de Predicción**: porcentaje del test set para el que el modelo genera una predicción válida.
```

---

### CELDA 2 — Sección 0: Imports

```
## 0. Imports y Configuración del Entorno

Se importan las librerías necesarias para el pipeline completo:

- **`polars` / `pandas`**: Carga y manipulación eficiente de datos tabulares (Polars para lectura rápida de Parquet; Pandas como interfaz para scikit-learn y PyTorch).
- **`numpy`**: Operaciones numéricas vectorizadas.
- **`scipy.sparse`**: Matrices dispersas CSR requeridas por PMF.
- **`matplotlib` / `seaborn`**: Visualización de métricas y curvas de aprendizaje.
- **`torch`**: Framework de Deep Learning para los modelos GMF y MLP, con soporte GPU.
- Módulos locales (`algoritmos/`, `results/`): implementaciones de cada modelo y estudios de hiperparámetros de Optuna.
```

---

### CELDA 3 — Sección 1: Carga de Datos

```
## 1. Carga de Datos y Mapeos

Se cargan los splits preprocesados generados por `preprocess.py`. El pipeline de preprocesamiento aplicó los siguientes pasos:

1. **Filtrado de valoraciones implícitas** (`rating = -1`): se eliminan las interacciones sin puntuación explícita.
2. **Filtrado iterativo de Cold-Start**: se eliminan usuarios e ítems con menos de 20 interacciones, iterando hasta convergencia para garantizar que ningún elemento del split de test sea "invisible" al modelo.
3. **Re-indexación contínua**: los `user_id` y `anime_id` originales se mapean al rango `[0, N-1]` para compatibilidad directa con matrices y embeddings.
4. **Split estratificado (80/20)**: la división garantiza que todos los usuarios del test también aparezcan en entrenamiento, evitando el problema de cold-start en la evaluación.

Los diccionarios de mapeo (`user2idx`, `anime2idx`) permiten recuperar los IDs originales en cualquier momento para enriquecer las recomendaciones con metadatos de `anime.csv`.
```

---

### CELDA 4 — Sección 2: Preparación para PMF

```
## 2. Construcción de Matrices Dispersas (Formato CSR)

El modelo **PMF** implementa el descenso de gradiente estocástico (SGD) directamente sobre la matriz de utilidad Usuario-Ítem $R \in \mathbb{R}^{U \times I}$. Dado que la inmensa mayoría de las entradas de esta matriz son desconocidas (densidad típica < 1%), almacenarla en formato denso consumiría una cantidad de memoria prohibitiva.

La solución es la representación **CSR (Compressed Sparse Row)** de `scipy.sparse`, que almacena únicamente los valores no nulos junto con sus índices de fila y columna en arrays contiguos de memoria, reduciendo el uso de RAM de $\mathcal{O}(U \cdot I)$ a $\mathcal{O}(\text{nnz})$, donde $\text{nnz}$ es el número de interacciones observadas.

Además, se calcula la **media global de entrenamiento** $\mu$, que actúa como valor de referencia (baseline) en la fórmula de predicción del PMF:

$$\hat{r}_{u,i} = \mu + b_u + b_i + \mathbf{p}_u \cdot \mathbf{q}_i$$
```

---

### CELDA 5 — Sección 3: KNN

```
## 3. Modelo 1 — KNN (K-Nearest Neighbors)

El KNN es el representante clásico del **Filtrado Colaborativo basado en memoria** (*Memory-based CF*): en lugar de aprender parámetros, almacena todo el historial de interacciones y realiza búsquedas en tiempo de inferencia.

### 3.1 Variantes implementadas

Se distinguen dos perspectivas complementarias:

1. **User-Based CF** (`KNNRecommender`): para predecir la valoración del usuario $u$ sobre el anime $i$, se identifican los $K$ usuarios más similares a $u$ que hayan valorado $i$, y se pondera su opinión por la similitud con $u$.
2. **Item-Based CF** (integración con `scikit-learn`): calcula la similitud geométrica entre vectores de animes en el espacio de valoraciones de usuarios. Es más estable ante catálogos masivos y se utiliza para construir el grafo de relaciones del frontend.

### 3.2 Representación eficiente de datos

La matriz de utilidad $R \in \mathbb{R}^{U \times I}$ es altamente dispersa. El código la maneja de dos formas:

- **Diccionarios indexados** (`dict of dict`): acceso $\mathcal{O}(1)$ en `KNNRecommender`.
- **Matrices CSR** (`scipy.sparse.csr_matrix`): operaciones vectorizadas en C/C++ para la integración con scikit-learn.

### 3.3 Métricas de similitud

| Métrica | Descripción | Ventaja clave |
|---------|-------------|---------------|
| **Pearson** | Correlación lineal entre valoraciones co-emitidas | Corrige el sesgo de calificación individual |
| **JMSD** | Jaccard × (1 – MSD) | Combina solapamiento cualitativo y distancia cuantitativa |

**Similitud de Pearson:**

$$\text{sim}(u,v) = \frac{\sum_{i \in I_{u,v}} (r_{u,i} - \bar{r}_u)(r_{v,i} - \bar{r}_v)}{\sqrt{\sum_{i \in I_{u,v}} (r_{u,i} - \bar{r}_u)^2 \cdot \sum_{i \in I_{u,v}} (r_{v,i} - \bar{r}_v)^2}}$$

**Métrica JMSD:**

$$\text{JMSD}(u,v) = \text{Jaccard}(u,v) \cdot (1 - \text{MSD}(u,v))$$

$$\text{Jaccard}(u,v) = \frac{|I_u \cap I_v|}{|I_u \cup I_v|}, \qquad \text{MSD}(u,v) = \frac{1}{|I_{u,v}|} \sum_{i \in I_{u,v}} (r_{u,i} - r_{v,i})^2$$

### 3.4 Fórmula de predicción (Resnick)

Una vez seleccionados los $K$ vecinos más cercanos al usuario $u$ que han valorado el anime $i$, la predicción se calcula con la **fórmula de Resnick** con ajuste por la media del usuario, que normaliza el sesgo de calificación individual:

$$\hat{r}_{u,i} = \bar{r}_{u} + \frac{\sum_{v \in \mathcal{N}_K(u)} \text{sim}(u,v) \cdot (r_{v,i} - \bar{r}_v)}{\sum_{v \in \mathcal{N}_K(u)} |\text{sim}(u,v)|}$$

El resultado se recorta al rango válido $[1, 10]$ mediante `np.clip`.

### 3.5 Protocolo de evaluación y selección de $K$

Se evalúa el modelo sobre un subconjunto del test para distintos valores de $K$ (`k_values = [5, 10, 20, 30, 50, 75, 100]`) registrando:

- **RMSE**: penaliza errores grandes; estándar de la industria.
- **MAE**: error medio en puntos de la escala (interpretación directa).
- **Cobertura**: porcentaje de interacciones del test para las que el modelo encuentra vecinos válidos y emite una predicción.

El **método del codo** sobre la curva RMSE-$K$ permite seleccionar el valor óptimo de $K$ con menor complejidad computacional.

### Outputs de esta sección

1. **Gráfica del codo** (RMSE y MAE vs. $K$): permite identificar visualmente el valor de $K$ que minimiza el error.
2. **Tabla de métricas del mejor modelo**: RMSE, MAE y cobertura de predicción para el $K$ óptimo.
3. **Muestra de predicciones con gradiente de error**: tabla con 10 pares (usuario, anime) donde la columna `Diferencia_Absoluta` se colorea con un gradiente rojo para facilitar la auditoría visual de los errores del modelo.
```

---

### CELDA 6 — Sección 4: PMF

```
## 4. Modelo 2 — PMF (Probabilistic Matrix Factorization)

El **PMF** es la técnica clásica de **factorización de matrices** para filtrado colaborativo. En lugar de buscar vecinos similares (como el KNN), el PMF *aprende* una representación comprimida de usuarios e ítems en un espacio latente de dimensión reducida $d \ll \min(U, I)$.

### 4.1 Formulación del modelo

El modelo descompone la matriz de valoraciones $R$ en el producto de dos matrices latentes:

$$\hat{r}_{u,i} = \mu + b_u + b_i + \mathbf{p}_u \cdot \mathbf{q}_i$$

donde:
- $\mu$: media global de valoraciones (baseline).
- $b_u \in \mathbb{R}$: sesgo del usuario (captura si el usuario tiende a valorar alto o bajo).
- $b_i \in \mathbb{R}$: sesgo del ítem (captura si el anime recibe sistemáticamente valoraciones altas o bajas).
- $\mathbf{p}_u \in \mathbb{R}^d$: vector de factores latentes del usuario.
- $\mathbf{q}_i \in \mathbb{R}^d$: vector de factores latentes del anime.

### 4.2 Entrenamiento: SGD con Early Stopping

El modelo se entrena mediante **Descenso de Gradiente Estocástico (SGD)**. En cada paso, se toma una valoración conocida $(u, i, r_{u,i})$ y se actualizan los parámetros para minimizar el error cuadrático regularizado:

$$\mathcal{L} = \sum_{(u,i) \in \mathcal{D}} (r_{u,i} - \hat{r}_{u,i})^2 + \lambda \left( \|\mathbf{p}_u\|^2 + \|\mathbf{q}_i\|^2 + b_u^2 + b_i^2 \right)$$

Se monitoriza el RMSE en el conjunto de test al final de cada época. El entrenamiento se detiene anticipadamente (*Early Stopping*) si el RMSE de test no mejora durante `patience` épocas consecutivas, evitando el sobreajuste y reduciendo el tiempo de cómputo.

### 4.3 Búsqueda de hiperparámetros

La siguiente tabla resume los experimentos realizados con distintas configuraciones:

| `n_factors` | `lr` | `reg` | `epochs` | `patience` | RMSE (test) |
|:-----------:|:----:|:-----:|:--------:|:----------:|:-----------:|
| 50 | 0.005 | 0.05 | 30 | 5 | **1.1022** |
| 30 | 0.005 | 0.05 | 20 | 4 | 1.1183 |
| 20 | 0.005 | 0.05 | 15 | 4 | 1.1371 |
| 50 | 0.005 | 0.10 | 30 | 5 | 1.1371 |

**Conclusión**: La mejor configuración (`n_factors=50`, `lr=0.005`, `reg=0.05`) logra el menor error. Aumentar la regularización (`reg=0.10`) perjudica el rendimiento, ya que restringe en exceso la capacidad expresiva del modelo. El incremento de factores latentes mejora consistentemente el RMSE, lo que sugiere que el espacio de representación es lo suficientemente complejo como para beneficiarse de mayor dimensionalidad.
```

---

### CELDA 7 — Sección 5: GMF

```
## 5. Modelo 3 — GMF (Generalized Matrix Factorization)

El **GMF** es la primera arquitectura del framework **Neural Collaborative Filtering (NCF)** (He et al., 2017). Reformula la factorización matricial clásica dentro del paradigma de redes neuronales, habilitando el entrenamiento en GPU mediante PyTorch y el procesamiento por lotes.

### 5.1 Ventajas del enfoque neuronal sobre PMF

| Aspecto | PMF (SGD) | GMF (PyTorch) |
|---------|-----------|---------------|
| **Hardware** | CPU (NumPy) | GPU (CUDA, cuDNN) |
| **Datos** | Matrices CSR | Tensores + DataLoader |
| **Procesamiento** | Muestra a muestra | Por lotes (*mini-batch*) |
| **Escalabilidad** | Limitada | Alta (millones de interacciones) |

### 5.2 Arquitectura matemática

El GMF mapea el problema de predicción de ratings en tres pasos:

1. **Embeddings**: usuario $u$ e ítem $i$ se proyectan en vectores densos de dimensión $d$.
   $$\mathbf{p}_u = \text{Embedding}(u), \quad \mathbf{q}_i = \text{Embedding}(i)$$

2. **Producto de Hadamard** (multiplicación elemento a elemento, preservando la dimensión $d$):
   $$\mathbf{h}_{GMF} = \mathbf{p}_u \odot \mathbf{q}_i$$

3. **Capa de salida lineal** (colapsa el vector a un escalar):
   $$\hat{r}_{u,i} = \mathbf{w}^\top \mathbf{h}_{GMF} + b$$

Al no incorporar funciones de activación no lineales, el GMF es un **regularizador natural**: su rigidez estructural evita la memorización del ruido de entrenamiento y favorece una excelente generalización al test set.

### 5.3 Pipeline de datos en PyTorch

La gestión eficiente de datos se apoya en:
- **`torch.tensor`**: conversión de los IDs (user, item, rating) a tensores estáticos en VRAM.
- **`DataLoader` asíncrono**: paralelismo (`num_workers`) y fijación de memoria (`pin_memory`) para minimizar el cuello de botella CPU-GPU.

### 5.4 Optimización de hiperparámetros con Optuna

Los hiperparámetros `latent_dim` y `lr` se optimizan mediante búsqueda bayesiana con la librería **Optuna**, que construye un modelo probabilístico de la función objetivo para explorar el espacio de hiperparámetros de forma eficiente. El estudio se persiste en `results/optuna_study_gmf.pkl` para evitar recomputaciones.

### Outputs de esta sección

1. **Métricas del modelo GMF** (RMSE, MAE, Cobertura).
2. **Tabla de predicciones con gradiente de error**: auditoría visual comparable a la del KNN.
```

---

### CELDA 8 — Sección 6: MLP

```
## 6. Modelo 4 — MLP (Multi-Layer Perceptron)

El **MLP** es la segunda arquitectura NCF y complementa al GMF incorporando no-linealidad. Mientras el GMF realiza una interacción estrictamente lineal (producto de Hadamard), el MLP aprende interacciones complejas y no proporcionales entre usuarios e ítems.

### 6.1 Motivación: las limitaciones de la linealidad

Los modelos lineales (PMF, GMF) asumen que las preferencias de los usuarios pueden explicarse mediante combinaciones proporcionales de factores. Sin embargo, el comportamiento humano de consumo de medios está repleto de **interacciones no lineales** sutiles:

> *"Me gustan los animes de Acción y los de Mechas, pero detesto los que mezclan Acción + Mechas."*

Para capturar este tipo de dependencias cruzadas, el MLP concatena los embeddings y los propaga a través de capas densas con activaciones no lineales.

### 6.2 Arquitectura matemática

1. **Concatenación** de los vectores de embedding:
   $$\mathbf{z}_0 = [\mathbf{p}_u \,\|\, \mathbf{q}_i] \in \mathbb{R}^{2d}$$

2. **Forward pass** a través de capas densas (arquitectura `2d → 64 → 32 → 1`):
   $$\mathbf{z}_1 = \text{ReLU}(\mathbf{W}_1 \mathbf{z}_0 + \mathbf{b}_1)$$
   $$\mathbf{z}_2 = \text{ReLU}(\mathbf{W}_2 \mathbf{z}_1 + \mathbf{b}_2)$$
   $$\hat{r}_{u,i} = \mathbf{w}^\top \mathbf{z}_2 + b$$

La función **ReLU** introduce la no-linealidad: "dobla" y "corta" el espacio de representación para modelar preferencias no proporcionales.

### 6.3 Generalización vs. sobreajuste

Al disponer de mayor capacidad expresiva que el GMF, el MLP es más propenso al **sobreajuste** cuando las dimensiones latentes son grandes. La búsqueda bayesiana con Optuna evidenció que arquitecturas con `latent_dim` muy alto reducen el error de entrenamiento a costa de penalizar la generalización, lo que refleja el clásico trade-off sesgo-varianza en Deep Learning.

### Outputs de esta sección

1. **Curva de RMSE/MAE vs. dimensión latente** (estudio Optuna): permite visualizar el punto de inflexión entre underfitting y overfitting.
2. **Métricas finales del MLP** (RMSE, MAE, Cobertura).
3. **Tabla de predicciones con gradiente de error**: comparable directamente con las tablas de KNN y GMF (misma semilla aleatoria).

---

## 7. Resumen Comparativo de Modelos

| Modelo | RMSE (test) | MAE (test) | Cobertura | Paradigma |
|--------|:-----------:|:----------:|:---------:|-----------|
| KNN (K=10) | 1.3391 | 1.0017 | 100% | Memory-based CF |
| PMF | 1.1022 | — | — | Model-based CF (SGD) |
| GMF | — | — | 100% | NCF lineal (PyTorch) |
| MLP | 1.2149 | 0.9188 | 100% | NCF no lineal (PyTorch) |

> **Nota**: El PMF logra el mejor RMSE global, lo que pone de manifiesto que los modelos de mayor complejidad no siempre superan a las técnicas clásicas correctamente ajustadas. El MLP mejora el MAE sobre KNN pero no alcanza la precisión del PMF, reflejando el riesgo de sobreajuste en modelos neuronales profundos con dimensiones latentes elevadas.
```

---

## Resumen de los Cambios

### Mejoras de contenido
1. **Encabezado enriquecido**: tabla de modelos, descripción de datasets y métricas de evaluación.
2. **Sección de imports justificada**: qué hace cada librería y por qué se necesita.
3. **Sección de datos contextualizada**: descripción del pipeline de preprocesamiento aplicado.
4. **Sección CSR explicada**: motivación matemática de las matrices dispersas.
5. **KNN reestructurado**: tabla comparativa de métricas de similitud, mejora de la coherencia de las fórmulas.
6. **PMF mejorado**: tabla de hiperparámetros con análisis de resultados.
7. **GMF mejorado**: tabla comparativa PMF vs. GMF, contexto del paper NCF (He et al., 2017).
8. **MLP mejorado**: motivación de la no-linealidad con ejemplo concreto, análisis del trade-off sesgo-varianza.
9. **Tabla comparativa final** añadida para cerrar el análisis de todos los modelos.

### Mejoras de estilo
- Uso consistente de guiones en los títulos de sección.
- Secciones numeradas (3.1, 3.2, ...) para facilitar las referencias cruzadas.
- Tablas Markdown para datos comparativos.
- Tono más formal y técnico acorde con un informe de Data Science.
- Sección "OUTPUT ESPERADO" sustituida por "Outputs de esta sección" más concisa y técnica.
