# Implementación y Optimización del Modelo K-Nearest Neighbors (KNN)

El modelo de Vecinos Más Cercanos (KNN) es un clásico de filtrado colaborativo con memoria. Al no depender un entrenamiento paramétrico en diferido, memoriza la representación de los datos para inferir sobre ellos en tiempo de ejecución. 

En este repositorio, se optó por un enfoque **User-Based Collaborative Filtering**, es decir, para predecir si al Usuario A le gustará el Anime X, buscamos a los "K" usuarios más parecidos a A que ya hayan visto X, y realizamos una media ponderada de sus valoraciones.

## Del KNN Original al KNN Óptimo (Vectorización Masiva)

Durante el desarrollo de `knn.py`, se implementaron dos enfoques del algoritmo. Inicialmente se programó una variante base iterativa y nativa de Python, la cual debió refactorizarse a un enfoque totalmente vectorizado dadas las demandas de rendimiento masivas (de cálculo sobre millones de interacciones cruzadas).

### 1. Estructuras de Datos: Diccionarios vs Matrices Dispersas
* **Versión Original:** Utilizaba diccionarios anidados de Python (ej. `dict[usuario][item] = rating`) y estructuras de Conjuntos (`set`) para encontrar los animes en común buscando las intersecciones con bucles `for`. Esto originaba un coste altísimo en memoria (Type Checking en lenguaje interpretado) e impedía los cachés eficientes rápidos.
* **Versión Optimizada:** Se transicionó de diccionarios a matrices dispersas computacionales utilizando SciPy (`csr_matrix` y `csc_matrix`). Esto empaqueta los millones de votaciones en un espacio de memoria minúsculo en C, dividiendo filas (usuarios) y columnas (animes), permitiendo invocar la fila entera del usuario inmediatamente.

### 2. Cálculo de Similitudes (Pearson)
* **Versión Original:** El índice de Correlación (o similitud JMSD) se calculaba usuario a usuario. Por cada vecino evaluado, entraba a un bucle temporal, calculando restar las medias y los denominadores de las raíces cuadradas elemento a elemento, penalizando gravemente las predicciones incluso con caches rudimentarios.
* **Versión Optimizada:** Como la Correlación de Pearson puede traducirse algebraicamente en la "Similitud Coseno de vectores centrados en la media", en la versión actualizada sencillamente extraemos las medias, las restamos a toda la matriz a la vez (`R_norm_sparse`), y ejecutamos un producto escalar masivo (dot product) contra toda la lista de usuarios: `cosine_similarity(matrizA, matrizB)`. Lo que antes tardaba minutos evaluando un usuario, ahora calcula la similitud con los 100.000 restantes en un milisegundo usando paralelización SIMD.

### 3. Ordenación y Búsqueda de Top-K
* **Versión Original:** Tras recopilar todos los candidatos posibles, se usaba una ordenación de Listas de Python `.sort(reverse=True)[:K]`. Ordenar un gran array cada vez que queremos simplemente unos pocos elementos generaba un cuello de botella logarítmico innecesario $O(N \log N)$.
* **Versión Optimizada:** Se sustituyó la búsqueda exhaustiva ordenando mediante la función nativa `np.argpartition`. Esta operación algorítmica ignora el orden absoluto y divide el array devolviendo únicamente los K primeros en coste temporal lineal $O(N)$.

## Generación de Resultados Destinados al Dashboard (Item-Item)
Finalmente, los requerimientos del frontend (`anime-nexus`) necesitaban visualizar la similitud a nivel de Animes mediante un Grafo de Fuerza.
Para esta tarea se creó la función complementaria `generar_resultados_knn_frontend`. Dado que este entorno pide KNN Item-Item en vez de User-Based, el dataset completo se vuelca al modelo `NearestNeighbors` de `scikit-learn` en un algoritmo de fuerza bruta basándose en la métrica Coseno. Esta función explora velozmente los ítems para exportar las conexiones `Source`, `Target` y distancias, dando vida a la UI.