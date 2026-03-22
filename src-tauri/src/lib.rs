mod commands;
mod db_service;
mod embedding_service;
mod llm_service;
mod rag_service;

use parking_lot::Mutex;
use std::sync::Arc;
use tauri::Manager;

/// Shared application state accessible from all Tauri commands
pub struct AppState {
    pub llm: Arc<Mutex<llm_service::LLMService>>,
    pub embedder: Arc<Mutex<embedding_service::EmbeddingService>>,
    pub db: Arc<Mutex<db_service::DBService>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging safely (won't panic if already initialized)
    env_logger::Builder::from_default_env()
        .filter_level(log::LevelFilter::Info)
        .try_init()
        .ok(); // Ignore if already initialized

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let _handle = app.handle().clone();

            // Resolve data directory: <app_data>/EchoLearn/
            let data_dir = dirs::data_local_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("."))
                .join("EchoLearn");
                
            if let Err(e) = std::fs::create_dir_all(&data_dir) {
                log::error!("Failed to create app data directory: {}", e);
                return Err(format!("Failed to create app data directory: {}", e).into());
            }

            log::info!("EchoLearn data directory: {}", data_dir.display());

            // Initialize services with proper error handling
            let llm = match llm_service::LLMService::new(&data_dir) {
                Ok(service) => service,
                Err(e) => {
                    log::error!("Failed to initialize LLM service: {}", e);
                    return Err(format!("Failed to initialize LLM service: {}", e).into());
                }
            };

            let embedder = match embedding_service::EmbeddingService::new(&data_dir) {
                Ok(service) => service,
                Err(e) => {
                    log::error!("Failed to initialize embedding service: {}", e);
                    return Err(format!("Failed to initialize embedding service: {}", e).into());
                }
            };

            let db = match db_service::DBService::new(&data_dir) {
                Ok(service) => service,
                Err(e) => {
                    log::error!("Failed to initialize DB service: {}", e);
                    return Err(format!("Failed to initialize DB service: {}", e).into());
                }
            };

            // Manage application state
            app.manage(AppState {
                llm: Arc::new(Mutex::new(llm)),
                embedder: Arc::new(Mutex::new(embedder)),
                db: Arc::new(Mutex::new(db)),
            });

            log::info!("EchoLearn initialization complete");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_status,
            commands::get_available_models,
            commands::get_cached_models,
            commands::load_model,
            commands::unload_model,
            commands::generate_response,
            commands::stop_generation,
            commands::generate_embedding,
            commands::search_similar,
            commands::store_message,
            commands::store_journal,
            commands::store_summary,
            commands::init_embeddings,
            commands::delete_model,
            commands::download_model,
            commands::downloadModel,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
