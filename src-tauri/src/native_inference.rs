use std::{
  env,
  path::PathBuf,
  process::{Command, Stdio},
  sync::{Mutex, OnceLock},
};

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeInferenceStatus {
  pub available: bool,
  pub runtime: String,
  pub model: String,
  pub reason: String,
}

static ACTIVE_NATIVE_PID: OnceLock<Mutex<Option<u32>>> = OnceLock::new();

fn active_pid_slot() -> &'static Mutex<Option<u32>> {
  ACTIVE_NATIVE_PID.get_or_init(|| Mutex::new(None))
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

fn native_model_candidates() -> Vec<PathBuf> {
  let mut candidates = Vec::new();

  if let Ok(explicit) = env::var("MINDSCRIBE_NATIVE_CPU_MODEL") {
    candidates.push(PathBuf::from(explicit));
  }

  candidates.push(PathBuf::from("src-tauri/bin/llm/models/chat.gguf"));
  candidates.push(PathBuf::from("src-tauri/bin/llm/models/model.gguf"));
  candidates.push(PathBuf::from("src-tauri/bin/llm/model.gguf"));
  candidates.push(PathBuf::from("bin/llm/models/chat.gguf"));
  candidates.push(PathBuf::from("bin/llm/models/model.gguf"));
  candidates.push(PathBuf::from("public/models/llm/chat.gguf"));
  candidates.push(PathBuf::from("public/models/llm/model.gguf"));

  if let Ok(exe) = env::current_exe() {
    if let Some(parent) = exe.parent() {
      candidates.push(parent.join("llm").join("models").join("chat.gguf"));
      candidates.push(parent.join("llm").join("models").join("model.gguf"));
      candidates.push(parent.join("bin").join("llm").join("models").join("chat.gguf"));
      candidates.push(parent.join("bin").join("llm").join("models").join("model.gguf"));
    }
  }

  candidates
}

fn resolve_runtime_command() -> Option<String> {
  if let Some(path) = first_existing_path(&native_runtime_candidates()) {
    return Some(path.to_string_lossy().to_string());
  }

  if command_exists_in_path("llama-cli.exe") {
    return Some(String::from("llama-cli.exe"));
  }

  None
}

fn resolve_model_path() -> Option<PathBuf> {
  first_existing_path(&native_model_candidates())
}

#[tauri::command]
pub fn native_inference_status() -> NativeInferenceStatus {
  if !cfg!(target_os = "windows") {
    return NativeInferenceStatus {
      available: false,
      runtime: String::new(),
      model: String::new(),
      reason: String::from("Native CPU inference is currently implemented for Windows only."),
    };
  }

  let runtime = match resolve_runtime_command() {
    Some(runtime) => runtime,
    None => {
      return NativeInferenceStatus {
        available: false,
        runtime: String::new(),
        model: String::new(),
        reason: String::from(
          "Native CPU runtime binary not found. Configure MINDSCRIBE_NATIVE_CPU_RUNTIME or bundle llama-cli.exe.",
        ),
      }
    }
  };

  let model = match resolve_model_path() {
    Some(model) => model,
    None => {
      return NativeInferenceStatus {
        available: false,
        runtime,
        model: String::new(),
        reason: String::from(
          "Native CPU model file not found. Configure MINDSCRIBE_NATIVE_CPU_MODEL or bundle a GGUF model.",
        ),
      }
    }
  };

  NativeInferenceStatus {
    available: true,
    runtime,
    model: model.to_string_lossy().to_string(),
    reason: String::new(),
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

  let runtime = status.runtime;
  let model = status.model;
  let max_predict = max_tokens.unwrap_or(256).clamp(16, 2048);
  let temp = temperature.unwrap_or(0.7).clamp(0.0, 1.5);
  let threads = env::var("MINDSCRIBE_NATIVE_CPU_THREADS")
    .ok()
    .and_then(|value| value.parse::<usize>().ok())
    .filter(|value| *value > 0)
    .unwrap_or_else(|| {
      std::thread::available_parallelism()
        .map(|value| value.get().min(8))
        .unwrap_or(4)
    });

  let mut cmd = Command::new(runtime);
  cmd
    .arg("-m")
    .arg(model)
    .arg("-p")
    .arg(prompt)
    .arg("-n")
    .arg(max_predict.to_string())
    .arg("--temp")
    .arg(format!("{temp:.2}"))
    .arg("--threads")
    .arg(threads.to_string())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());

  let child = cmd
    .spawn()
    .map_err(|error| format!("failed to start native CPU runtime: {error}"))?;

  let pid = child.id();
  {
    let slot = active_pid_slot();
    let mut guard = slot
      .lock()
      .map_err(|_| String::from("native inference lock poisoned"))?;
    *guard = Some(pid);
  }

  let output = child
    .wait_with_output()
    .map_err(|error| format!("failed waiting for native CPU runtime: {error}"))?;

  {
    let slot = active_pid_slot();
    if let Ok(mut guard) = slot.lock() {
      if guard.as_ref() == Some(&pid) {
        *guard = None;
      }
    }
  }

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    return Err(if stderr.is_empty() {
      String::from("native CPU runtime exited with failure")
    } else {
      stderr
    });
  }

  let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
  if text.is_empty() {
    return Err(String::from("native CPU runtime returned an empty response"));
  }

  Ok(text)
}

#[tauri::command]
pub fn native_inference_stop() -> bool {
  let slot = active_pid_slot();
  let Ok(mut guard) = slot.lock() else {
    return false;
  };

  if let Some(pid) = *guard {
    let killed = Command::new("taskkill")
      .arg("/F")
      .arg("/T")
      .arg("/PID")
      .arg(pid.to_string())
      .output()
      .map(|output| output.status.success())
      .unwrap_or(false);

    if killed {
      *guard = None;
    }

    return killed;
  }

  false
}
