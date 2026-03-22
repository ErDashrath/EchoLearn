use std::{
  collections::BTreeMap,
  fs,
  path::{Path, PathBuf},
  sync::Mutex,
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
pub struct DeviceStoreState {
  lock: Mutex<()>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceStoreEntry {
  pub key: String,
  pub value: Value,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeviceStoreDatabase {
  version: u32,
  stores: BTreeMap<String, BTreeMap<String, Value>>,
}

impl Default for DeviceStoreDatabase {
  fn default() -> Self {
    Self {
      version: 1,
      stores: BTreeMap::new(),
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

  Ok(data_dir.join("device-store-v1.json"))
}

fn read_database(path: &Path) -> Result<DeviceStoreDatabase, String> {
  if !path.exists() {
    return Ok(DeviceStoreDatabase::default());
  }

  let raw = fs::read_to_string(path)
    .map_err(|error| format!("failed to read device store database: {error}"))?;

  if raw.trim().is_empty() {
    return Ok(DeviceStoreDatabase::default());
  }

  serde_json::from_str::<DeviceStoreDatabase>(&raw)
    .map_err(|error| format!("failed to parse device store database: {error}"))
}

fn write_database(path: &Path, database: &DeviceStoreDatabase) -> Result<(), String> {
  let serialized = serde_json::to_string_pretty(database)
    .map_err(|error| format!("failed to serialize device store database: {error}"))?;

  fs::write(path, serialized)
    .map_err(|error| format!("failed to write device store database: {error}"))
}

#[tauri::command]
pub fn device_store_get(
  app: AppHandle,
  state: State<'_, DeviceStoreState>,
  store_name: String,
  key: String,
) -> Result<Option<Value>, String> {
  let _guard = state
    .lock
    .lock()
    .map_err(|_| String::from("failed to lock device store"))?;

  let path = database_path(&app)?;
  let database = read_database(&path)?;
  Ok(
    database
      .stores
      .get(&store_name)
      .and_then(|store| store.get(&key))
      .cloned(),
  )
}

#[tauri::command]
pub fn device_store_set(
  app: AppHandle,
  state: State<'_, DeviceStoreState>,
  store_name: String,
  key: String,
  value: Value,
) -> Result<bool, String> {
  let _guard = state
    .lock
    .lock()
    .map_err(|_| String::from("failed to lock device store"))?;

  let path = database_path(&app)?;
  let mut database = read_database(&path)?;
  let store = database.stores.entry(store_name).or_default();
  store.insert(key, value);
  database.version = 1;
  write_database(&path, &database)?;
  Ok(true)
}

#[tauri::command]
pub fn device_store_delete(
  app: AppHandle,
  state: State<'_, DeviceStoreState>,
  store_name: String,
  key: String,
) -> Result<bool, String> {
  let _guard = state
    .lock
    .lock()
    .map_err(|_| String::from("failed to lock device store"))?;

  let path = database_path(&app)?;
  let mut database = read_database(&path)?;
  let removed = database
    .stores
    .get_mut(&store_name)
    .and_then(|store| store.remove(&key))
    .is_some();

  if removed {
    write_database(&path, &database)?;
  }

  Ok(removed)
}

#[tauri::command]
pub fn device_store_clear(
  app: AppHandle,
  state: State<'_, DeviceStoreState>,
  store_name: String,
) -> Result<bool, String> {
  let _guard = state
    .lock
    .lock()
    .map_err(|_| String::from("failed to lock device store"))?;

  let path = database_path(&app)?;
  let mut database = read_database(&path)?;
  let removed = database.stores.remove(&store_name).is_some();

  if removed {
    write_database(&path, &database)?;
  }

  Ok(true)
}

#[tauri::command]
pub fn device_store_keys(
  app: AppHandle,
  state: State<'_, DeviceStoreState>,
  store_name: String,
) -> Result<Vec<String>, String> {
  let _guard = state
    .lock
    .lock()
    .map_err(|_| String::from("failed to lock device store"))?;

  let path = database_path(&app)?;
  let database = read_database(&path)?;
  Ok(
    database
      .stores
      .get(&store_name)
      .map(|store| store.keys().cloned().collect())
      .unwrap_or_default(),
  )
}

#[tauri::command]
pub fn device_store_entries(
  app: AppHandle,
  state: State<'_, DeviceStoreState>,
  store_name: String,
) -> Result<Vec<DeviceStoreEntry>, String> {
  let _guard = state
    .lock
    .lock()
    .map_err(|_| String::from("failed to lock device store"))?;

  let path = database_path(&app)?;
  let database = read_database(&path)?;
  Ok(
    database
      .stores
      .get(&store_name)
      .map(|store| {
        store
          .iter()
          .map(|(key, value)| DeviceStoreEntry {
            key: key.clone(),
            value: value.clone(),
          })
          .collect()
      })
      .unwrap_or_default(),
  )
}
