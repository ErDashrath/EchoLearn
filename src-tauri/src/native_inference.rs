use std::{
  env,
  fs::File,
  io::Read,
  path::{Path, PathBuf},
  process::{Command, Stdio},
  sync::{Mutex, OnceLock},
  thread,
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::Emitter;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeInferenceStatus {
  pub available: bool,
  pub runtime: String,
  pub model: String,
  pub runtime_sha256: String,
  pub model_sha256: String,
  pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeInferenceStreamChunk {
  pub request_id: String,
  pub chunk: String,
  pub done: bool,
  pub error: Option<String>,
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

fn resolve_command_path(command: &str) -> Option<PathBuf> {
  let output = Command::new("where").arg(command).output().ok()?;
  if !output.status.success() {
    return None;
  }

  let stdout = String::from_utf8_lossy(&output.stdout);
  stdout
    .lines()
    .map(str::trim)
    .find(|line| !line.is_empty())
    .map(PathBuf::from)
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

fn resolve_runtime_command() -> Option<PathBuf> {
  if let Some(path) = first_existing_path(&native_runtime_candidates()) {
    return Some(path);
  }

  if command_exists_in_path("llama-cli.exe") {
    return resolve_command_path("llama-cli.exe");
  }

  None
}

fn resolve_model_path() -> Option<PathBuf> {
  first_existing_path(&native_model_candidates())
}

fn expected_runtime_hash() -> Option<String> {
  env::var("MINDSCRIBE_NATIVE_CPU_RUNTIME_SHA256")
    .ok()
    .map(|value| value.trim().to_lowercase())
    .filter(|value| !value.is_empty())
}

fn expected_model_hash() -> Option<String> {
  env::var("MINDSCRIBE_NATIVE_CPU_MODEL_SHA256")
    .ok()
    .map(|value| value.trim().to_lowercase())
    .filter(|value| !value.is_empty())
}

fn compute_sha256(path: &Path) -> Result<String, String> {
  let mut file =
    File::open(path).map_err(|error| format!("failed to open {}: {error}", path.display()))?;
  let mut hasher = Sha256::new();
  let mut buffer = [0u8; 8192];

  loop {
    let read = file
      .read(&mut buffer)
      .map_err(|error| format!("failed to read {}: {error}", path.display()))?;
    if read == 0 {
      break;
    }
    hasher.update(&buffer[..read]);
  }

  Ok(format!("{:x}", hasher.finalize()))
}

fn verify_hash(label: &str, actual: &str, expected: Option<String>) -> Result<(), String> {
  let expected = expected.ok_or_else(|| {
    format!(
      "Missing required integrity hash for {label}. Set MINDSCRIBE_NATIVE_CPU_{}_SHA256.",
      label.to_ascii_uppercase()
    )
  })?;

  if actual == expected {
    return Ok(());
  }

  Err(format!(
    "Integrity check failed for {label}. Expected {expected}, got {actual}."
  ))
}

fn emit_stream_chunk(
  app: &tauri::AppHandle,
  request_id: &str,
  chunk: &str,
  done: bool,
  error: Option<String>,
) {
  let payload = NativeInferenceStreamChunk {
    request_id: request_id.to_string(),
    chunk: chunk.to_string(),
    done,
    error,
  };

  let _ = app.emit("native-inference-stream", payload);
}

#[tauri::command]
pub fn native_inference_status() -> NativeInferenceStatus {
  if !cfg!(target_os = "windows") {
    return NativeInferenceStatus {
      available: false,
      runtime: String::new(),
      model: String::new(),
        runtime_sha256: String::new(),
        model_sha256: String::new(),
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
        runtime_sha256: String::new(),
        model_sha256: String::new(),
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
        runtime: runtime.to_string_lossy().to_string(),
        model: String::new(),
        runtime_sha256: String::new(),
        model_sha256: String::new(),
        reason: String::from(
          "Native CPU model file not found. Configure MINDSCRIBE_NATIVE_CPU_MODEL or bundle a GGUF model.",
        ),
      }
    }
  };

  let runtime_hash = match compute_sha256(&runtime) {
    Ok(hash) => hash,
    Err(reason) => {
      return NativeInferenceStatus {
        available: false,
        runtime: runtime.to_string_lossy().to_string(),
        model: model.to_string_lossy().to_string(),
        runtime_sha256: String::new(),
        model_sha256: String::new(),
        reason,
      }
    }
  };

  let model_hash = match compute_sha256(&model) {
    Ok(hash) => hash,
    Err(reason) => {
      return NativeInferenceStatus {
        available: false,
        runtime: runtime.to_string_lossy().to_string(),
        model: model.to_string_lossy().to_string(),
        runtime_sha256: runtime_hash,
        model_sha256: String::new(),
        reason,
      }
    }
  };

  if let Err(reason) = verify_hash("runtime", &runtime_hash, expected_runtime_hash()) {
    return NativeInferenceStatus {
      available: false,
      runtime: runtime.to_string_lossy().to_string(),
      model: model.to_string_lossy().to_string(),
      runtime_sha256: runtime_hash,
      model_sha256: model_hash,
      reason,
    };
  }

  if let Err(reason) = verify_hash("model", &model_hash, expected_model_hash()) {
    return NativeInferenceStatus {
      available: false,
      runtime: runtime.to_string_lossy().to_string(),
      model: model.to_string_lossy().to_string(),
      runtime_sha256: runtime_hash,
      model_sha256: model_hash,
      reason,
    };
  }

  NativeInferenceStatus {
    available: true,
    runtime: runtime.to_string_lossy().to_string(),
    model: model.to_string_lossy().to_string(),
    runtime_sha256: runtime_hash,
    model_sha256: model_hash,
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
pub fn native_inference_generate_stream(
  app: tauri::AppHandle,
  request_id: String,
  prompt: String,
  max_tokens: Option<u32>,
  temperature: Option<f32>,
) -> Result<bool, String> {
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

  let mut child = cmd
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

  let mut stdout = child
    .stdout
    .take()
    .ok_or_else(|| String::from("native CPU runtime stdout was not available"))?;
  let mut stderr = child
    .stderr
    .take()
    .ok_or_else(|| String::from("native CPU runtime stderr was not available"))?;

  let app_handle = app.clone();
  thread::spawn(move || {
    let mut buffer = [0u8; 512];

    loop {
      match stdout.read(&mut buffer) {
        Ok(0) => break,
        Ok(count) => {
          let chunk = String::from_utf8_lossy(&buffer[..count]).to_string();
          if !chunk.is_empty() {
            emit_stream_chunk(&app_handle, &request_id, &chunk, false, None);
          }
        }
        Err(error) => {
          emit_stream_chunk(
            &app_handle,
            &request_id,
            "",
            true,
            Some(format!("native CPU stream read failed: {error}")),
          );
          return;
        }
      }
    }

    let mut stderr_text = String::new();
    let _ = stderr.read_to_string(&mut stderr_text);
    let wait_result = child.wait();

    {
      let slot = active_pid_slot();
      if let Ok(mut guard) = slot.lock() {
        if guard.as_ref() == Some(&pid) {
          *guard = None;
        }
      }
    }

    match wait_result {
      Ok(status) if status.success() => {
        emit_stream_chunk(&app_handle, &request_id, "", true, None);
      }
      Ok(_) => {
        if stderr_text.trim().is_empty() {
          emit_stream_chunk(&app_handle, &request_id, "", true, None);
        } else {
          emit_stream_chunk(
            &app_handle,
            &request_id,
            "",
            true,
            Some(stderr_text.trim().to_string()),
          );
        }
      }
      Err(error) => {
        emit_stream_chunk(
          &app_handle,
          &request_id,
          "",
          true,
          Some(format!("native CPU runtime wait failed: {error}")),
        );
      }
    }
  });

  Ok(true)
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
