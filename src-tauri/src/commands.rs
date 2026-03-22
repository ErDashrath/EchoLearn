//! Tauri Commands — IPC bridge between frontend and Rust services
//!
//! Each function tagged with #[tauri::command] becomes callable
//! from the frontend via `invoke("command_name", { args })`.

use crate::db_service::SimilarResult;
use crate::llm_service::{ChatMessage, GenerationConfig, LLMModel};
use crate::rag_service::RAGConfig;
use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use std::sync::Arc;

// =============================================================================
// STATUS
// =============================================================================

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendStatus {
    pub llm_loaded: bool,
    pub active_model: Option<String>,
    pub embeddings_ready: bool,
    pub cached_models: Vec<String>,
    pub models_dir: String,
}

#[tauri::command]
pub fn get_status(state: State<AppState>) -> Result<BackendStatus, String> {
    let llm = state.llm.lock();
    let embedder = state.embedder.lock();

    Ok(BackendStatus {
        llm_loaded: llm.is_loaded(),
        active_model: llm.active_model(),
        embeddings_ready: embedder.is_ready(),
        cached_models: llm.cached_models(),
        models_dir: llm.models_dir().to_string_lossy().to_string(),
    })
}

// =============================================================================
// MODEL MANAGEMENT
// =============================================================================

#[tauri::command]
pub fn get_available_models(state: State<AppState>) -> Result<Vec<LLMModel>, String> {
    let llm = state.llm.lock();
    Ok(llm.available_models().to_vec())
}

#[tauri::command]
pub fn get_cached_models(state: State<AppState>) -> Result<Vec<String>, String> {
    let llm = state.llm.lock();
    Ok(llm.cached_models())
}

#[tauri::command]
pub fn load_model(state: State<AppState>, model_id: String) -> Result<(), String> {
    let llm = state.llm.lock();
    llm.load_model(&model_id).map_err(|e| e.to_string())?;

    // Also init embeddings if not ready
    let embedder = state.embedder.lock();
    if !embedder.is_ready() {
        let _ = embedder.init(); // Non-fatal if this fails
    }

    Ok(())
}

#[tauri::command]
pub fn unload_model(state: State<AppState>) -> Result<(), String> {
    let llm = state.llm.lock();
    llm.unload();
    Ok(())
}

// =============================================================================
// MODEL DOWNLOAD
// =============================================================================

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub model_id: String,
    pub progress: f64,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub speed_mbps: f64,
}

