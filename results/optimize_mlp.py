import os
import pickle
import torch
import torch.nn as nn
import optuna
from torch.utils.data import DataLoader, TensorDataset
from sklearn.metrics import mean_absolute_error

def check_or_run_optuna_mlp(df_train, df_test, X_test, y_test, dataset, NUM_USERS, NUM_ITEMS, device):
    """
    Revisa si el estudio de Optuna para MLP ya existe en la carpeta de resultados.
    Si existe, lo carga. Si no, lanza la optimización bayesiana de 40 intentos.
    """
    # Como el script está dentro de 'results', guardamos el pkl en su misma ubicación
    ruta_script_dir = os.path.dirname(os.path.abspath(__file__))
    ruta_archivo_mlp = os.path.join(ruta_script_dir, 'optuna_study_mlp.pkl')

    # 1. COMPROBACIÓN DE EXISTENCIA
    if os.path.exists(ruta_archivo_mlp):
        print(f"📦 Detectado estudio previo. Cargando resultados desde: {ruta_archivo_mlp}")
        with open(ruta_archivo_mlp, 'rb') as f:
            study_mlp = pickle.load(f)
        print(f"   [Cargado] Mejor MAE previo: {study_mlp.best_value:.4f} | Parámetros: {study_mlp.best_params}")
        return study_mlp

    print("🔍 No se encontró ningún estudio previo. Preparando optimización bayesiana...")

    # =====================================================================
    # 2. DEFINICIÓN DE LA FUNCIÓN OBJETIVO DEL MLP
    # =====================================================================
    # Importamos dinámicamente la clase para evitar fallos si se declara en otro archivo
    from mlp import MLPModel 

    def objective_mlp(trial):
        d_latente = trial.suggest_int('latent_dim', 16, 64, step=16)
        lr = trial.suggest_float('lr', 1e-4, 1e-2, log=True)
        
        modelo_mlp = MLPModel(NUM_USERS, NUM_ITEMS, d_latente).to(device)
        optimizer = torch.optim.Adam(modelo_mlp.parameters(), lr=lr)
        loss_fn = nn.MSELoss()
        
        loader_mlp_opt = DataLoader(
            dataset, 
            batch_size=2048, 
            shuffle=True, 
            num_workers=4, 
            pin_memory=True if device.type == 'cuda' else False
        )
        
        epochs_prueba = 4
        
        for epoch in range(epochs_prueba):
            modelo_mlp.train()
            for batch_u, batch_i, batch_r in loader_mlp_opt:
                batch_u = batch_u.to(device, non_blocking=True)
                batch_i = batch_i.to(device, non_blocking=True)
                b_r = batch_r.to(device, non_blocking=True)
                
                optimizer.zero_grad()
                preds = modelo_mlp(batch_u, batch_i)
                loss = loss_fn(preds, b_r)
                loss.backward()
                optimizer.step()
                
            modelo_mlp.eval()
            with torch.no_grad():
                users_test = torch.tensor(X_test['user_id'].values, dtype=torch.long).to(device)
                items_test = torch.tensor(X_test['anime_id'].values, dtype=torch.long).to(device)
                preds_test = modelo_mlp(users_test, items_test).cpu().numpy()
                
            epoch_test_mae = mean_absolute_error(y_test, preds_test)
            
            trial.report(epoch_test_mae, epoch)
            if trial.should_prune():
                raise optuna.TrialPruned()
                
        return epoch_test_mae

    # =====================================================================
    # 3. LANZAMIENTO DEL ESTUDIO (40 Intentos)
    # =====================================================================
    study_mlp = optuna.create_study(direction='minimize')
    
    print("🚀 Iniciando optimización del MLP en la GPU (Aprox. 34 minutos, paciencia)...")
    study_mlp.optimize(objective_mlp, n_trials=40)

    print("\n" + "🏆" * 20)
    print("¡BÚSQUEDA DEL MLP COMPLETADA POR OPTUNA!")
    print(f"Mejor MAE conseguido en MLP: {study_mlp.best_value:.4f}")
    print(f"Parámetros óptimos encontrados: {study_mlp.best_params}")
    print("🏆" * 20)

    # =====================================================================
    # 4. GUARDADO DE SEGURIDAD AUTOMÁTICO
    # =====================================================================
    with open(ruta_archivo_mlp, 'wb') as f:
        pickle.dump(study_mlp, f)
    print(f"\n✅ Nuevo estudio MLP guardado con éxito en: {ruta_archivo_mlp}")
    
    return study_mlp

if __name__ == "__main__":
    
    pass