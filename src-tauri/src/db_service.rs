//! DB Service — SQLite storage with vector search
//!
//! Stores chat messages, journal entries, and their embeddings.
//! Implements brute-force cosine similarity for vector retrieval.
//! (For <100K vectors, this is faster than loading a separate vector DB.)

use anyhow::{Context, Result};
use parking_lot::Mutex;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

// =============================================================================
// TYPES
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredMessage {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredEmbedding {
    pub id: String,
    pub source_id: String,
    pub source_type: String, // "message" | "journal" | "assessment"
    pub content: String,
    pub embedding: Vec<f32>,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimilarResult {
    pub id: String,
    pub source_type: String,
    pub content: String,
    pub score: f32,
}

// =============================================================================
// DB SERVICE
// =============================================================================

pub struct DBService {
    conn: Mutex<Connection>,
    db_path: PathBuf,
}

impl DBService {
    pub fn new(data_dir: &Path) -> Result<Self> {
        let db_path = data_dir.join("echolearn.db");
        std::fs::create_dir_all(data_dir)
            .context("Failed to create data directory")?;

        let conn = Connection::open(&db_path)
            .context("Failed to open SQLite database")?;

        let service = Self {
            conn: Mutex::new(conn),
            db_path,
        };
        service.initialize_tables()?;

        log::info!("✅ Database ready at: {}", service.db_path.display());
        Ok(service)
    }

    fn initialize_tables(&self) -> Result<()> {
        // Scope the lock so it's released before the migration step below
        {
            let conn = self.conn.lock();
            conn.execute_batch(
                "
                -- Chat messages
                CREATE TABLE IF NOT EXISTS messages (
                    id          TEXT PRIMARY KEY,
                    session_id  TEXT NOT NULL,
                    role        TEXT NOT NULL,
                    content     TEXT NOT NULL,
                    intent      TEXT,
                    timestamp   TEXT NOT NULL DEFAULT (datetime('now'))
                );
                CREATE INDEX IF NOT EXISTS idx_messages_session
                    ON messages(session_id);

                -- Journal entries
                CREATE TABLE IF NOT EXISTS journals (
                    id          TEXT PRIMARY KEY,
                    title       TEXT NOT NULL,
                    content     TEXT NOT NULL,
                    mood        TEXT,
                    tags        TEXT, -- JSON array
                    timestamp   TEXT NOT NULL DEFAULT (datetime('now'))
                );

                -- DASS-21 assessments
                CREATE TABLE IF NOT EXISTS assessments (
                    id          TEXT PRIMARY KEY,
                    type        TEXT NOT NULL,
                    scores      TEXT NOT NULL, -- JSON
                    timestamp   TEXT NOT NULL DEFAULT (datetime('now'))
                );

                -- Vector embeddings (source-agnostic)
                CREATE TABLE IF NOT EXISTS embeddings (
                    id          TEXT PRIMARY KEY,
                    source_id   TEXT NOT NULL,
                    source_type TEXT NOT NULL, -- 'message', 'journal', 'assessment'
                    content     TEXT NOT NULL,
                    embedding   BLOB NOT NULL,
                    timestamp   TEXT NOT NULL DEFAULT (datetime('now'))
                );
                CREATE INDEX IF NOT EXISTS idx_embeddings_source
                    ON embeddings(source_type);
                ",
            )
            .context("Failed to create database tables")?;
        } // conn guard dropped here — mutex released

        // Migration: add intent column to existing databases.
        // The error is intentionally ignored: it fires only when the column
        // already exists (upgraded DB), which is the expected case.
        let conn = self.conn.lock();
        let _ = conn.execute("ALTER TABLE messages ADD COLUMN intent TEXT", []);

        Ok(())
    }

    // =========================================================================
    // MESSAGES
    // =========================================================================

    pub fn store_message(
        &self,
        id: &str,
        session_id: &str,
        role: &str,
        content: &str,
        intent: Option<&str>,
    ) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT OR REPLACE INTO messages (id, session_id, role, content, intent) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, session_id, role, content, intent],
        )?;
        Ok(())
    }

    pub fn get_session_messages(&self, session_id: &str) -> Result<Vec<StoredMessage>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, session_id, role, content, timestamp FROM messages WHERE session_id = ?1 ORDER BY timestamp ASC",
        )?;

        let messages = stmt
            .query_map(params![session_id], |row| {
                Ok(StoredMessage {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    role: row.get(2)?,
                    content: row.get(3)?,
                    timestamp: row.get(4)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()
            .context("Failed to fetch messages")?;

        Ok(messages)
    }

    // =========================================================================
    // JOURNALS
    // =========================================================================

    pub fn store_journal(
        &self,
        id: &str,
        title: &str,
        content: &str,
        mood: Option<&str>,
        tags: Option<&str>,
    ) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT OR REPLACE INTO journals (id, title, content, mood, tags) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, title, content, mood, tags],
        )?;
        Ok(())
    }

    // =========================================================================
    // EMBEDDINGS
    // =========================================================================

    /// Store an embedding vector
    pub fn store_embedding(
        &self,
        id: &str,
        source_id: &str,
        source_type: &str,
        content: &str,
        embedding: &[f32],
    ) -> Result<()> {
        let blob = embedding_to_blob(embedding);
        let conn = self.conn.lock();
        conn.execute(
            "INSERT OR REPLACE INTO embeddings (id, source_id, source_type, content, embedding) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, source_id, source_type, content, blob],
        )?;
        Ok(())
    }

    /// Search for similar content using brute-force cosine similarity
    pub fn search_similar(
        &self,
        query_embedding: &[f32],
        source_type: Option<&str>,
        top_k: usize,
        min_score: f32,
    ) -> Result<Vec<SimilarResult>> {
        let conn = self.conn.lock();

        let query = match source_type {
            Some(_) => {
                "SELECT id, source_type, content, embedding FROM embeddings WHERE source_type = ?1"
            }
            None => "SELECT id, source_type, content, embedding FROM embeddings",
        };

        let mut stmt = conn.prepare(query)?;

        let rows: Vec<(String, String, String, Vec<u8>)> = match source_type {
            Some(st) => stmt
                .query_map(params![st], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
                })?
                .collect::<std::result::Result<Vec<_>, _>>()?,
            None => stmt
                .query_map([], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
                })?
                .collect::<std::result::Result<Vec<_>, _>>()?,
        };

        let mut results: Vec<SimilarResult> = rows
            .into_iter()
            .filter_map(|(id, source_type, content, blob)| {
                let emb = blob_to_embedding(&blob);
                let score = cosine_similarity(query_embedding, &emb);
                if score >= min_score {
                    Some(SimilarResult {
                        id,
                        source_type,
                        content,
                        score,
                    })
                } else {
                    None
                }
            })
            .collect();

        // Sort by score descending
        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        results.truncate(top_k);

        Ok(results)
    }

    /// Get database path
    pub fn db_path(&self) -> &Path {
        &self.db_path
    }
}

// =============================================================================
// VECTOR HELPERS
// =============================================================================

/// Convert f32 vector to blob (little-endian bytes)
fn embedding_to_blob(embedding: &[f32]) -> Vec<u8> {
    embedding
        .iter()
        .flat_map(|f| f.to_le_bytes())
        .collect()
}

/// Convert blob back to f32 vector
fn blob_to_embedding(blob: &[u8]) -> Vec<f32> {
    blob.chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect()
}

/// Cosine similarity between two vectors
fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_embedding_serialization() {
        let original = vec![0.1, 0.2, 0.3, -0.5];
        let blob = embedding_to_blob(&original);
        let restored = blob_to_embedding(&blob);
        assert_eq!(original.len(), restored.len());
        for (a, b) in original.iter().zip(restored.iter()) {
            assert!((a - b).abs() < 1e-7);
        }
    }

    #[test]
    fn test_cosine_similarity_identical() {
        let a = vec![1.0, 2.0, 3.0];
        assert!((cosine_similarity(&a, &a) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_cosine_similarity_orthogonal() {
        let a = vec![1.0, 0.0];
        let b = vec![0.0, 1.0];
        assert!(cosine_similarity(&a, &b).abs() < 1e-6);
    }
}
