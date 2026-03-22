//! Embedding Service — fastembed sentence embeddings
//!
//! Generates 384-dim vectors from text for semantic search.
//! Uses all-MiniLM-L6-v2 (22MB) which runs entirely offline.
//! Includes LRU query cache to avoid redundant embeddings.

use anyhow::{Context, Result};
use fastembed::{EmbeddingModel, InitOptions, TextEmbedding};
use parking_lot::Mutex;
use std::collections::VecDeque;
use std::path::{Path, PathBuf};

// =============================================================================
// QUERY CACHE (LRU)
// =============================================================================

const QUERY_CACHE_SIZE: usize = 32;

#[derive(Clone)]
struct CacheEntry {
    text_hash: u64,
    embedding: Vec<f32>,
}

/// Simple FNV-1a hash for cache keys
fn hash_text(text: &str) -> u64 {
    const FNV_OFFSET: u64 = 0xcbf29ce484222325;
    const FNV_PRIME: u64 = 0x100000001b3;
    let mut hash = FNV_OFFSET;
    for byte in text.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    hash
}

// =============================================================================
// EMBEDDING SERVICE
// =============================================================================

pub struct EmbeddingService {
    model: Mutex<Option<TextEmbedding>>,
    cache_dir: PathBuf,
    /// LRU cache for recent query embeddings
    query_cache: Mutex<VecDeque<CacheEntry>>,
}

impl EmbeddingService {
    pub fn new(data_dir: &Path) -> Result<Self> {
        let cache_dir = data_dir.join("embeddings_cache");
        std::fs::create_dir_all(&cache_dir)
            .context("Failed to create embeddings cache directory")?;

        Ok(Self {
            model: Mutex::new(None),
            cache_dir,
            query_cache: Mutex::new(VecDeque::with_capacity(QUERY_CACHE_SIZE)),
        })
    }

    /// Initialize the embedding model (downloads to cache on first run)
    pub fn init(&self) -> Result<()> {
        let mut model_guard = self.model.lock();
        if model_guard.is_some() {
            return Ok(());
        }

        log::info!("Initializing embedding model (all-MiniLM-L6-v2)...");

        let options = InitOptions::new(EmbeddingModel::AllMiniLML6V2)
            .with_cache_dir(self.cache_dir.clone())
            .with_show_download_progress(true);

        let model = TextEmbedding::try_new(options)
            .context("Failed to initialize embedding model")?;

        *model_guard = Some(model);
        log::info!("✅ Embedding model ready");
        Ok(())
    }

    /// Check if the model is loaded
    pub fn is_ready(&self) -> bool {
        self.model.lock().is_some()
    }

    /// Generate embeddings for one or more texts
    pub fn embed(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>> {
        let mut model_guard = self.model.lock();
        let model = model_guard
            .as_mut()
            .ok_or_else(|| anyhow::anyhow!("Embedding model not initialized"))?;

        let documents: Vec<String> = texts.iter().map(|s| s.to_string()).collect();
        let embeddings = model
            .embed(documents, None)
            .context("Embedding generation failed")?;
        let embeddings: Vec<Vec<f32>> = embeddings.into_iter().map(|e| e.into_iter().collect()).collect();

        Ok(embeddings)
    }

    /// Generate embedding for a single text (with LRU cache)
    pub fn embed_one(&self, text: &str) -> Result<Vec<f32>> {
        let text_hash = hash_text(text);

        // Check cache first
        {
            let cache = self.query_cache.lock();
            if let Some(entry) = cache.iter().find(|e| e.text_hash == text_hash) {
                return Ok(entry.embedding.clone());
            }
        }

        // Cache miss — compute embedding
        let results = self.embed(&[text])?;
        let embedding = results
            .into_iter()
            .next()
            .ok_or_else(|| anyhow::anyhow!("No embedding returned"))?;

        // Insert into cache (LRU eviction)
        {
            let mut cache = self.query_cache.lock();
            if cache.len() >= QUERY_CACHE_SIZE {
                cache.pop_front();
            }
            cache.push_back(CacheEntry {
                text_hash,
                embedding: embedding.clone(),
            });
        }

        Ok(embedding)
    }

    /// Cosine similarity between two vectors
    pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
        if a.len() != b.len() || a.is_empty() {
            return 0.0;
        }
        let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
        let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
        let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
        if norm_a == 0.0 || norm_b == 0.0 {
            return 0.0;
        }
        dot / (norm_a * norm_b)
    }

    /// Embedding dimension (384 for all-MiniLM-L6-v2)
    pub fn dimension(&self) -> usize {
        384
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_similarity() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![1.0, 0.0, 0.0];
        assert!((EmbeddingService::cosine_similarity(&a, &b) - 1.0).abs() < 1e-6);

        let c = vec![0.0, 1.0, 0.0];
        assert!(EmbeddingService::cosine_similarity(&a, &c).abs() < 1e-6);
    }
}
