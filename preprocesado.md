# Pipeline de Preprocesamiento de Datos (`preprocess.py`)

## 1. Introducción

La fase de preprocesamiento es crítica para garantizar la calidad de los datos que alimentan los modelos de recomendación. El script `preprocess.py` implementa un **pipeline automatizado y reproducible** que transforma los datasets brutos en estructuras optimizadas listas para el entrenamiento.

### Datasets de entrada

| Archivo | Tamaño | Descripción |
|---------|--------|-------------|
| `data/anime.csv` | ~3 MB | Metadatos: nombre, género, tipo, episodios, rating medio |
| `data/rating.csv` | ~111 MB | Interacciones: `user_id`, `anime_id`, `rating` (1–10 o −1) |

El dataset de ratings original contiene **7.813.737 interacciones** de 73.516 usuarios sobre 11.200 animes. Tras el pipeline, queda reducido a **4.994.668 interacciones** de 47.143 usuarios sobre 6.532 animes.

---

## 2. Paso 1 — Eliminación de Valoraciones Implícitas

```python
df_rating = df_rating.filter(pl.col('rating') != -1)
```

El dataset original codifica con `−1` los casos en que un usuario marcó un anime como "visto" pero **no asignó una puntuación numérica**. Estas valoraciones implícitas son incompatibles con los modelos de predicción de rating (PMF, KNN, BMF) que minimizan el error cuadrático sobre valoraciones explícitas.

**Motivo de la eliminación:**
- Los modelos interpretarían `−1` como una valoración real negativa, sesgando todas las predicciones.
- Las métricas RMSE y MAE perderían significado al incluir valores fuera del rango [1, 10].

**Efecto:** Se eliminan aproximadamente 1.5 millones de registros implícitos.

---

## 3. Paso 2 — Filtrado Cold-Start Iterativo (k-core)

### Problema del Cold-Start

El *problema del arranque frío* ocurre cuando un usuario tiene muy pocas interacciones registradas (imposible construir un perfil fiable) o cuando un anime ha sido valorado muy pocas veces (imposible estimar su calidad latente). Estos casos aportan **ruido estadístico** y dificultan el aprendizaje de factores latentes.

### Implementación: filtrado iterativo hasta convergencia

```python
def filter_cold_start(df, min_user=20, min_item=20):
    prev_height = -1
    iteration = 0
    while df.height != prev_height:
        prev_height = df.height
        iteration += 1
        valid_users = df.group_by('user_id').len().filter(pl.col('len') >= min_user)['user_id']
        valid_items = df.group_by('anime_id').len().filter(pl.col('len') >= min_item)['anime_id']
        df = df.filter(
            pl.col('user_id').is_in(valid_users) &
            pl.col('anime_id').is_in(valid_items)
        )
        print(f"  Iter {iteration}: {df.height:,} ratings restantes")
    return df
```

**Umbral elegido:** `min_user = 20`, `min_item = 20`

La naturaleza **iterativa** es esencial. Eliminar usuarios con menos de 20 interacciones puede hacer que algunos animes caigan por debajo del umbral de 20 valoraciones, lo que a su vez puede afectar a otros usuarios. El proceso se repite en bucle `while` hasta que el número de filas **converge** (no cambia entre iteraciones), garantizando que el dataset final satisface los umbrales en ambas dimensiones simultáneamente.

```
Iter 1: 5,431,202 ratings restantes
Iter 2: 5,112,843 ratings restantes
Iter 3: 4,998,121 ratings restantes
Iter 4: 4,994,668 ratings restantes  ← convergencia
```

---

## 4. Paso 3 — Re-indexación de Entidades

Tras el filtrado, los IDs originales de usuarios y animes son **no contiguos**: existen huecos en la secuencia numérica. Los frameworks de álgebra lineal (SciPy, PyTorch) requieren índices en el rango `[0, N−1]` para poder dimensionar matrices y tablas de embeddings de forma exacta.

```python
unique_users = df_rating['user_id'].unique().sort().to_list()
unique_items = df_rating['anime_id'].unique().sort().to_list()

user2idx  = {id_: idx for idx, id_ in enumerate(unique_users)}
anime2idx = {id_: idx for idx, id_ in enumerate(unique_items)}

df_rating = df_rating.with_columns([
    pl.col('user_id').replace_strict(user2idx),
    pl.col('anime_id').replace_strict(anime2idx)
])
```

El resultado son dos diccionarios de mapeo (`user2idx`, `anime2idx`) que permiten:
- Inicializar matrices dispersas con dimensiones exactas: `csr_matrix(..., shape=(NU, NI))`
- Inicializar tablas de embeddings PyTorch: `nn.Embedding(NU, latent_dim)`
- Recuperar el nombre original del anime a partir de su índice durante la inferencia

Los diccionarios se verifican como **deterministas** antes de guardar:
```python
assert unique_users == sorted(unique_users), "ERROR: user2idx no es determinista"
assert unique_items == sorted(unique_items), "ERROR: anime2idx no es determinista"
```

Esto garantiza que el mismo dataset siempre produce los mismos índices, condición necesaria para la reproducibilidad de los experimentos.

---

## 5. Paso 4 — División Train/Test Estratificada

### División base: 80% / 20%

La división simple aleatoria puede crear conjuntos desequilibrados: un usuario que tiende a puntuar bajo podría acabar con todos sus votos en el test, introduciendo sesgo. La solución es una **división estratificada por usuario y rango de rating**.

