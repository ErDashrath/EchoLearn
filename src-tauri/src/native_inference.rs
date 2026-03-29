use std::{env, path::PathBuf, process::Command};

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeInferenceStatus {
  pub available: bool,
  pub runtime: String,
  pub reason: String,
}

fn first_existing_path(candidates: &[PathBuf]) -> Option<PathBuf> {
  candidates.iter().find(|path| path.exists()).cloned()
}

fn command_exists_in_path(command: &str) -> bool {
  Command::new("where")
    .arg(command)
    .output()
    .map(|output| output.status.success())
    .unwrap_or(false)
}

fn native_runtime_candidates() -> Vec<PathBuf> {
  let mut candidates = Vec::new();

  if let Ok(explicit) = env::var("MINDSCRIBE_NATIVE_CPU_RUNTIME") {
    candidates.push(PathBuf::from(explicit));
  }

  candidates.push(PathBuf::from("src-tauri/bin/llm/llama-cli.exe"));
  candidates.push(PathBuf::from("src-tauri/bin/llm/main.exe"));
  candidates.push(PathBuf::from("bin/llm/llama-cli.exe"));
  candidates.push(PathBuf::from("bin/llm/main.exe"));

  if let Ok(exe) = env::current_exe() {
    if let Some(parent) = exe.parent() {
      candidates.push(parent.join("llama-cli.exe"));
      candidates.push(parent.join("llm").join("llama-cli.exe"));
      candidates.push(parent.join("bin").join("llm").join("llama-cli.exe"));
    }
  }

  candidates
}

#[tauri::command]
pub fn native_inference_status() -> NativeInferenceStatus {
  if !cfg!(target_os = "windows") {
    return NativeInferenceStatus {
      available: false,
      runtime: String::new(),
      reason: String::from("Native CPU inference is currently implemented for Windows only."),
    };
  }

  if let Some(path) = first_existing_path(&native_runtime_candidates()) {
    return NativeInferenceStatus {
      available: true,
      runtime: path.to_string_lossy().to_string(),
      reason: String::new(),
    };
  }

  if command_exists_in_path("llama-cli.exe") {
    return NativeInferenceStatus {
      available: true,
      runtime: String::from("llama-cli.exe"),
      reason: String::new(),
    };
  }

  NativeInferenceStatus {
    available: false,
    runtime: String::new(),
    reason: String::from(
      "Native CPU runtime binary not found. Configure MINDSCRIBE_NATIVE_CPU_RUNTIME or bundle llama-cli.exe.",
    ),
  }
}

#[tauri::command]
pub fn native_inference_generate(
  prompt: String,
  max_tokens: Option<u32>,
  temperature: Option<f32>,
) -> Result<String, String> {
  let _ = max_tokens;
  let _ = temperature;

  if prompt.trim().is_empty() {
    return Err(String::from("Prompt cannot be empty."));
  }

  let status = native_inference_status();
  if !status.available {
    return Err(status.reason);
  }

  Err(String::from(
    "Native CPU runtime contract is wired, but token generation integration is pending (Phase 3).",
  ))
}

#[tauri::command]
pub fn native_inference_stop() -> bool {
  false
}
