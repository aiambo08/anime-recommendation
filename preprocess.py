# preprocess.py
import pandas as pd
import polars as pl
import numpy as np
import pickle
from sklearn.model_selection import train_test_split

def filter_cold_start(df: pl.DataFrame, min_user: int = 20, min_item: int = 20) -> pl.DataFrame:
    """
    Filtrado iterativo de cold start hasta convergencia.
    """
    prev_height = -1
    iteration = 0
    
    print("Iniciando filtrado Cold-Start iterativo...")
    while df.height != prev_height:
        prev_height = df.height
        iteration += 1
        
        # Obtenemos qué usuarios e items superan el umbral
        valid_users = df.group_by('user_id').len().filter(pl.col('len') >= min_user)['user_id']
        valid_items = df.group_by('anime_id').len().filter(pl.col('len') >= min_item)['anime_id']
        
        # Filtramos el dataset
        df = df.filter(
            pl.col('user_id').is_in(valid_users) & 
            pl.col('anime_id').is_in(valid_items)
        )
        print(f"  Iter {iteration}: {df.height:,} ratings restantes")
        
    print(f"✅ Convergencia en {iteration} iteraciones.\n")
    return df


def build_and_save_datasets(rating_csv_path="data/rating.csv"):
    """
    Pipeline principal: lee, limpia, mapea, divide y guarda en Parquet.
    """
    print(f"1. Cargando {rating_csv_path}...")
    df_rating = pl.read_csv(rating_csv_path)

    print("2. Filtrando valoraciones implícitas (rating = -1)...")
    df_rating = df_rating.filter(pl.col('rating') != -1)

    print("3. Aplicando filtrado iterativo (mínimo 20 por usuario/item)...")
    df_rating = filter_cold_start(df_rating, min_user=20, min_item=20)

    print("4. Re-indexando usuarios e ítems de 0 a N-1...")
    unique_users = df_rating['user_id'].unique().sort().to_list()
    unique_items = df_rating['anime_id'].unique().sort().to_list()

    user2idx = {id_: idx for idx, id_ in enumerate(unique_users)}
    anime2idx = {id_: idx for idx, id_ in enumerate(unique_items)}

    # Mapeo usando replace_strict
    df_rating = df_rating.with_columns([
        pl.col('user_id').replace_strict(user2idx),
        pl.col('anime_id').replace_strict(anime2idx)
    ])

    print("5. Dividiendo en Train (80%) y Test (20%) estratificado...")
    df_rating_pd = df_rating.to_pandas()
    # Bucketing de ratings en 3 rangos: bajo (1-4), medio (5-7), alto (8-10)
    # para que el stratify tenga suficiente cardinalidad por grupo
    df_rating_pd['_strat_key'] = (
        df_rating_pd['user_id'].astype(str) + '_' +
        pd.cut(
            df_rating_pd['rating'],
            bins=[0, 4, 7, 10],
            labels=['low', 'mid', 'high']
        ).astype(str)
    )
    # Eliminar grupos con menos de 2 muestras (necesario para stratify)
    # — usuarios con muy pocos ratings en un bucket concreto
    counts = df_rating_pd['_strat_key'].value_counts()
    valid_keys = counts[counts >= 2].index
    mask = df_rating_pd['_strat_key'].isin(valid_keys)

    df_valid   = df_rating_pd[mask]
    df_invalid = df_rating_pd[~mask]   # estos van directo a train

    df_train_valid, df_test = train_test_split(
        df_valid, test_size=0.2, random_state=42,
        stratify=df_valid['_strat_key']
    )
    
    # Reunir: los grupos sin suficientes muestras van todos a train
    df_train = pd.concat([df_train_valid, df_invalid], ignore_index=True)

    # Limpiar columna auxiliar
    df_train = df_train.drop(columns=['_strat_key'])
    df_test  = df_test.drop(columns=['_strat_key'])

    df_train = df_train.reset_index(drop=True)
    df_test  = df_test.reset_index(drop=True)

    # Verificación de integridad
    assert unique_users == sorted(unique_users), "ERROR: user2idx no es determinista"
    assert unique_items == sorted(unique_items), "ERROR: anime2idx no es determinista"
    print("✅ pipeline determinista")

    print("6. Guardando datasets en formato Parquet...")
    # Convertimos los splits de nuevo a Polars para usar su modo de guardado ultrarrápido
    pl.from_pandas(df_train).write_parquet("data/train.parquet")
    pl.from_pandas(df_test).write_parquet("data/test.parquet")
    
    # También es muy útil guardar los diccionarios de mapeo para cuando recomiendes animes
    with open("data/mapeos.pkl", "wb") as f:
        pickle.dump({"user2idx": user2idx, "anime2idx": anime2idx}, f)

    print("¡Listo! Creados archivos: 'data/train.parquet', 'data/test.parquet' y 'data/mapeos.pkl'.")


# Si ejecutas el archivo directamente por terminal (`python preprocess.py`) 
if __name__ == "__main__":
    build_and_save_datasets()