### Bucketing de ratings

```python
df_rating_pd['_strat_key'] = (
    df_rating_pd['user_id'].astype(str) + '_' +
    pd.cut(
        df_rating_pd['rating'],
        bins=[0, 4, 7, 10],
        labels=['low', 'mid', 'high']
    ).astype(str)
)
```

Se crean 3 rangos para cada usuario:

| Bucket | Rango | Significado |
|--------|-------|-------------|
| `low` | 1–4 | Animes que no gustaron |
| `mid` | 5–7 | Animes con valoración media |
| `high` | 8–10 | Animes favoritos |

La clave de estratificación es `{user_id}_{bucket}`, lo que garantiza que la **proporción de votos bajos, medios y altos de cada usuario se mantiene igual en train y test**.

### Manejo de grupos escasos

Los grupos con una sola valoración no pueden ser estratificados (scikit-learn requiere al menos 2 muestras por estrato):

```python
counts = df_rating_pd['_strat_key'].value_counts()
valid_keys   = counts[counts >= 2].index
mask         = df_rating_pd['_strat_key'].isin(valid_keys)

df_valid   = df_rating_pd[mask]    # estratificable normalmente
df_invalid = df_rating_pd[~mask]   # va directamente a train (precaución)

df_train_valid, df_test = train_test_split(
    df_valid, test_size=0.2, random_state=42,
    stratify=df_valid['_strat_key']
)
df_train = pd.concat([df_train_valid, df_invalid], ignore_index=True)
```

Los registros de grupos escasos van **íntegramente a train** para no perder información de test que no pueda ser compensada.

**Efecto final:**
- `data/train.parquet`: ~3.995.000 interacciones
- `data/test.parquet`: ~999.000 interacciones

---

## 6. Paso 5 — Almacenamiento en Parquet

### Limitaciones del CSV

Guardar el dataset post-procesado como CSV tiene dos problemas críticos:
1. **Inferencia de tipos en cada lectura:** Pandas reinfiere los tipos de columna cada vez, añadiendo tiempo de arranque.
2. **Tamaño en disco:** El CSV de ratings pesa ~111 MB; la versión filtrada en CSV seguiría siendo grande.

### Solución: formato Parquet con Polars

```python
pl.from_pandas(df_train).write_parquet("data/train.parquet")
pl.from_pandas(df_test).write_parquet("data/test.parquet")

with open("data/mapeos.pkl", "wb") as f:
    pickle.dump({"user2idx": user2idx, "anime2idx": anime2idx}, f)
```

| Característica | CSV | Parquet |
|----------------|-----|---------|
| Tipos de dato | Reinfiere en lectura | Almacenados explícitamente |
| Compresión | Ninguna | Snappy (por defecto) |
| Tiempo de lectura | ~10–30 s | < 1 s |
| Tamaño en disco | Grande | Reducido (3–5×) |
| Lectura columnar | No | Sí (solo lee las columnas necesarias) |

### Archivos de salida

| Archivo | Contenido |
|---------|-----------|
| `data/train.parquet` | Dataset de entrenamiento (80%) con columnas `user_id`, `anime_id`, `rating` |
| `data/test.parquet` | Dataset de test (20%) con las mismas columnas |
| `data/mapeos.pkl` | Diccionarios `user2idx` y `anime2idx` para mapeo de IDs |

---

## 7. Diagrama del Pipeline

```
data/rating.csv (111 MB, ~7.8M filas)
        │
        ▼
┌─────────────────────────────────┐
│ Paso 1: Eliminar rating == -1   │ → -1.5M filas implícitas
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ Paso 2: k-core filtering        │ → min 20 ratings por user e item
│   (bucle iterativo hasta        │   Converge en ~4 iteraciones
│    convergencia)                │   -2.8M filas
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ Paso 3: Re-indexación           │ → IDs comprimidos [0, N-1]
│   user2idx, anime2idx           │   47.143 usuarios, 6.532 ítems
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ Paso 4: Split Train/Test 80/20  │ → Estratificado por usuario
│   Estratificación 3 buckets     │   y rango de rating
│   Grupos escasos → train        │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ Paso 5: Serialización Parquet   │ → train.parquet, test.parquet
│         + Pickle mapeos         │   mapeos.pkl
└─────────────────────────────────┘
```

---

## 8. Estadísticas del Dataset Final

| Estadística | Valor |
|-------------|-------|
| Usuarios | 47.143 |
| Animes | 6.532 |
| Interacciones totales | 4.994.668 |
| Interacciones train | ~3.995.000 |
| Interacciones test | ~999.000 |
| Densidad de la matriz | ~1.62% |
| Rating medio (train) | ~7.8 |

La **densidad del 1.62%** confirma que la matriz usuario-ítem es altamente dispersa, lo que justifica el uso de representaciones en `scipy.sparse` en lugar de matrices densas (que consumirían ~47.143 × 6.532 × 4 bytes ≈ 1.2 GB solo para float32).

---

## 9. Reproducibilidad

El pipeline es completamente determinista:
- `random_state=42` en `train_test_split`
- Ordenación estable de IDs únicos antes del mapeo
- Verificación de aserciones al final

Para regenerar todos los archivos desde cero:

```bash
uv run python preprocess.py
```
