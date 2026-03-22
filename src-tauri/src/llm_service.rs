//! LLM Service — llama.cpp inference engine
//!
//! Loads GGUF models and provides streaming text generation.
//! Uses llama-cpp-2 Rust bindings for native performance.

use anyhow::{anyhow, Context, Result};
use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::{AddBos, LlamaChatMessage, LlamaChatTemplate, LlamaModel};
use llama_cpp_2::sampling::LlamaSampler;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

// =============================================================================
// TYPES
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
 pub struct LLMModel {
    pub id: String,
    pub name: String,
    pub size: String,
    pub size_gb: f64,
    pub description: String,
    pub parameters: String,
    pub filename: String,
    pub download_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationConfig {
    pub temperature: f32,
    pub max_tokens: u32,
    pub top_p: f32,
}

impl Default for GenerationConfig {
    fn default() -> Self {
        Self {
            temperature: 0.7,
            max_tokens: 512,
            top_p: 0.9,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

// =============================================================================
// LLM SERVICE
// =============================================================================

pub struct LLMService {
    backend: Arc<LlamaBackend>,
    model: Mutex<Option<Arc<LlamaModel>>>,
    active_model_id: Mutex<Option<String>>,
    models_dir: PathBuf,
    cancel_flag: Arc<AtomicBool>,
    available_models: Vec<LLMModel>,
}

const STOP_MARKERS: [&str; 8] = [
    "<|eot_id|>",
    "<|end_of_text|>",
    "<|start_header_id|>",
    "<|end_header_id|>",
    "<|im_end|>",
    "<end_of_turn>",
    "User:",
    "\nuser\n",
];

impl LLMService {
    pub fn new(data_dir: &Path) -> Result<Self> {
        let backend =
            LlamaBackend::init().map_err(|e| anyhow!("Failed to init llama backend: {e}"))?;

        let models_dir = data_dir.join("models");
        std::fs::create_dir_all(&models_dir)
            .context("Failed to create models directory")?;

        let available_models = vec![
            LLMModel {
                id: "llama-3.2-1b".into(),
                name: "Llama 3.2 1B".into(),
                size: "0.7GB".into(),
                size_gb: 0.7,
                description: "Fast and efficient, great for quick responses".into(),
                parameters: "1B".into(),
                filename: "Llama-3.2-1B-Instruct-Q4_K_M.gguf".into(),
                download_url: "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf".into(),
            },
            LLMModel {
                id: "qwen-2.5-0.5b".into(),
                name: "Qwen 2.5 0.5B".into(),
                size: "0.5GB".into(),
                size_gb: 0.5,
                description: "Ultra-lightweight multilingual SLM for low-memory devices".into(),
                parameters: "0.5B".into(),
                filename: "Qwen2.5-0.5B-Instruct-Q4_K_M.gguf".into(),
                download_url: "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf".into(),
            },
            LLMModel {
                id: "tinyllama-1.1b".into(),
                name: "TinyLlama 1.1B".into(),
                size: "0.7GB".into(),
                size_gb: 0.7,
                description: "Very small chat model for fast local responses".into(),
                parameters: "1.1B".into(),
                filename: "TinyLlama-1.1B-Chat-v1.0-Q4_K_M.gguf".into(),
                download_url: "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf".into(),
            },
            LLMModel {
                id: "llama-3.2-3b".into(),
                name: "Llama 3.2 3B".into(),
                size: "1.8GB".into(),
                size_gb: 1.8,
                description: "Best quality-to-size ratio for therapy conversations".into(),
                parameters: "3B".into(),
                filename: "Llama-3.2-3B-Instruct-Q4_K_M.gguf".into(),
                download_url: "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf".into(),
            },
            LLMModel {
                id: "phi-3.5-mini".into(),
                name: "Phi 3.5 Mini".into(),
                size: "2.2GB".into(),
                size_gb: 2.2,
                description: "Microsoft's efficient reasoning model".into(),
                parameters: "3.8B".into(),
                filename: "Phi-3.5-mini-instruct-Q4_K_M.gguf".into(),
                download_url: "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf".into(),
            },
            LLMModel {
                id: "smollm2-1.7b".into(),
                name: "SmolLM2 1.7B".into(),
                size: "1.1GB".into(),
                size_gb: 1.1,
                description: "Small instruct model tuned for quick, low-latency chat".into(),
                parameters: "1.7B".into(),
                filename: "SmolLM2-1.7B-Instruct-Q4_K_M.gguf".into(),
                download_url: "https://huggingface.co/bartowski/SmolLM2-1.7B-Instruct-GGUF/resolve/main/SmolLM2-1.7B-Instruct-Q4_K_M.gguf".into(),
            },
            LLMModel {
                id: "qwen-2.5-1.5b".into(),
                name: "Qwen 2.5 1.5B".into(),
                size: "1.0GB".into(),
                size_gb: 1.0,
                description: "Lightweight multilingual model".into(),
                parameters: "1.5B".into(),
                filename: "Qwen2.5-1.5B-Instruct-Q4_K_M.gguf".into(),
                download_url: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf".into(),
            },
            LLMModel {
                id: "gemma-2-2b".into(),
                name: "Gemma 2 2B".into(),
                size: "1.5GB".into(),
                size_gb: 1.5,
                description: "Compact Gemma variant with good reasoning for its size".into(),
                parameters: "2B".into(),
                filename: "gemma-2-2b-it-Q4_K_M.gguf".into(),
                download_url: "https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf".into(),
            },
        ];

        Ok(Self {
            backend: Arc::new(backend),
            model: Mutex::new(None),
            active_model_id: Mutex::new(None),
            models_dir,
            cancel_flag: Arc::new(AtomicBool::new(false)),
            available_models,
        })
    }

    /// Get the directory where GGUF models should be placed
    pub fn models_dir(&self) -> &Path {
        &self.models_dir
    }

    /// List available models
    pub fn available_models(&self) -> &[LLMModel] {
        &self.available_models
    }

    /// List models that have their GGUF file present
    pub fn cached_models(&self) -> Vec<String> {
        self.available_models
            .iter()
            .filter(|m| self.models_dir.join(&m.filename).exists())
            .map(|m| m.id.clone())
            .collect()
    }

    /// Get currently loaded model ID
    pub fn active_model(&self) -> Option<String> {
        self.active_model_id.lock().clone()
    }

    /// Check if a model is loaded and ready
    pub fn is_loaded(&self) -> bool {
        self.model.lock().is_some()
    }

    /// Load a GGUF model into memory
    pub fn load_model(&self, model_id: &str) -> Result<()> {
        let model_info = self
            .available_models
            .iter()
            .find(|m| m.id == model_id)
            .ok_or_else(|| anyhow!("Unknown model: {model_id}"))?;

        let model_path = self.models_dir.join(&model_info.filename);
        if !model_path.exists() {
            return Err(anyhow!(
                "Model file not found: {}. Place the GGUF file in: {}",
                model_info.filename,
                self.models_dir.display()
            ));
        }

        log::info!("Loading model: {} from {}", model_id, model_path.display());

        let params = LlamaModelParams::default();
        let model = LlamaModel::load_from_file(&self.backend, &model_path, &params)
            .map_err(|e| anyhow!("Failed to load model: {e}"))?;

        *self.model.lock() = Some(Arc::new(model));
        *self.active_model_id.lock() = Some(model_id.to_string());

        log::info!("✅ Model loaded: {}", model_id);
        Ok(())
    }

    /// Cancel ongoing generation
    pub fn cancel_generation(&self) {
        self.cancel_flag.store(true, Ordering::SeqCst);
    }

    fn fallback_chat_template(model_id: &str) -> Result<LlamaChatTemplate> {
        let template_name = if model_id.contains("qwen") || model_id.contains("smollm") {
            "chatml"
        } else if model_id.contains("llama") {
            "llama3"
        } else if model_id.contains("gemma") {
            "gemma"
        } else if model_id.contains("phi") {
            "chatml"
        } else if model_id.contains("tinyllama") {
            "chatml"
        } else {
            "chatml"
        };

        LlamaChatTemplate::new(template_name)
            .map_err(|e| anyhow!("Failed to create fallback template {template_name}: {e}"))
    }

    /// Format messages using the GGUF chat template when available.
    fn format_prompt(
        &self,
        model: &LlamaModel,
        model_id: &str,
        messages: &[ChatMessage],
    ) -> Result<String> {
        let chat_messages = messages
            .iter()
            .map(|msg| LlamaChatMessage::new(msg.role.clone(), msg.content.clone()))
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| anyhow!("Invalid chat message content: {e}"))?;

        let template = match model.chat_template(None) {
            Ok(template) => template,
            Err(_) => Self::fallback_chat_template(model_id)?,
        };

        model
            .apply_chat_template(&template, &chat_messages, true)
            .map_err(|e| anyhow!("Failed to apply chat template: {e}"))
    }

    fn trim_stop_marker(text: &str) -> String {
        let mut trimmed = text.to_string();
        for marker in STOP_MARKERS {
            if let Some(idx) = trimmed.find(marker) {
                trimmed.truncate(idx);
            }
        }
        trimmed.trim_end().to_string()
    }

    fn should_stop(output: &str) -> bool {
        STOP_MARKERS.iter().any(|marker| output.contains(marker))
    }

    /// Generate a response, returning tokens via a callback
    pub fn generate<F>(
        &self,
        messages: &[ChatMessage],
        config: &GenerationConfig,
        mut on_token: F,
    ) -> Result<String>
    where
        F: FnMut(&str),
    {
        let model_guard = self.model.lock();
        let model = model_guard
            .as_ref()
            .ok_or_else(|| anyhow!("No model loaded"))?;
        let active_model_id = self
            .active_model_id
            .lock()
            .clone()
            .ok_or_else(|| anyhow!("No active model id"))?;

        self.cancel_flag.store(false, Ordering::SeqCst);

        // Create context
        let ctx_params = LlamaContextParams::default()
            .with_n_ctx(std::num::NonZeroU32::new(4096));
        let mut ctx = model
            .new_context(&self.backend, ctx_params)
            .map_err(|e| anyhow!("Failed to create context: {e}"))?;

        // Tokenize the prompt
        let prompt = self.format_prompt(model, &active_model_id, messages)?;
        let tokens = model
            .str_to_token(&prompt, AddBos::Never)
            .map_err(|e| anyhow!("Tokenization failed: {e}"))?;

        // Create batch and feed prompt tokens
        let mut batch = LlamaBatch::new(4096, 1);

        for (i, &token) in tokens.iter().enumerate() {
            let is_last = i == tokens.len() - 1;
            batch
                .add(token, i as i32, &[0], is_last)
                .map_err(|_| anyhow!("Failed to add token to batch"))?;
        }

        // Decode prompt
        ctx.decode(&mut batch)
            .map_err(|e| anyhow!("Prompt decode failed: {e}"))?;

        // Set up sampler
        let mut sampler = LlamaSampler::chain_simple([
            LlamaSampler::penalties(128, 1.15, 0.1, 0.1),
            LlamaSampler::top_k(40),
            LlamaSampler::top_p(config.top_p, 1),
            LlamaSampler::min_p(0.05, 1),
            LlamaSampler::temp(config.temperature),
            LlamaSampler::dist(42),
        ]);

        // Generate tokens
        let mut output = String::new();
        let mut n_decoded = tokens.len() as i32;
        let mut decoder = encoding_rs::UTF_8.new_decoder();

        for _ in 0..config.max_tokens {
            if self.cancel_flag.load(Ordering::SeqCst) {
                break;
            }

            // Sample next token
            let new_token = sampler.sample(&ctx, batch.n_tokens() - 1);

            // Check for end of generation
            if model.is_eog_token(new_token) {
                break;
            }

            // Convert to text
            let token_str = model
                .token_to_piece(new_token, &mut decoder, true, None)
                .unwrap_or_default();

            output.push_str(&token_str);
            if Self::should_stop(&output) {
                output = Self::trim_stop_marker(&output);
                break;
            }

            on_token(&token_str);

            // Prepare next batch
            batch.clear();
            batch
                .add(new_token, n_decoded, &[0], true)
                .map_err(|_| anyhow!("Failed to add generated token"))?;
            n_decoded += 1;

            ctx.decode(&mut batch)
                .map_err(|e| anyhow!("Decode failed: {e}"))?;
        }

        Ok(Self::trim_stop_marker(&output))
    }

    /// Unload the current model
    pub fn unload(&self) {
        *self.model.lock() = None;
        *self.active_model_id.lock() = None;
        log::info!("Model unloaded");
    }

    /// Delete a model file from disk
    pub fn delete_model(&self, model_id: &str) -> anyhow::Result<bool> {
        let model = self
            .available_models
            .iter()
            .find(|m| m.id == model_id)
            .ok_or_else(|| anyhow::anyhow!("Unknown model: {}", model_id))?;
        let path = self.models_dir.join(&model.filename);
        if path.exists() {
            std::fs::remove_file(&path)?;
            log::info!("Deleted model file: {}", path.display());
            Ok(true)
        } else {
            Ok(false)
        }
    }
}