#[tauri::command]
pub async fn download_model(
    app: AppHandle,
    state: State<'_, AppState>,
    model_id: String,
) -> Result<(), String> {
    use futures_util::StreamExt;
    use std::io::Write;
    use std::time::Instant;

    let (download_url, model_path) = {
        let llm = state.llm.lock();
        let model_info = llm
            .available_models()
            .iter()
            .find(|m| m.id == model_id)
            .ok_or_else(|| format!("Unknown model: {model_id}"))?;

        let path = llm.models_dir().join(&model_info.filename);
        if path.exists() {
            // Already downloaded — emit 100% and return
            let _ = app.emit("model_download_progress", DownloadProgress {
                model_id: model_id.clone(),
                progress: 1.0,
                downloaded_bytes: 0,
                total_bytes: 0,
                speed_mbps: 0.0,
            });
            return Ok(());
        }
        (model_info.download_url.clone(), path)
    };

    let model_id = Arc::new(model_id);

    let client = reqwest::Client::builder()
        .user_agent("EchoLearn/1.0")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let response = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to download server: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download failed with HTTP {}: {}",
            response.status(),
            download_url
        ));
    }

    let total_bytes = response.content_length().unwrap_or(0);
    let mut downloaded_bytes: u64 = 0;
    let mut stream = response.bytes_stream();

    // Write to a temp file, rename on completion for atomicity
    let temp_path = model_path.with_extension("gguf.tmp");
    let mut file = std::fs::File::create(&temp_path)
        .map_err(|e| format!("Failed to create temp file: {e}"))?;

    let start_time = Instant::now();
    let mut last_emit_bytes: u64 = 0;
    const EMIT_INTERVAL_BYTES: u64 = 512 * 1024; // emit every 512KB

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download interrupted: {e}"))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Write error: {e}"))?;
        downloaded_bytes += chunk.len() as u64;

        // Throttle events to avoid flooding the frontend
        if downloaded_bytes - last_emit_bytes >= EMIT_INTERVAL_BYTES || downloaded_bytes == total_bytes {
            last_emit_bytes = downloaded_bytes;
            let elapsed = start_time.elapsed().as_secs_f64();
            let speed_mbps = if elapsed > 0.0 {
                (downloaded_bytes as f64 / elapsed) / (1024.0 * 1024.0)
            } else {
                0.0
            };
            let progress = if total_bytes > 0 {
                downloaded_bytes as f64 / total_bytes as f64
            } else {
                0.0
            };

            let _ = app.emit("model_download_progress", DownloadProgress {
                model_id: (*model_id).clone(),
                progress,
                downloaded_bytes,
                total_bytes,
                speed_mbps,
            });
        }
    }

    // Atomically rename temp → final
    if temp_path.exists() {
        std::fs::rename(&temp_path, &model_path)
            .map_err(|e| format!("Failed to finalize download: {e}"))?;
    }

    Ok(())
}

// Compatibility alias for older frontend command naming.
#[allow(non_snake_case)]
#[tauri::command]
pub async fn downloadModel(
    app: AppHandle,
    state: State<'_, AppState>,
    model_id: String,
) -> Result<(), String> {
    download_model(app, state, model_id).await
}

