                                                                                                            use std::{
  collections::HashSet,
  env,
  fs::{self, File},
  io::{copy, Read},
  path::{Path, PathBuf},
  process::{Command, Stdio},
  sync::{Mutex, OnceLock},
  thread,
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::Emitter;
use tauri::Manager;

const DEFAULT_DOWNLOAD_HOST_ALLOWLIST: &[&str] = &[
  "huggingface.co",
  "cdn-lfs.huggingface.co",
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
];

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeInferenceStatus {
  pub available: bool,
  pub runtime: String,
  pub model: String,
  pub selected_model_id: String,
  pub runtime_sha256: String,
  pub model_sha256: String,
  pub profile: String,
  pub effective_threads: u32,
  pub max_tokens_cap: u32,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeModelDownloadResult {
  pub model_id: String,
  pub model_path: String,
  pub sha256: String,
  pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRuntimeDownloadResult {
  pub runtime_path: String,
  pub sha256: String,
  pub size_bytes: u64,
}

static ACTIVE_NATIVE_PID: OnceLock<Mutex<Option<u32>>> = OnceLock::new();

enum NativeCpuProfile {
  Low,
  Balanced,
  High,
}

struct NativeInferenceRuntimeConfig {
  profile: NativeCpuProfile,
  threads: u32,
  max_tokens: u32,
  temperature: f32,
  gpu_layers: Option<u32>,
  main_gpu: Option<u32>,
}

fn active_pid_slot() -> &'static Mutex<Option<u32>> {
  ACTIVE_NATIVE_PID.get_or_init(|| Mutex::new(None))
}

fn first_existing_path(candidates: &[PathBuf]) -> Option<PathBuf> {
  candidates.iter().find(|path| path.exists()).cloned()
}

fn env_flag(name: &str) -> Option<bool> {
  env::var(name).ok().and_then(|value| {
    let normalized = value.trim().to_ascii_lowercase();
    match normalized.as_str() {
      "1" | "true" | "yes" | "on" => Some(true),
      "0" | "false" | "no" | "off" => Some(false),
      _ => None,
    }
  })
}

fn download_host_allowlist() -> Vec<String> {
  let mut hosts: Vec<String> = DEFAULT_DOWNLOAD_HOST_ALLOWLIST
    .iter()
    .map(|host| host.to_string())
    .collect();

  if let Ok(raw) = env::var("MINDSCRIBE_NATIVE_DOWNLOAD_HOST_ALLOWLIST") {
    for item in raw.split(',') {
      let host = item.trim().to_ascii_lowercase();
      if !host.is_empty() && !hosts.iter().any(|current| current == &host) {
        hosts.push(host);
      }
    }
  }

  hosts
}

fn host_allowed(host: &str, allowlist: &[String]) -> bool {
  let host = host.to_ascii_lowercase();
  allowlist.iter().any(|allowed| {
    host == *allowed || host.ends_with(&format!(".{allowed}"))
  })
}

fn validated_download_url(raw_url: &str, label: &str) -> Result<String, String> {
  let parsed = reqwest::Url::parse(raw_url)
    .map_err(|error| format!("invalid {label} URL: {error}"))?;

  if parsed.scheme() != "https" {
    return Err(format!("{label} URL must use HTTPS."));
  }

  let host = parsed
    .host_str()
    .ok_or_else(|| format!("{label} URL must include a valid host."))?;

  let allowlist = download_host_allowlist();
  if !host_allowed(host, &allowlist) {
    return Err(format!(
      "{label} URL host '{host}' is not allowed. Configure MINDSCRIBE_NATIVE_DOWNLOAD_HOST_ALLOWLIST if needed."
    ));
  }

  Ok(parsed.to_string())
}

fn hashes_required() -> bool {
  env_flag("MINDSCRIBE_NATIVE_CPU_REQUIRE_HASHES")
    .unwrap_or(!cfg!(debug_assertions))
}

fn append_runtime_candidates_from_dir(candidates: &mut Vec<PathBuf>, root: &Path) {
  collect_executables(root, 3, candidates);
}

fn is_executable(path: &Path) -> bool {
  path
    .extension()
    .map(|ext| ext.to_string_lossy().eq_ignore_ascii_case("exe"))
    .unwrap_or(false)
}

fn should_skip_dir(path: &Path) -> bool {
  path
    .file_name()
    .map(|name| {
      let value = name.to_string_lossy().to_ascii_lowercase();
      matches!(value.as_str(), "node_modules" | "target" | "dist" | ".git")
    })
    .unwrap_or(false)
}

fn collect_executables(root: &Path, max_depth: usize, candidates: &mut Vec<PathBuf>) {
  if max_depth == 0 || !root.exists() || !root.is_dir() {
    return;
  }

  if let Ok(entries) = fs::read_dir(root) {
    for entry in entries.flatten() {
      let path = entry.path();

      if path.is_file() {
        if is_executable(&path) {
          candidates.push(path);
        }
        continue;
      }

      if path.is_dir() && !should_skip_dir(&path) {
        collect_executables(&path, max_depth - 1, candidates);
      }
    }
  }
}

fn is_gguf(path: &Path) -> bool {
  path
    .extension()
    .map(|ext| ext.to_string_lossy().eq_ignore_ascii_case("gguf"))
    .unwrap_or(false)
}

fn collect_gguf_files(root: &Path, max_depth: usize, candidates: &mut Vec<PathBuf>) {
  if max_depth == 0 || !root.exists() || !root.is_dir() {
    return;
  }

  if let Ok(entries) = fs::read_dir(root) {
    for entry in entries.flatten() {
      let path = entry.path();

      if path.is_file() {
        if is_gguf(&path) {
          candidates.push(path);
        }
        continue;
      }

      if path.is_dir() && !should_skip_dir(&path) {
        collect_gguf_files(&path, max_depth - 1, candidates);
      }
    }
  }
}

fn dedupe_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
  let mut seen = HashSet::new();
  let mut deduped = Vec::new();
  for path in paths {
    let normalized = path.to_string_lossy().to_ascii_lowercase();
    if seen.insert(normalized) {
      deduped.push(path);
    }
  }
  deduped
}

fn runtime_probe_score(path: &Path) -> i32 {
  let output = Command::new(path)
    .arg("--help")
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .output();

  let Ok(output) = output else {
    return 0;
  };

  let stdout = String::from_utf8_lossy(&output.stdout);
  let stderr = String::from_utf8_lossy(&output.stderr);
  let text = format!("{}\n{}", stdout, stderr).to_ascii_lowercase();

  if text.trim().is_empty() {
    return 0;
  }

  let mut score = 0;
  if text.contains("gguf") {
    score += 6;
  }
  if text.contains("--model") || text.contains(" -m ") {
    score += 5;
  }
  if text.contains("--prompt") || text.contains(" -p ") {
    score += 4;
  }
  if text.contains("--threads") {
    score += 3;
  }
  if text.contains("--temp") || text.contains("temperature") {
    score += 2;
  }
  if text.contains("inference") || text.contains("generate") {
    score += 2;
  }

  score
}

fn candidate_roots() -> Vec<PathBuf> {
  let mut roots = Vec::new();

  if let Ok(current_dir) = env::current_dir() {
    roots.push(current_dir);
  }

  if let Ok(exe) = env::current_exe() {
    if let Some(parent) = exe.parent() {
      roots.push(parent.to_path_buf());
      if let Some(grand_parent) = parent.parent() {
        roots.push(grand_parent.to_path_buf());
      }
    }
  }

  roots
}

fn native_runtime_candidates() -> Vec<PathBuf> {
  let mut candidates = Vec::new();

  if let Ok(explicit) = env::var("MINDSCRIBE_NATIVE_CPU_RUNTIME") {
    candidates.push(PathBuf::from(explicit));
  }

  if let Ok(runtime_dir) = env::var("MINDSCRIBE_NATIVE_CPU_RUNTIME_DIR") {
    append_runtime_candidates_from_dir(&mut candidates, &PathBuf::from(runtime_dir));
  }

  for root in candidate_roots() {
    append_runtime_candidates_from_dir(&mut candidates, &root);
  }

  dedupe_paths(candidates)
}

fn native_model_candidates() -> Vec<PathBuf> {
  let mut candidates = Vec::new();

  if let Ok(explicit) = env::var("MINDSCRIBE_NATIVE_CPU_MODEL") {
    candidates.push(PathBuf::from(explicit));
  }

  if let Ok(model_dir) = env::var("MINDSCRIBE_NATIVE_CPU_MODEL_DIR") {
    collect_gguf_files(&PathBuf::from(model_dir), 6, &mut candidates);
  }

  for root in candidate_roots() {
    collect_gguf_files(&root, 6, &mut candidates);
  }

  dedupe_paths(candidates)
}

fn resolve_runtime_command(runtime_path: Option<&str>) -> Option<PathBuf> {
  if let Some(explicit_path) = runtime_path {
    let explicit = PathBuf::from(explicit_path);
    if explicit.exists() {
      return Some(explicit);
    }
  }

  if let Ok(explicit) = env::var("MINDSCRIBE_NATIVE_CPU_RUNTIME") {
    let explicit = PathBuf::from(explicit);
    if explicit.exists() {
      return Some(explicit);
    }
  }

  let candidates = native_runtime_candidates();
  let mut best: Option<(i32, PathBuf)> = None;

  for candidate in candidates {
    if !candidate.exists() || !candidate.is_file() {
      continue;
    }

    let score = runtime_probe_score(&candidate);
    if score <= 0 {
      continue;
    }

    match &best {
      Some((best_score, _)) if *best_score >= score => {}
      _ => best = Some((score, candidate)),
    }
  }

  if let Some((_, path)) = best {
    return Some(path);
  }

  None
}

fn normalized_tokens(input: &str) -> Vec<String> {
  input
    .to_ascii_lowercase()
    .split(|ch: char| !(ch.is_ascii_alphanumeric() || ch == '.'))
    .filter(|token| !token.is_empty())
    .map(String::from)
    .collect()
}

fn best_model_candidate(preferred_model_id: &str, candidates: &[PathBuf]) -> Option<PathBuf> {
  let preferred_tokens = normalized_tokens(preferred_model_id);
  if preferred_tokens.is_empty() {
    return None;
  }

  let mut best: Option<(i32, PathBuf)> = None;
  for candidate in candidates {
    if !candidate.exists() {
      continue;
    }

    let file_name = candidate
      .file_name()
      .map(|value| value.to_string_lossy().to_ascii_lowercase())
      .unwrap_or_default();

    let mut score = 0;
    for token in &preferred_tokens {
      if token.len() < 2 {
        continue;
      }

      if file_name.contains(token) {
        score += if token.contains('b') { 4 } else { 2 };
      }
    }

    if preferred_tokens.iter().any(|token| token.contains("llama")) && file_name.contains("llama") {
      score += 6;
    }
    if preferred_tokens.iter().any(|token| token.contains("qwen")) && file_name.contains("qwen") {
      score += 6;
    }
    if preferred_tokens.iter().any(|token| token.contains("phi")) && file_name.contains("phi") {
      score += 6;
    }
    if preferred_tokens.iter().any(|token| token.contains("gemma")) && file_name.contains("gemma") {
      score += 6;
    }

    if score <= 0 {
      continue;
    }

    match &best {
      Some((best_score, _)) if *best_score >= score => {}
      _ => {
        best = Some((score, candidate.clone()));
      }
    }
  }

  best.map(|(_, path)| path)
}

fn resolve_model_path(model_path: Option<&str>, preferred_model_id: Option<&str>) -> Option<PathBuf> {
  if let Some(explicit_path) = model_path {
    let explicit = PathBuf::from(explicit_path);
    if explicit.exists() {
      return Some(explicit);
    }
  }

  if let Some(preferred) = preferred_model_id {
    if let Some(mapped) = resolve_model_path_from_map(preferred) {
      return Some(mapped);
    }
  }

  let candidates = native_model_candidates();

  if let Some(preferred) = preferred_model_id {
    if let Some(best) = best_model_candidate(preferred, &candidates) {
      return Some(best);
    }
  }

  first_existing_path(&candidates)
}

fn resolve_model_path_from_map(preferred_model_id: &str) -> Option<PathBuf> {
  let raw = env::var("MINDSCRIBE_NATIVE_CPU_MODEL_MAP").ok()?;
  let map: serde_json::Value = serde_json::from_str(&raw).ok()?;
  let object = map.as_object()?;

  let direct = object.get(preferred_model_id).and_then(|value| value.as_str());
  if let Some(path) = direct {
    let resolved = PathBuf::from(path);
    if resolved.exists() {
      return Some(resolved);
    }
  }

  let normalized_preferred = preferred_model_id.to_ascii_lowercase();
  for (key, value) in object {
    if !normalized_preferred.contains(&key.to_ascii_lowercase()) {
      continue;
    }

    if let Some(path) = value.as_str() {
      let resolved = PathBuf::from(path);
      if resolved.exists() {
        return Some(resolved);
      }
    }
  }

  None
}

fn detect_profile() -> NativeCpuProfile {
  match env::var("MINDSCRIBE_NATIVE_CPU_PROFILE")
    .ok()
    .map(|value| value.trim().to_lowercase())
    .as_deref()
  {
    Some("low") => NativeCpuProfile::Low,
    Some("high") => NativeCpuProfile::High,
    _ => NativeCpuProfile::Balanced,
  }
}

fn profile_name(profile: &NativeCpuProfile) -> String {
  match profile {
    NativeCpuProfile::Low => String::from("low"),
    NativeCpuProfile::Balanced => String::from("balanced"),
    NativeCpuProfile::High => String::from("high"),
  }
}

fn profile_thread_limit(profile: &NativeCpuProfile) -> u32 {
  match profile {
    NativeCpuProfile::Low => 2,
    NativeCpuProfile::Balanced => 6,
    NativeCpuProfile::High => 10,
  }
}

fn profile_token_cap(profile: &NativeCpuProfile) -> u32 {
  match profile {
    NativeCpuProfile::Low => 160,
    NativeCpuProfile::Balanced => 320,
    NativeCpuProfile::High => 512,
  }
}

fn profile_default_temperature(profile: &NativeCpuProfile) -> f32 {
  match profile {
    NativeCpuProfile::Low => 0.55,
    NativeCpuProfile::Balanced => 0.70,
    NativeCpuProfile::High => 0.80,
  }
}

fn profile_effective_threads(profile: &NativeCpuProfile) -> u32 {
  let available = std::thread::available_parallelism()
    .map(|value| value.get() as u32)
    .unwrap_or(4);
  available.max(1).min(profile_thread_limit(profile))
}

fn build_runtime_config(max_tokens: Option<u32>, temperature: Option<f32>) -> NativeInferenceRuntimeConfig {
  let profile = detect_profile();
  let token_cap = profile_token_cap(&profile);

  let requested_threads = env::var("MINDSCRIBE_NATIVE_CPU_THREADS")
    .ok()
    .and_then(|value| value.parse::<u32>().ok())
    .filter(|value| *value > 0);

  let threads = requested_threads
    .unwrap_or_else(|| profile_effective_threads(&profile))
    .clamp(1, 16);

  let max_tokens = max_tokens.unwrap_or(token_cap).clamp(16, token_cap);
  let temperature = temperature
    .unwrap_or_else(|| profile_default_temperature(&profile))
    .clamp(0.0, 1.5);

  let gpu_layers = env::var("MINDSCRIBE_NATIVE_GPU_LAYERS")
    .ok()
    .and_then(|value| value.parse::<u32>().ok())
    .filter(|value| *value > 0);

  let main_gpu = env::var("MINDSCRIBE_NATIVE_MAIN_GPU")
    .ok()
    .and_then(|value| value.parse::<u32>().ok());

  NativeInferenceRuntimeConfig {
    profile,
    threads,
    max_tokens,
    temperature,
    gpu_layers,
    main_gpu,
  }
}

fn runtime_help(runtime: &str) -> String {
  let output = Command::new(runtime)
    .arg("--help")
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .output();

  let Ok(output) = output else {
    return String::new();
  };

  format!(
    "{}\n{}",
    String::from_utf8_lossy(&output.stdout),
    String::from_utf8_lossy(&output.stderr)
  )
  .to_ascii_lowercase()
}

fn append_native_gpu_args(cmd: &mut Command, runtime: &str, config: &NativeInferenceRuntimeConfig) {
  let Some(gpu_layers) = config.gpu_layers else {
    return;
  };

  let help = runtime_help(runtime);
  if help.is_empty() {
    return;
  }

  if help.contains("--n-gpu-layers") {
    cmd.arg("--n-gpu-layers").arg(gpu_layers.to_string());
  } else if help.contains("-ngl") {
    cmd.arg("-ngl").arg(gpu_layers.to_string());
  } else if help.contains("--gpu-layers") {
    cmd.arg("--gpu-layers").arg(gpu_layers.to_string());
  }

  if let Some(main_gpu) = config.main_gpu {
    if help.contains("--main-gpu") {
      cmd.arg("--main-gpu").arg(main_gpu.to_string());
    } else if help.contains("-mg") {
      cmd.arg("-mg").arg(main_gpu.to_string());
    }
  }
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

fn verify_hash_if_required(label: &str, actual: &str, expected: Option<String>) -> Result<(), String> {
  if !hashes_required() {
    if let Some(expected) = expected {
      if actual != expected {
        return Err(format!(
          "Integrity check failed for {label}. Expected {expected}, got {actual}."
        ));
      }
    }
    return Ok(());
  }

  verify_hash(label, actual, expected)
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

fn sanitize_filename(value: &str) -> String {
  let sanitized: String = value
    .chars()
    .map(|ch| {
      if ch.is_ascii_alphanumeric() || ch == '.' || ch == '_' || ch == '-' {
        ch
      } else {
        '_'
      }
    })
    .collect();

  if sanitized.is_empty() {
    String::from("model")
  } else {
    sanitized
  }
}

fn should_treat_runtime_download_as_zip(
  runtime_url: &str,
  content_type: Option<&str>,
  content_disposition: Option<&str>,
) -> bool {
  let lower_url = runtime_url.to_ascii_lowercase();
  if lower_url.ends_with(".zip") {
    return true;
  }

  if let Some(content_type) = content_type {
    let lower = content_type.to_ascii_lowercase();
    if lower.contains("zip") {
      return true;
    }
  }

  if let Some(content_disposition) = content_disposition {
    let lower = content_disposition.to_ascii_lowercase();
    if lower.contains(".zip") {
      return true;
    }
  }

  false
}

fn clear_directory_contents(target_dir: &Path) -> Result<(), String> {
  if !target_dir.exists() {
    return Ok(());
  }

  for entry in fs::read_dir(target_dir)
    .map_err(|error| format!("failed to read {}: {error}", target_dir.display()))?
  {
    let entry = entry.map_err(|error| format!("failed to access dir entry: {error}"))?;
    let path = entry.path();
    if path.is_dir() {
      fs::remove_dir_all(&path)
        .map_err(|error| format!("failed to remove directory {}: {error}", path.display()))?;
    } else {
      fs::remove_file(&path)
        .map_err(|error| format!("failed to remove file {}: {error}", path.display()))?;
    }
  }

  Ok(())
}

fn extract_runtime_zip(archive_path: &Path, runtime_dir: &Path) -> Result<(), String> {
  let file = File::open(archive_path)
    .map_err(|error| format!("failed to open runtime archive {}: {error}", archive_path.display()))?;
  let mut archive = zip::ZipArchive::new(file)
    .map_err(|error| format!("failed to read runtime archive {}: {error}", archive_path.display()))?;

  for index in 0..archive.len() {
    let mut entry = archive
      .by_index(index)
      .map_err(|error| format!("failed to read zip entry #{index}: {error}"))?;

    let Some(safe_name) = entry.enclosed_name().map(PathBuf::from) else {
      continue;
    };

    let out_path = runtime_dir.join(safe_name);

    if entry.is_dir() {
      fs::create_dir_all(&out_path)
        .map_err(|error| format!("failed to create directory {}: {error}", out_path.display()))?;
      continue;
    }

    if let Some(parent) = out_path.parent() {
      fs::create_dir_all(parent)
        .map_err(|error| format!("failed to create directory {}: {error}", parent.display()))?;
    }

    let mut output = File::create(&out_path)
      .map_err(|error| format!("failed to create {}: {error}", out_path.display()))?;
    copy(&mut entry, &mut output)
      .map_err(|error| format!("failed to extract {}: {error}", out_path.display()))?;
  }

  Ok(())
}

fn find_runtime_executable_in_dir(runtime_dir: &Path) -> Option<PathBuf> {
  let direct = runtime_dir.join("llama-cli.exe");
  if direct.exists() && direct.is_file() {
    return Some(direct);
  }

  let mut candidates = Vec::new();
  collect_executables(runtime_dir, 6, &mut candidates);
  let candidates = dedupe_paths(candidates);

  let mut best: Option<(i32, PathBuf)> = None;
  for candidate in candidates {
    if !candidate.exists() || !candidate.is_file() {
      continue;
    }

    let file_name = candidate
      .file_name()
      .map(|value| value.to_string_lossy().to_ascii_lowercase())
      .unwrap_or_default();

    let mut score = runtime_probe_score(&candidate);
    if file_name.contains("llama") {
      score += 4;
    }
    if file_name.contains("cli") {
      score += 2;
    }

    match &best {
      Some((best_score, _)) if *best_score >= score => {}
      _ => best = Some((score, candidate)),
    }
  }

  best.map(|(_, path)| path)
}

fn output_has_nvidia_gpu(output: &str) -> bool {
  output
    .to_ascii_lowercase()
    .contains("nvidia")
}

fn command_output_contains_nvidia(program: &str, args: &[&str]) -> bool {
  let output = Command::new(program)
    .args(args)
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .output();

  let Ok(output) = output else {
    return false;
  };

  if !output.status.success() {
    return false;
  }

  let stdout = String::from_utf8_lossy(&output.stdout);
  let stderr = String::from_utf8_lossy(&output.stderr);
  output_has_nvidia_gpu(&format!("{}\n{}", stdout, stderr))
}

fn has_nvidia_gpu() -> bool {
  if !cfg!(target_os = "windows") {
    return false;
  }

  command_output_contains_nvidia(
    "powershell",
    &[
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name",
    ],
  )
    || command_output_contains_nvidia(
      "cmd",
      &["/C", "wmic path win32_VideoController get name"],
    )
    || command_output_contains_nvidia(
      "nvidia-smi",
      &["--query-gpu=name", "--format=csv,noheader"],
    )
}

#[tauri::command]
pub fn native_inference_has_nvidia_gpu() -> bool {
  has_nvidia_gpu()
}

#[tauri::command]
pub fn native_inference_download_model(
  app: tauri::AppHandle,
  model_id: String,
  hf_url: String,
) -> Result<NativeModelDownloadResult, String> {
  if !cfg!(target_os = "windows") {
    return Err(String::from("Native CPU model download is currently implemented for Windows only."));
  }

  let model_id = model_id.trim().to_string();
  let hf_url = hf_url.trim().to_string();
  if model_id.is_empty() {
    return Err(String::from("modelId cannot be empty."));
  }
  if hf_url.is_empty() {
    return Err(String::from("hfUrl cannot be empty."));
  }
  let hf_url = validated_download_url(&hf_url, "Model")?;

  let app_data_dir = app
    .path()
    .app_data_dir()
    .map_err(|error| format!("failed to resolve app data directory: {error}"))?;

  let models_dir = app_data_dir.join("llm").join("models");
  fs::create_dir_all(&models_dir)
    .map_err(|error| format!("failed to create model directory {}: {error}", models_dir.display()))?;

  let file_name = format!("{}.gguf", sanitize_filename(&model_id));
  let model_path = models_dir.join(file_name);

  if !model_path.exists() {
    let client = reqwest::blocking::Client::builder()
      .user_agent("MindScribe-Native-Model-Downloader/1.0")
      .build()
      .map_err(|error| format!("failed to initialize HTTP client: {error}"))?;

    let mut response = client
      .get(&hf_url)
      .send()
      .map_err(|error| format!("failed to download model from Hugging Face: {error}"))?;

    if !response.status().is_success() {
      return Err(format!(
        "model download failed with status {} from {}",
        response.status(),
        hf_url
      ));
    }

    let mut file = File::create(&model_path)
      .map_err(|error| format!("failed to create {}: {error}", model_path.display()))?;

    copy(&mut response, &mut file)
      .map_err(|error| format!("failed to write {}: {error}", model_path.display()))?;
  }

  let digest = compute_sha256(&model_path)?;
  let size_bytes = fs::metadata(&model_path)
    .map(|metadata| metadata.len())
    .map_err(|error| format!("failed to stat {}: {error}", model_path.display()))?;

  Ok(NativeModelDownloadResult {
    model_id,
    model_path: model_path.to_string_lossy().to_string(),
    sha256: digest,
    size_bytes,
  })
}

#[tauri::command]
pub fn native_inference_download_runtime(
  app: tauri::AppHandle,
  runtime_url: String,
) -> Result<NativeRuntimeDownloadResult, String> {
  if !cfg!(target_os = "windows") {
    return Err(String::from("Native CPU runtime download is currently implemented for Windows only."));
  }

  let runtime_url = runtime_url.trim().to_string();
  if runtime_url.is_empty() {
    return Err(String::from("runtimeUrl cannot be empty."));
  }
  let runtime_url = validated_download_url(&runtime_url, "Runtime")?;

  let app_data_dir = app
    .path()
    .app_data_dir()
    .map_err(|error| format!("failed to resolve app data directory: {error}"))?;

  let runtime_dir = app_data_dir.join("llm").join("runtime");
  fs::create_dir_all(&runtime_dir)
    .map_err(|error| format!("failed to create runtime directory {}: {error}", runtime_dir.display()))?;

  if let Some(existing_runtime) = find_runtime_executable_in_dir(&runtime_dir) {
    let digest = compute_sha256(&existing_runtime)?;
    let size_bytes = fs::metadata(&existing_runtime)
      .map(|metadata| metadata.len())
      .map_err(|error| format!("failed to stat {}: {error}", existing_runtime.display()))?;

    return Ok(NativeRuntimeDownloadResult {
      runtime_path: existing_runtime.to_string_lossy().to_string(),
      sha256: digest,
      size_bytes,
    });
  }

  let client = reqwest::blocking::Client::builder()
    .user_agent("MindScribe-Native-Runtime-Downloader/1.0")
    .build()
    .map_err(|error| format!("failed to initialize HTTP client: {error}"))?;

  let mut response = client
    .get(&runtime_url)
    .send()
    .map_err(|error| format!("failed to download runtime from URL: {error}"))?;

  if !response.status().is_success() {
    return Err(format!(
      "runtime download failed with status {} from {}",
      response.status(),
      runtime_url
    ));
  }

  let content_type = response
    .headers()
    .get(reqwest::header::CONTENT_TYPE)
    .and_then(|value| value.to_str().ok());
  let content_disposition = response
    .headers()
    .get(reqwest::header::CONTENT_DISPOSITION)
    .and_then(|value| value.to_str().ok());

  let runtime_path = if should_treat_runtime_download_as_zip(&runtime_url, content_type, content_disposition) {
    clear_directory_contents(&runtime_dir)?;

    let archive_path = runtime_dir.join("runtime-download.zip");
    let mut archive_file = File::create(&archive_path)
      .map_err(|error| format!("failed to create {}: {error}", archive_path.display()))?;

    copy(&mut response, &mut archive_file)
      .map_err(|error| format!("failed to write {}: {error}", archive_path.display()))?;

    extract_runtime_zip(&archive_path, &runtime_dir)?;
    let _ = fs::remove_file(&archive_path);

    find_runtime_executable_in_dir(&runtime_dir)
      .ok_or_else(|| String::from("runtime archive extracted but llama-cli.exe was not found."))?
  } else {
    let runtime_path = runtime_dir.join("native-runtime.exe");
    let mut file = File::create(&runtime_path)
      .map_err(|error| format!("failed to create {}: {error}", runtime_path.display()))?;

    copy(&mut response, &mut file)
      .map_err(|error| format!("failed to write {}: {error}", runtime_path.display()))?;

    runtime_path
  };

  let digest = compute_sha256(&runtime_path)?;
  let size_bytes = fs::metadata(&runtime_path)
    .map(|metadata| metadata.len())
    .map_err(|error| format!("failed to stat {}: {error}", runtime_path.display()))?;

  Ok(NativeRuntimeDownloadResult {
    runtime_path: runtime_path.to_string_lossy().to_string(),
    sha256: digest,
    size_bytes,
  })
}

#[tauri::command]
pub fn native_inference_status(
  model_id: Option<String>,
  model_path: Option<String>,
  runtime_path: Option<String>,
) -> NativeInferenceStatus {
  let selected_model_id = model_id.unwrap_or_default();

  if !cfg!(target_os = "windows") {
    return NativeInferenceStatus {
      available: false,
      runtime: String::new(),
      model: String::new(),
      selected_model_id,
        runtime_sha256: String::new(),
        model_sha256: String::new(),
        profile: String::new(),
        effective_threads: 0,
        max_tokens_cap: 0,
      reason: String::from("Native CPU inference is currently implemented for Windows only."),
    };
  }

  let runtime = match resolve_runtime_command(runtime_path.as_deref()) {
    Some(runtime) => runtime,
    None => {
      return NativeInferenceStatus {
        available: false,
        runtime: String::new(),
        model: String::new(),
        selected_model_id,
        runtime_sha256: String::new(),
        model_sha256: String::new(),
        profile: String::new(),
        effective_threads: 0,
        max_tokens_cap: 0,
        reason: String::from(
          "Native CPU runtime binary not found. Configure MINDSCRIBE_NATIVE_CPU_RUNTIME or bundle llama-cli.exe.",
        ),
      }
    }
  };

  let model = match resolve_model_path(
    model_path.as_deref(),
    if selected_model_id.is_empty() {
      None
    } else {
      Some(selected_model_id.as_str())
    },
  ) {
    Some(model) => model,
    None => {
      return NativeInferenceStatus {
        available: false,
        runtime: runtime.to_string_lossy().to_string(),
        model: String::new(),
        selected_model_id,
        runtime_sha256: String::new(),
        model_sha256: String::new(),
        profile: String::new(),
        effective_threads: 0,
        max_tokens_cap: 0,
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
        selected_model_id,
        runtime_sha256: String::new(),
        model_sha256: String::new(),
        profile: String::new(),
        effective_threads: 0,
        max_tokens_cap: 0,
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
        selected_model_id,
        runtime_sha256: runtime_hash,
        model_sha256: String::new(),
        profile: String::new(),
        effective_threads: 0,
        max_tokens_cap: 0,
        reason,
      }
    }
  };

  if let Err(reason) = verify_hash_if_required("runtime", &runtime_hash, expected_runtime_hash()) {
    return NativeInferenceStatus {
      available: false,
      runtime: runtime.to_string_lossy().to_string(),
      model: model.to_string_lossy().to_string(),
      selected_model_id,
      runtime_sha256: runtime_hash,
      model_sha256: model_hash,
      profile: String::new(),
      effective_threads: 0,
      max_tokens_cap: 0,
      reason,
    };
  }

  if let Err(reason) = verify_hash_if_required("model", &model_hash, expected_model_hash()) {
    return NativeInferenceStatus {
      available: false,
      runtime: runtime.to_string_lossy().to_string(),
      model: model.to_string_lossy().to_string(),
      selected_model_id,
      runtime_sha256: runtime_hash,
      model_sha256: model_hash,
      profile: String::new(),
      effective_threads: 0,
      max_tokens_cap: 0,
      reason,
    };
  }

  let runtime_config = build_runtime_config(None, None);

  NativeInferenceStatus {
    available: true,
    runtime: runtime.to_string_lossy().to_string(),
    model: model.to_string_lossy().to_string(),
    selected_model_id,
    runtime_sha256: runtime_hash,
    model_sha256: model_hash,
    profile: profile_name(&runtime_config.profile),
    effective_threads: runtime_config.threads,
    max_tokens_cap: profile_token_cap(&runtime_config.profile),
    reason: String::new(),
  }
}

#[tauri::command]
pub fn native_inference_generate(
  prompt: String,
  model_id: Option<String>,
  model_path: Option<String>,
  runtime_path: Option<String>,
  max_tokens: Option<u32>,
  temperature: Option<f32>,
) -> Result<String, String> {
  if prompt.trim().is_empty() {
    return Err(String::from("Prompt cannot be empty."));
  }

  let status = native_inference_status(model_id, model_path, runtime_path);
  if !status.available {
    return Err(status.reason);
  }

  let runtime = status.runtime;
  let model = status.model;
  let runtime_config = build_runtime_config(max_tokens, temperature);

  let mut cmd = Command::new(&runtime);
  cmd
    .arg("-m")
    .arg(model)
    .arg("-p")
    .arg(prompt)
    .arg("-n")
    .arg(runtime_config.max_tokens.to_string())
    .arg("--temp")
    .arg(format!("{:.2}", runtime_config.temperature))
    .arg("--threads")
    .arg(runtime_config.threads.to_string());

  append_native_gpu_args(&mut cmd, &runtime, &runtime_config);

  cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

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
  model_id: Option<String>,
  model_path: Option<String>,
  runtime_path: Option<String>,
  max_tokens: Option<u32>,
  temperature: Option<f32>,
) -> Result<bool, String> {
  if prompt.trim().is_empty() {
    return Err(String::from("Prompt cannot be empty."));
  }

  let runtime = resolve_runtime_command(runtime_path.as_deref())
    .ok_or_else(|| String::from("Native CPU runtime binary not found."))?
    .to_string_lossy()
    .to_string();
  let selected_model_id = model_id.unwrap_or_default();
  let model = resolve_model_path(
    model_path.as_deref(),
    if selected_model_id.is_empty() {
      None
    } else {
      Some(selected_model_id.as_str())
    },
  )
  .ok_or_else(|| String::from("Native CPU model file not found."))?
  .to_string_lossy()
  .to_string();
  let runtime_config = build_runtime_config(max_tokens, temperature);

  let mut cmd = Command::new(&runtime);
  cmd
    .arg("-m")
    .arg(model)
    .arg("-p")
    .arg(prompt)
    .arg("-n")
    .arg(runtime_config.max_tokens.to_string())
    .arg("--temp")
    .arg(format!("{:.2}", runtime_config.temperature))
    .arg("--threads")
    .arg(runtime_config.threads.to_string());

  append_native_gpu_args(&mut cmd, &runtime, &runtime_config);

  cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

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

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn sanitize_filename_replaces_unsafe_characters() {
    let value = "qwen2.5/1.5b:instruct?*";
    let sanitized = sanitize_filename(value);
    assert_eq!(sanitized, "qwen2.5_1.5b_instruct__");
  }

  #[test]
  fn sanitize_filename_uses_default_when_empty() {
    let sanitized = sanitize_filename("");
    assert_eq!(sanitized, "model");
  }

  #[test]
  fn host_allowed_accepts_exact_and_subdomain_matches() {
    let allowlist = vec![String::from("huggingface.co")];
    assert!(host_allowed("huggingface.co", &allowlist));
    assert!(host_allowed("cdn-lfs.huggingface.co", &allowlist));
    assert!(!host_allowed("evil-example.com", &allowlist));
  }

  #[test]
  fn validated_download_url_rejects_non_https_urls() {
    let result = validated_download_url("http://huggingface.co/model.gguf", "Model");
    assert!(result.is_err());
  }

  #[test]
  fn validated_download_url_accepts_default_allowlisted_hosts() {
    let result = validated_download_url("https://huggingface.co/file.gguf", "Model");
    assert!(result.is_ok());
  }

  #[test]
  fn validated_download_url_rejects_unknown_hosts() {
    let result = validated_download_url("https://example.com/file.gguf", "Model");
    assert!(result.is_err());
  }

  #[test]
  fn runtime_download_zip_detection_by_url() {
    assert!(should_treat_runtime_download_as_zip(
      "https://github.com/ggml-org/llama.cpp/releases/download/b123/llama-bin-win-cpu-x64.zip",
      None,
      None,
    ));
  }

  #[test]
  fn runtime_download_zip_detection_by_content_type() {
    assert!(should_treat_runtime_download_as_zip(
      "https://example.com/runtime",
      Some("application/zip"),
      None,
    ));
  }

  #[test]
  fn runtime_download_zip_detection_rejects_plain_exe() {
    assert!(!should_treat_runtime_download_as_zip(
      "https://example.com/native-runtime.exe",
      Some("application/octet-stream"),
      None,
    ));
  }

  #[test]
  fn output_has_nvidia_gpu_detects_vendor_name() {
    assert!(output_has_nvidia_gpu("NVIDIA GeForce RTX 3060"));
    assert!(output_has_nvidia_gpu("name\r\nNVIDIA RTX A4000"));
    assert!(!output_has_nvidia_gpu("Intel(R) UHD Graphics"));
  }
}
