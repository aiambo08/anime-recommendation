# Informe de Preprocesado de Datos (`preprocess.py`)

La fase de preprocesamiento es una de las más críticas en la construcción de Sistemas de Recomendación. Se ha implementado un *pipeline* automatizado y robusto a través del script `preprocess.py` que prepara el dataset bruto de Animes y Ratings para que los modelos subyacentes puedan entrenarse de manera eficaz.

A continuación, se detalla paso a paso el razonamiento de las transformaciones aplicadas:

## 1. Eliminación de Valoraciones Implícitas
El dataset original contiene valoraciones numéricas (1-10) y valoraciones implícitas marcadas con `-1` (el usuario vio el anime, pero no le asignó nota). 
Dado que la mayoría de nuestros modelos predictivos (PMF, KNN) operan intentando minimizar el error cuadrático medio (RMSE) sobre valoraciones explícitas, el primer paso es **eliminar todas las filas con rating `-1`**.

## 2. Filtrado Cold-Start Iterativo (k-core filtering)
Un problema fundamental en Sistemas de Recomendación es el *Cold-Start* (usuarios con muy pocos votos o animes con muy pocas visualizaciones). Las interacciones con muy poca información generan ruido estadístico y dificultan el aprendizaje de los factores latentes.
Para solucionar esto, se implementa una función `filter_cold_start`:
* Exige que un usuario tenga un mínimo de **20 interacciones**.
* Exige que un anime haya sido votado al menos **20 veces**.
* **Es iterativo:** Si eliminas usuarios con <20 votos, algunos animes pueden caer por debajo del umbral de los 20 votos, y viceversa. Por ello, el filtrado se repite en un bucle `while` hasta que el dataset **converge** (su número de filas deja de cambiar).

## 3. Re-indexación de Entidades (Mapping)
Los IDs originales de los usuarios y animes pueden no ser contiguos, o pueden tener saltos grandes después del filtrado iterativo. 
Para poder utilizar estos datos como índices en tensores (PyTorch) o en matrices dispersas (SciPy), se necesita compresión al rango `[0, N-1]`.
* Se extraen IDs únicos de `user_id` y `anime_id`.
* Se genera un diccionario de equivalencias (`user2idx` y `anime2idx`).
* Se reemplazan en el dataframe. Este paso es fundamental para poder inicializar embeddings y matrices de tamaño exacto.

## 4. División Train / Test (Estratificada)
Se implementa una división 80% Entrenamiento y 20% Pruebas. No obstante, emplear un split completamente aleatorio puede hacer que las métricas obtenidas se sesguen (ej. un usuario estricto que puntúa bajo podría acabar con todos sus votos en validación).
* Se crean **"buckets" estratificados**: Agrupamos a cada usuario y sus valoraciones clasificadas en *rango bajo* (1-4), *medio* (5-7) y *alto* (8-10).
* Se aplica el particionado asegurando que la proporción de votos bajos, medios y altos de cada usuario se mantiene igual tanto en *Train* como en *Test*.
* Los casos límite (grupos con una sola valoración que impiden estratificar) se envían directamente a entrenamiento por precaución.

## 5. Almacenamiento Optimizado (Parquet)
Guardar el tren de datos post-procesado en un archivo CSV normal puede ralentizar los arranques del `anime.ipynb` hasta varios minutos por la re-inferencia de tipos de datos.
Se guarda la salida final en formato **Parquet** mediante Polars, que conserva los tipos de datos nativos, pesa mucho menos y se lee de manera instantánea. Los diccionarios generados (`user2idx`, `anime2idx`) se exportan a un binario (`mapeos.pkl`) para la inferencia a nivel frontal.