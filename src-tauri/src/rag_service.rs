//! RAG Service — Retrieval-Augmented Generation pipeline
//!
//! Pipeline: embed query → find top-K similar from DB → build
//! augmented prompt → call LLM with streaming → return answer.
//!
//! This is the "LangChain in Rust" — a simple, typed chain that
//! does exactly what the app needs without runtime overhead.

use crate::db_service::{DBService, SimilarResult};
use crate::embedding_service::EmbeddingService;
use crate::llm_service::{ChatMessage, GenerationConfig, LLMService};
use anyhow::Result;
use serde::{Deserialize, Serialize};

// =============================================================================
// TYPES
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RAGContext {
    pub retrieved: Vec<SimilarResult>,
    pub augmented_prompt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RAGConfig {
    pub top_k: usize,
    pub min_similarity: f32,
    pub include_sources: Vec<String>, // "message", "journal", "assessment"
    pub context_window: usize,        // max chars of context to inject
}

impl Default for RAGConfig {
    fn default() -> Self {
        Self {
            top_k: 3,              // 3 is enough — quality beats quantity
            min_similarity: 0.6,   // raised from 0.3 — only genuinely related hits
            include_sources: vec!["message".into(), "journal".into(), "summary".into()],
            context_window: 600,   // ~150 tokens budget for small LLMs (was 2000)
        }
    }
}

// =============================================================================
// RAG SERVICE
// =============================================================================

pub struct RAGService;

impl RAGService {
    /// Full RAG pipeline: retrieve context, augment prompt, and generate
    pub fn generate_with_context<F>(
        llm: &LLMService,
        embedder: &EmbeddingService,
        db: &DBService,
        messages: &[ChatMessage],
        config: &GenerationConfig,
        rag_config: &RAGConfig,
        on_token: F,
    ) -> Result<(String, RAGContext)>
    where
        F: FnMut(&str),
    {
        // 1. Get the latest user message for retrieval
        let query = messages
            .iter()
            .rev()
            .find(|m| m.role == "user")
            .map(|m| m.content.clone())
            .unwrap_or_default();

        // 2. Embed the query
        let query_embedding = embedder.embed_one(&query)?;

        // 3. Retrieve similar content from DB
        let mut all_results: Vec<SimilarResult> = Vec::new();

        for source_type in &rag_config.include_sources {
            let results = db.search_similar(
                &query_embedding,
                Some(source_type),
                rag_config.top_k,
                rag_config.min_similarity,
            )?;
            all_results.extend(results);
        }

        // Sort all results by score and take top-K
        all_results.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        all_results.truncate(rag_config.top_k);

        // 4. Build augmented messages
        let augmented_messages = Self::augment_messages(messages, &all_results, rag_config);

        let augmented_prompt = augmented_messages
            .iter()
            .map(|m| format!("[{}]: {}", m.role, m.content))
            .collect::<Vec<_>>()
            .join("\n");

        let context = RAGContext {
            retrieved: all_results,
            augmented_prompt: augmented_prompt.clone(),
        };

        // 5. Generate with augmented context
        let response = llm.generate(&augmented_messages, config, on_token)?;

        Ok((response, context))
    }

    /// Augment messages with retrieved context, deduplicating against recent window
    fn augment_messages(
        messages: &[ChatMessage],
        retrieved: &[SimilarResult],
        rag_config: &RAGConfig,
    ) -> Vec<ChatMessage> {
        if retrieved.is_empty() {
            return messages.to_vec();
        }

        // Collect recent conversation content for deduplication (last 8 turns)
        let recent_snippets: Vec<String> = messages
            .iter()
            .filter(|m| m.role != "system")
            .rev()
            .take(8)
            .map(|m| m.content[..m.content.len().min(60)].to_lowercase())
            .collect();

        // Build context string — deduplicate against recent window
        let mut context_parts: Vec<String> = Vec::new();
        let mut total_chars = 0;

        for result in retrieved {
            if total_chars + result.content.len() > rag_config.context_window {
                break;
            }
            // Skip items whose content is essentially already in the recent window
            let result_key = result.content[..result.content.len().min(60)].to_lowercase();
            if recent_snippets.iter().any(|r| r.contains(&result_key) || result_key.contains(r.as_str())) {
                continue;
            }
            let label = match result.source_type.as_str() {
                "journal" => "From journal",
                "message" => "From past conversation",
                "assessment" => "From assessment",
                _ => "Context",
            };
            context_parts.push(format!(
                "{} ({:.0}%): {}",
                label,
                result.score * 100.0,
                result.content
            ));
            total_chars += result.content.len();
        }

        if context_parts.is_empty() {
            return messages.to_vec();
        }

        let context_block = context_parts.join("\n");

        // Insert context as a system message just before the conversation
        let mut augmented = Vec::new();

        // Keep the original system message
        if let Some(sys) = messages.iter().find(|m| m.role == "system") {
            augmented.push(sys.clone());
        }

        // Add RAG context as a second system message
        augmented.push(ChatMessage {
            role: "system".into(),
            content: format!(
                "Relevant history (use only when directly applicable, do not mention retrieval):\n\n{}",
                context_block
            ),
        });

        // Add the rest of the conversation (skip original system messages)
        for msg in messages {
            if msg.role != "system" {
                augmented.push(msg.clone());
            }
        }

        augmented
    }

    /// Store a message and its embedding for future retrieval
    pub fn index_message(
        embedder: &EmbeddingService,
        db: &DBService,
        message_id: &str,
        session_id: &str,
        role: &str,
        content: &str,
        intent: Option<&str>,
    ) -> Result<()> {
        // Store the message with intent tag
        db.store_message(message_id, session_id, role, content, intent)?;

        // Generate and store embedding
        let embedding = embedder.embed_one(content)?;
        let embedding_id = format!("emb_{}", message_id);
        db.store_embedding(&embedding_id, message_id, "message", content, &embedding)?;

        Ok(())
    }

    /// Store a journal entry and its embedding for future retrieval
    pub fn index_journal(
        embedder: &EmbeddingService,
        db: &DBService,
        journal_id: &str,
        title: &str,
        content: &str,
        mood: Option<&str>,
        tags: Option<&str>,
    ) -> Result<()> {
        db.store_journal(journal_id, title, content, mood, tags)?;

        // Embed the combined title + content for better retrieval
        let text = format!("{}: {}", title, content);
        let embedding = embedder.embed_one(&text)?;
        let embedding_id = format!("emb_{}", journal_id);
        db.store_embedding(&embedding_id, journal_id, "journal", &text, &embedding)?;

        Ok(())
    }

    /// Store a rolling conversation summary for future retrieval.
    /// This allows the RAG system to retrieve relevant summaries from past sessions.
    pub fn index_summary(
        embedder: &EmbeddingService,
        db: &DBService,
        session_id: &str,
        summary_text: &str,
        key_topics: Option<&str>,
    ) -> Result<()> {
        // Combine summary with topics for richer embedding
        let text = match key_topics {
            Some(topics) if !topics.is_empty() => format!("{} Topics: {}", summary_text, topics),
            _ => summary_text.to_string(),
        };

        let embedding = embedder.embed_one(&text)?;
        let summary_id = format!("summary_{}", session_id);
        let embedding_id = format!("emb_summary_{}", session_id);

        // Store with source_type = "summary" so it can be filtered/boosted in retrieval
        db.store_embedding(&embedding_id, &summary_id, "summary", &text, &embedding)?;

        Ok(())
    }
}
