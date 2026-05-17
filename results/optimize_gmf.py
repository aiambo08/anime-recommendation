import os
import pickle
import torch
import torch.nn as nn
import optuna
from torch.utils.data import DataLoader, TensorDataset
from sklearn.metrics import mean_absolute_error

def check_or_run_optuna_gmf(df_train, df_test, X_test, y_test, dataset, NUM_USERS, NUM_ITEMS, device):
    """
    Revisa si el estudio de Optuna para GMF ya existe en la carpeta de resultados.
    Si existe, lo carga. Si no, lanza la optimización bayesiana de 7 intentos.
    """
    # Como el script se guardará dentro de 'results', gestionamos el pkl en su misma ubicación
    ruta_script_dir = os.path.dirname(os.path.abspath(__file__))
    ruta_archivo_gmf = os.path.join(ruta_script_dir, 'optuna_study_gmf.pkl')

    # 1. COMPROBACIÓN DE EXISTENCIA
    if os.path.exists(ruta_archivo_gmf):
        print(f"📦 Detectado estudio previo. Cargando resultados desde: {ruta_archivo_gmf}")
        with open(ruta_archivo_gmf, 'rb') as f:
            study_gmf = pickle.load(f)
        print(f"   [Cargado] Mejor MAE previo: {study_gmf.best_value:.4f} | Parámetros: {study_gmf.best_params}")
        return study_gmf

    print("🔍 No se encontró ningún estudio previo. Preparando optimización bayesiana para GMF...")

    # =====================================================================
    # 2. DEFINICIÓN DE LA FUNCIÓN OBJETIVO DEL GMF
    # =====================================================================
    # Importamos dinámicamente la clase para evitar colisiones de contexto
    from gmf import GMFModel 

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
        
        epochs_prueba = 5
        
        for epoch in range(epochs_prueba):
            modelo_gmf.train()
            for batch_u, batch_i, batch_r in loader_gmf_opt:
                batch_u = batch_u.to(device, non_blocking=True)
                batch_i = batch_i.to(device, non_blocking=True)
                batch_r = batch_r.to(device, non_blocking=True)
                
                optimizer.zero_grad()
                outputs = modelo_gmf(batch_u, batch_i)
                loss = loss_fn(outputs, batch_r)
                loss.backward()
                optimizer.step()
                
            modelo_gmf.eval()
            with torch.no_grad():
                users_test = torch.tensor(X_test['user_id'].values, dtype=torch.long).to(device)
                items_test = torch.tensor(X_test['anime_id'].values, dtype=torch.long).to(device)
                preds_test = modelo_gmf(users_test, items_test).cpu().numpy()
                
            epoch_test_mae = mean_absolute_error(y_test, preds_test)
            
            trial.report(epoch_test_mae, epoch)
            if trial.should_prune():
                raise optuna.TrialPruned()
                
        return epoch_test_mae

    # =====================================================================
    # 3. LANZAMIENTO DEL ESTUDIO (7 Intentos)
    # =====================================================================
    study_gmf = optuna.create_study(direction='minimize')
    
    print("🚀 Iniciando optimización del GMF en la GPU (Aprox. 15-18 minutos)...")
    study_gmf.optimize(objective_gmf, n_trials=7)

    print("\n" + "🏆" * 20)
    print("¡BÚSQUEDA DEL GMF COMPLETADA POR OPTUNA!")
    print(f"Mejor MAE conseguido en GMF: {study_gmf.best_value:.4f}")
    print(f"Parámetros óptimos encontrados: {study_gmf.best_params}")
    print("🏆" * 20)

    # =====================================================================
    # 4. GUARDADO DE SEGURIDAD AUTOMÁTICO
    # =====================================================================
    with open(ruta_archivo_gmf, 'wb') as f:
        pickle.dump(study_gmf, f)
    print(f"\n✅ Nuevo estudio GMF guardado con éxito en: {ruta_archivo_gmf}")
    
    return study_gmf

if __name__ == "__main__":
    pass