// =============================================================================
// GENERATION
// =============================================================================

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateRequest {
    pub messages: Vec<ChatMessage>,
    pub config: Option<GenerationConfig>,
    pub session_id: Option<String>,
    pub use_rag: Option<bool>,
    pub rag_config: Option<RAGConfig>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateResult {
    pub text: String,
    pub rag_sources: Vec<SimilarResult>,
}

#[tauri::command]
pub async fn generate_response(
    app: AppHandle,
    state: State<'_, AppState>,
    request: GenerateRequest,
) -> Result<GenerateResult, String> {
    let config = request.config.unwrap_or_default();
    let use_rag = request.use_rag.unwrap_or(false);

    // Clone what we need before moving into the blocking thread
    let llm = state.llm.clone();
    let embedder = state.embedder.clone();
    let db = state.db.clone();
    let messages = request.messages.clone();
    let session_id = request.session_id.clone();
    let rag_config = request.rag_config.unwrap_or_default();

    let result = tokio::task::spawn_blocking(move || {
        let llm = llm.lock();
        let embedder = embedder.lock();
        let db = db.lock();

        let (text, rag_sources) = if use_rag && embedder.is_ready() {
            let (text, context) = crate::rag_service::RAGService::generate_with_context(
                &llm,
                &embedder,
                &db,
                &messages,
                &config,
                &rag_config,
                |token| {
                    let _ = app.emit("llm_token", token);
                },
            )
            .map_err(|e| e.to_string())?;
            (text, context.retrieved)
        } else {
            let text = llm
                .generate(&messages, &config, |token| {
                    let _ = app.emit("llm_token", token);
                })
                .map_err(|e| e.to_string())?;
            (text, vec![])
        };

        // Signal end of stream
        let _ = app.emit("llm_done", &text);

        // Index the conversation for future RAG
        if let Some(sid) = &session_id {
            if embedder.is_ready() {
                // Index user message (intent unknown at generate_response level — use None)
                if let Some(user_msg) = messages.iter().rev().find(|m| m.role == "user") {
                    let msg_id = uuid::Uuid::new_v4().to_string();
                    let _ = crate::rag_service::RAGService::index_message(
                        &embedder,
                        &db,
                        &msg_id,
                        sid,
                        "user",
                        &user_msg.content,
                        None,
                    );
                }
                // Index assistant response
                let resp_id = uuid::Uuid::new_v4().to_string();
                let _ = crate::rag_service::RAGService::index_message(
                    &embedder, &db, &resp_id, sid, "assistant", &text, None,
                );
            }
        }

        Ok::<GenerateResult, String>(GenerateResult { text, rag_sources })
    })
    .await
    .map_err(|e| format!("Task failed: {e}"))?;

    result
}

#[tauri::command]
pub fn stop_generation(state: State<AppState>) -> Result<(), String> {
    let llm = state.llm.lock();
    llm.cancel_generation();
    Ok(())
}

// =============================================================================
// EMBEDDINGS & SEARCH
// =============================================================================

#[tauri::command]
pub fn generate_embedding(
    state: State<AppState>,
    text: String,
) -> Result<Vec<f32>, String> {
    let embedder = state.embedder.lock();
    embedder.embed_one(&text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_similar(
    state: State<AppState>,
    query: String,
    source_type: Option<String>,
    top_k: Option<usize>,
    min_score: Option<f32>,
) -> Result<Vec<SimilarResult>, String> {
    let embedder = state.embedder.lock();
    let db = state.db.lock();

    let query_embedding = embedder.embed_one(&query).map_err(|e| e.to_string())?;
    db.search_similar(
        &query_embedding,
        source_type.as_deref(),
        top_k.unwrap_or(5),
        min_score.unwrap_or(0.3),
    )
    .map_err(|e| e.to_string())
}

// =============================================================================
// STORAGE
// =============================================================================

#[tauri::command]
pub fn store_message(
    state: State<AppState>,
    id: String,
    session_id: String,
    role: String,
    content: String,
    intent: Option<String>,
) -> Result<(), String> {
    let embedder = state.embedder.lock();
    let db = state.db.lock();

    // Store and index in one step
    if embedder.is_ready() {
        crate::rag_service::RAGService::index_message(
            &embedder,
            &db,
            &id,
            &session_id,
            &role,
            &content,
            intent.as_deref(),
        )
        .map_err(|e| e.to_string())
    } else {
        db.store_message(&id, &session_id, &role, &content, intent.as_deref())
            .map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn store_journal(
    state: State<AppState>,
    id: String,
    title: String,
    content: String,
    mood: Option<String>,
    tags: Option<String>,
) -> Result<(), String> {
    let embedder = state.embedder.lock();
    let db = state.db.lock();

    if embedder.is_ready() {
        crate::rag_service::RAGService::index_journal(
            &embedder,
            &db,
            &id,
            &title,
            &content,
            mood.as_deref(),
            tags.as_deref(),
        )
        .map_err(|e| e.to_string())
    } else {
        db.store_journal(&id, &title, &content, mood.as_deref(), tags.as_deref())
            .map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn init_embeddings(state: State<AppState>) -> Result<(), String> {
    let embedder = state.embedder.lock();
    embedder.init().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_model(state: State<AppState>, model_id: String) -> Result<bool, String> {
    let llm = state.llm.lock();

    // Unload if this is the active model
    if llm.active_model().as_deref() == Some(model_id.as_str()) {
        llm.unload();
    }

    llm.delete_model(&model_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn store_summary(
    state: State<AppState>,
    session_id: String,
    summary: String,
    key_topics: Option<String>,
) -> Result<(), String> {
    let embedder = state.embedder.lock();
    let db = state.db.lock();

    if embedder.is_ready() {
        crate::rag_service::RAGService::index_summary(
            &embedder,
            &db,
            &session_id,
            &summary,
            key_topics.as_deref(),
        )
        .map_err(|e| e.to_string())
    } else {
        // If embeddings not ready, just skip indexing (not critical)
        Ok(())
    }
}
