use std::{
  fs,
  path::{Path, PathBuf},
  sync::Mutex,
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
pub struct MemoryStoreState {
  lock: Mutex<()>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryRecord {
  pub id: String,
  pub user_id: String,
  pub source: String,
  pub source_id: String,
  pub session_id: Option<String>,
  pub title: Option<String>,
  pub content: String,
  pub excerpt: String,
  pub tags: Vec<String>,
  pub terms: Vec<String>,
  pub importance: f64,
  pub salience: f64,
  pub occurred_at: String,
  pub created_at: String,
  pub updated_at: String,
  #[serde(default)]
  pub metadata: Value,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MemoryDatabase {
  version: u32,
  records: Vec<MemoryRecord>,
}

impl Default for MemoryDatabase {
  fn default() -> Self {
    Self {
      version: 1,
      records: Vec::new(),
    }
  }
}

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
  let data_dir = app
    .path()
    .app_local_data_dir()
    .map_err(|error| format!("failed to resolve app data directory: {error}"))?;

  fs::create_dir_all(&data_dir)
    .map_err(|error| format!("failed to create app data directory: {error}"))?;

  Ok(data_dir.join("memory-db-v1.json"))
}

fn read_database(path: &Path) -> Result<MemoryDatabase, String> {
  if !path.exists() {
    return Ok(MemoryDatabase::default());
  }

  let raw = fs::read_to_string(path)
    .map_err(|error| format!("failed to read memory database: {error}"))?;

  if raw.trim().is_empty() {
    return Ok(MemoryDatabase::default());
  }

  serde_json::from_str::<MemoryDatabase>(&raw)
    .map_err(|error| format!("failed to parse memory database: {error}"))
}

fn write_database(path: &Path, database: &MemoryDatabase) -> Result<(), String> {
  let serialized = serde_json::to_string_pretty(database)
    .map_err(|error| format!("failed to serialize memory database: {error}"))?;

  fs::write(path, serialized).map_err(|error| format!("failed to write memory database: {error}"))
}

#[tauri::command]
pub fn get_user_memory_records(
  app: AppHandle,
  state: State<'_, MemoryStoreState>,
  user_id: String,
) -> Result<Vec<MemoryRecord>, String> {
  let _guard = state
    .lock
    .lock()
    .map_err(|_| String::from("failed to lock memory store"))?;

  let path = database_path(&app)?;
  let mut records: Vec<_> = read_database(&path)?
    .records
    .into_iter()
    .filter(|record| record.user_id == user_id)
    .collect();

  records.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
  Ok(records)
}

#[tauri::command]
pub fn upsert_memory_records(
  app: AppHandle,
  state: State<'_, MemoryStoreState>,
  records: Vec<MemoryRecord>,
) -> Result<usize, String> {
  if records.is_empty() {
    return Ok(0);
  }

  let _guard = state
    .lock
    .lock()
    .map_err(|_| String::from("failed to lock memory store"))?;

  let path = database_path(&app)?;
  let mut database = read_database(&path)?;
  let count = records.len();

  for record in records {
    if let Some(index) = database
      .records
      .iter()
      .position(|current| current.id == record.id && current.user_id == record.user_id)
    {
      database.records[index] = record;
    } else {
      database.records.push(record);
    }
  }

  database.version = 1;
  write_database(&path, &database)?;

  Ok(count)
}

#[tauri::command]
pub fn delete_memory_records_by_prefixes(
  app: AppHandle,
  state: State<'_, MemoryStoreState>,
  user_id: String,
  prefixes: Vec<String>,
) -> Result<usize, String> {
  if prefixes.is_empty() {
    return Ok(0);
  }

  let _guard = state
    .lock
    .lock()
    .map_err(|_| String::from("failed to lock memory store"))?;

  let path = database_path(&app)?;
  let mut database = read_database(&path)?;
  let before = database.records.len();

  database.records.retain(|record| {
    if record.user_id != user_id {
      return true;
    }

    !prefixes.iter().any(|prefix| record.id.starts_with(prefix))
  });

  let removed = before.saturating_sub(database.records.len());
  write_database(&path, &database)?;

  Ok(removed)
}
