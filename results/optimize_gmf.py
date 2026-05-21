import os
import pickle
import torch
import torch.nn as nn
import optuna
from torch.utils.data import DataLoader, TensorDataset
from sklearn.metrics import mean_absolute_error

def check_or_run_optuna_gmf(df_train, df_test, NUM_USERS, NUM_ITEMS):
    """
    Versión optimizada: Calcula internamente los tensores y datasets de PyTorch
    para dejar el notebook principal limpio de parámetros.
    """
    ruta_script_dir = os.path.dirname(os.path.abspath(__file__))
    ruta_archivo_gmf = os.path.join(ruta_script_dir, 'optuna_study_gmf.pkl')

    # 1. COMPROBACIÓN DE EXISTENCIA
    if os.path.exists(ruta_archivo_gmf):
        # os.path.basename extrae solo 'optuna_study_gmf.pkl' borrando la ruta de carpetas
        print(f"📦 Detectado estudio previo. Cargando resultados desde: {os.path.basename(ruta_archivo_gmf)}")
        with open(ruta_archivo_gmf, 'rb') as f:
            return pickle.load(f)

    print("🔍 No se encontró ningún estudio previo. Preparando optimización bayesiana para GMF...")

    # EL TRABAJO SUCIO SE HACE AQUÍ DENTRO AHORA:
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    X_test = df_test[['user_id', 'anime_id']]
    y_test = df_test['rating']

    users_t = torch.tensor(df_train['user_id'].values, dtype=torch.long)
    items_t = torch.tensor(df_train['anime_id'].values, dtype=torch.long)
    ratings_t = torch.tensor(df_train['rating'].values, dtype=torch.float32)
    dataset = TensorDataset(users_t, items_t, ratings_t)

    from algoritmos.gmf import GMFModel

    def objective_gmf(trial):
        d_latente = trial.suggest_int('latent_dim', 5, 65, step=5)
        lr = trial.suggest_float('lr', 1e-4, 1e-2, log=True)

        modelo_gmf = GMFModel(NUM_USERS, NUM_ITEMS, d_latente).to(device)
        optimizer = torch.optim.Adam(modelo_gmf.parameters(), lr=lr)
        loss_fn = nn.MSELoss()

        loader_gmf_opt = DataLoader(
            dataset,
            batch_size=2048,
            shuffle=True,
            num_workers=4,
            pin_memory=True if device.type == 'cuda' else False
        )

        for epoch in range(5):
            modelo_gmf.train()
            for batch_u, batch_i, batch_r in loader_gmf_opt:
                optimizer.zero_grad()
                outputs = modelo_gmf(batch_u.to(device, non_blocking=True), batch_i.to(device, non_blocking=True))
                loss = loss_fn(outputs, batch_r.to(device, non_blocking=True))
                loss.backward()
                optimizer.step()

            modelo_gmf.eval()
            with torch.no_grad():
                users_test = torch.tensor(X_test['user_id'].values, dtype=torch.long).to(device)
                items_test = torch.tensor(X_test['anime_id'].values, dtype=torch.long).to(device)
                preds_test = modelo_gmf(users_test, items_test).cpu().numpy()

            epoch_test_mae = mean_absolute_error(y_test, preds_test)
            trial.report(epoch_test_mae, epoch)
            if trial.should_prune(): raise optuna.TrialPruned()

        return epoch_test_mae

    study_gmf = optuna.create_study(direction='minimize')
    study_gmf.optimize(objective_gmf, n_trials=7)

    with open(ruta_archivo_gmf, 'wb') as f:
        pickle.dump(study_gmf, f)
    print(f"\n✅ Nuevo estudio GMF guardado con éxito en: {ruta_archivo_gmf}")

    return study_gmf

if __name__ == "__main__":
    pass