use std::{
  env,
  fs,
  io::Write,
  path::Path,
  path::PathBuf,
  process::Command,
  process::Stdio,
  time::{SystemTime, UNIX_EPOCH},
};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSttResult {
  pub text: String,
  pub confidence: f32,
  pub segments: usize,
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

fn whisper_cpp_bin_candidates() -> Vec<PathBuf> {
  let mut candidates = Vec::new();

  if let Ok(explicit) = env::var("MINDSCRIBE_WHISPER_CPP_BIN") {
    candidates.push(PathBuf::from(explicit));
  }

  candidates.push(PathBuf::from("src-tauri/bin/whisper-cli.exe"));
  candidates.push(PathBuf::from("src-tauri/bin/whisper/main.exe"));
  candidates.push(PathBuf::from("src-tauri/bin/whisper-cpp/main.exe"));

  if let Ok(exe) = env::current_exe() {
    if let Some(parent) = exe.parent() {
      candidates.push(parent.join("whisper-cli.exe"));
      candidates.push(parent.join("main.exe"));
      candidates.push(parent.join("whisper/main.exe"));
    }
  }

  candidates
}

fn whisper_cpp_model_candidates() -> Vec<PathBuf> {
  let mut candidates = Vec::new();

  if let Ok(explicit) = env::var("MINDSCRIBE_WHISPER_CPP_MODEL") {
    candidates.push(PathBuf::from(explicit));
  }

  candidates.push(PathBuf::from("public/models/whisper-cpp/ggml-tiny.en.bin"));
  candidates.push(PathBuf::from("public/models/whisper-cpp/ggml-small.en.bin"));
  candidates.push(PathBuf::from("public/models/whisper-cpp/ggml-base.en.bin"));
  candidates.push(PathBuf::from("src-tauri/resources/models/whisper-cpp/ggml-tiny.en.bin"));
  candidates.push(PathBuf::from("src-tauri/resources/models/whisper-cpp/ggml-small.en.bin"));
  candidates.push(PathBuf::from("src-tauri/resources/models/whisper-cpp/ggml-base.en.bin"));

  candidates
}

fn whisper_cpp_paths() -> Option<(PathBuf, PathBuf)> {
  let bin = if let Some(local_bin) = first_existing_path(&whisper_cpp_bin_candidates()) {
    local_bin
  } else if command_exists_in_path("whisper-cli.exe") {
    PathBuf::from("whisper-cli.exe")
  } else if command_exists_in_path("main.exe") {
    PathBuf::from("main.exe")
  } else {
    return None;
  };
  let model = first_existing_path(&whisper_cpp_model_candidates())?;
  Some((bin, model))
}

fn piper_bin_candidates() -> Vec<PathBuf> {
  let mut candidates = Vec::new();

  if let Ok(explicit) = env::var("MINDSCRIBE_PIPER_BIN") {
    candidates.push(PathBuf::from(explicit));
  }

  candidates.push(PathBuf::from("src-tauri/bin/piper/piper.exe"));
  candidates.push(PathBuf::from("bin/piper/piper.exe"));

  if let Ok(exe) = env::current_exe() {
    if let Some(parent) = exe.parent() {
      candidates.push(parent.join("piper.exe"));
      candidates.push(parent.join("piper").join("piper.exe"));
      candidates.push(parent.join("bin").join("piper").join("piper.exe"));
    }
  }

  candidates
}

fn piper_model_candidates(voice_id: &str) -> Vec<PathBuf> {
  let mut candidates = Vec::new();

  if let Ok(explicit_base) = env::var("MINDSCRIBE_PIPER_MODEL_DIR") {
    candidates.push(PathBuf::from(explicit_base).join(format!("{voice_id}.onnx")));
  }

  candidates.push(PathBuf::from(format!("public/models/piper/{voice_id}.onnx")));
  candidates.push(PathBuf::from(format!("../public/models/piper/{voice_id}.onnx")));
  candidates.push(PathBuf::from(format!("src-tauri/resources/models/piper/{voice_id}.onnx")));

  candidates
}

fn piper_model_config_candidates(voice_id: &str) -> Vec<PathBuf> {
  let mut candidates = Vec::new();

  if let Ok(explicit_base) = env::var("MINDSCRIBE_PIPER_MODEL_DIR") {
    candidates.push(PathBuf::from(explicit_base).join(format!("{voice_id}.onnx.json")));
  }

  candidates.push(PathBuf::from(format!(
    "public/models/piper/{voice_id}.onnx.json"
  )));
  candidates.push(PathBuf::from(format!(
    "../public/models/piper/{voice_id}.onnx.json"
  )));
  candidates.push(PathBuf::from(format!(
    "src-tauri/resources/models/piper/{voice_id}.onnx.json"
  )));

  candidates
}

fn piper_paths(voice_id: &str) -> Option<(PathBuf, PathBuf, PathBuf)> {
  let bin = first_existing_path(&piper_bin_candidates())?;
  let model = first_existing_path(&piper_model_candidates(voice_id))?;
  let config = first_existing_path(&piper_model_config_candidates(voice_id))?;
  Some((bin, model, config))
}

fn piper_espeak_data_candidates() -> Vec<PathBuf> {
  let mut candidates = Vec::new();

  if let Ok(explicit) = env::var("MINDSCRIBE_PIPER_ESPEAK_DATA") {
    candidates.push(PathBuf::from(explicit));
  }

  candidates.push(PathBuf::from("src-tauri/bin/piper/espeak-ng-data"));
  candidates.push(PathBuf::from("bin/piper/espeak-ng-data"));

  if let Ok(exe) = env::current_exe() {
    if let Some(parent) = exe.parent() {
      candidates.push(parent.join("espeak-ng-data"));
      candidates.push(parent.join("piper").join("espeak-ng-data"));
      candidates.push(parent.join("bin").join("piper").join("espeak-ng-data"));
    }
  }

  candidates
}

fn safe_stem_string(path: &Path) -> String {
  path
    .file_stem()
    .and_then(|stem| stem.to_str())
    .unwrap_or("mindscribe-whisper")
    .to_string()
}

fn temp_file_path(prefix: &str, extension: &str) -> Result<PathBuf, String> {
  let mut path = env::temp_dir();
  let ts = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map_err(|error| format!("failed to compute timestamp: {error}"))?
    .as_millis();
  path.push(format!("{prefix}-{ts}.{extension}"));
  Ok(path)
}

fn run_powershell(script: &str, envs: &[(&str, String)]) -> Result<String, String> {
  let mut cmd = Command::new("powershell");
  cmd
    .arg("-NoLogo")
    .arg("-NoProfile")
    .arg("-NonInteractive")
    .arg("-ExecutionPolicy")
    .arg("Bypass")
    .arg("-Command")
    .arg(script);

  for (key, value) in envs {
    cmd.env(key, value);
  }

  let output = cmd
    .output()
    .map_err(|error| format!("failed to launch powershell: {error}"))?;

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    return Err(if stderr.is_empty() {
      String::from("native voice powershell command failed")
    } else {
      stderr
    });
  }

  Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
pub fn native_voice_is_available() -> bool {
  cfg!(target_os = "windows")
}

#[tauri::command]
pub fn native_piper_is_available(voice_id: Option<String>) -> bool {
  if !cfg!(target_os = "windows") {
    return false;
  }

  let voice = voice_id.unwrap_or_else(|| String::from("en_US-amy-medium"));
  piper_paths(&voice).is_some()
}

#[tauri::command]
pub fn native_piper_tts(
  text: String,
  voice_id: Option<String>,
  speed: Option<f32>,
) -> Result<String, String> {
  #[cfg(not(target_os = "windows"))]
  {
    let _ = text;
    let _ = voice_id;
    let _ = speed;
    return Err(String::from("native Piper TTS is only implemented for Windows"));
  }

  #[cfg(target_os = "windows")]
  {
    let trimmed = text.trim().to_string();
    if trimmed.is_empty() {
      return Err(String::from("text cannot be empty"));
    }

    let selected_voice = voice_id.unwrap_or_else(|| String::from("en_US-amy-medium"));
    let (piper_bin, model_path, config_path) = piper_paths(&selected_voice)
      .ok_or_else(|| String::from("native Piper binary/model/config not found"))?;
    let espeak_data = first_existing_path(&piper_espeak_data_candidates());

    let out_wav = temp_file_path("mindscribe-piper-tts", "wav")?;

    let speed_value = speed.unwrap_or(0.9).clamp(0.6, 1.4);
    let length_scale = (1.0 / speed_value).clamp(0.6, 1.8);

    let mut command = Command::new(&piper_bin);
    command
      .arg("--model")
      .arg(&model_path)
      .arg("--config")
      .arg(&config_path)
      .arg("--output_file")
      .arg(&out_wav)
      .arg("--length_scale")
      .arg(format!("{length_scale:.3}"))
      .arg("--sentence_silence")
      .arg("0.12")
      .arg("--quiet")
      .stdin(Stdio::piped())
      .stdout(Stdio::piped())
      .stderr(Stdio::piped());

    if let Some(path) = espeak_data {
      command.arg("--espeak_data").arg(path);
    }

    let mut child = command
      .spawn()
      .map_err(|error| format!("failed to launch native Piper: {error}"))?;

    if let Some(mut stdin) = child.stdin.take() {
      stdin
        .write_all(trimmed.as_bytes())
        .map_err(|error| format!("failed to write text to Piper stdin: {error}"))?;
      stdin
        .write_all(b"\n")
        .map_err(|error| format!("failed to finalize Piper stdin: {error}"))?;
    }

    let output = child
      .wait_with_output()
      .map_err(|error| format!("failed waiting for Piper process: {error}"))?;

    if !output.status.success() {
      let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
      let _ = fs::remove_file(&out_wav);
      return Err(if stderr.is_empty() {
        String::from("native Piper synthesis failed")
      } else {
        stderr
      });
    }

    let bytes = fs::read(&out_wav).map_err(|error| format!("failed to read Piper wav: {error}"))?;
    let _ = fs::remove_file(&out_wav);
    Ok(STANDARD.encode(bytes))
  }
}

#[tauri::command]
pub fn native_whisper_cpp_is_available() -> bool {
  if !cfg!(target_os = "windows") {
    return false;
  }

  whisper_cpp_paths().is_some()
}

#[tauri::command]
pub fn native_whisper_cpp_transcribe_wav_base64(wav_base64: String) -> Result<String, String> {
  #[cfg(not(target_os = "windows"))]
  {
    let _ = wav_base64;
    return Err(String::from("whisper.cpp transcription is only implemented for Windows"));
  }

  #[cfg(target_os = "windows")]
  {
    let thread_count = env::var("MINDSCRIBE_WHISPER_CPP_THREADS")
      .ok()
      .and_then(|value| value.parse::<usize>().ok())
      .filter(|value| *value > 0)
      .unwrap_or_else(|| {
        std::thread::available_parallelism()
          .map(|value| value.get().min(6))
          .unwrap_or(4)
      });

    let (bin_path, model_path) =
      whisper_cpp_paths().ok_or_else(|| String::from("whisper.cpp binary/model not found"))?;

    let audio_bytes = STANDARD
      .decode(wav_base64.trim())
      .map_err(|error| format!("failed to decode wav payload: {error}"))?;
    if audio_bytes.is_empty() {
      return Ok(String::new());
    }

    let wav_path = temp_file_path("mindscribe-whispercpp-input", "wav")?;
    fs::write(&wav_path, audio_bytes)
      .map_err(|error| format!("failed to write whisper.cpp wav file: {error}"))?;

    let out_prefix = temp_file_path("mindscribe-whispercpp-out", "txt")?;
    let out_prefix_stem = out_prefix.with_file_name(safe_stem_string(&out_prefix));
    let out_txt_path = out_prefix_stem.with_extension("txt");

    let output = Command::new(&bin_path)
      .arg("-m")
      .arg(&model_path)
      .arg("-t")
      .arg(thread_count.to_string())
      .arg("-f")
      .arg(&wav_path)
      .arg("-l")
      .arg("en")
      .arg("-nf")
      .arg("-sns")
      .arg("-nth")
      .arg("0.92")
      .arg("-lpt")
      .arg("-0.20")
      .arg("-wt")
      .arg("0.25")
      .arg("--suppress-regex")
      .arg("(subscribe|subtitles|thanks for watching|show video|watching)")
      .arg("-otxt")
      .arg("-of")
      .arg(&out_prefix_stem)
      .arg("-np")
      .output()
      .map_err(|error| format!("failed to run whisper.cpp: {error}"))?;

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !output.status.success() {
      let _ = fs::remove_file(&wav_path);
      let _ = fs::remove_file(&out_txt_path);
      return Err(if stderr.is_empty() {
        String::from("whisper.cpp command failed")
      } else {
        stderr
      });
    }

    let transcript = fs::read_to_string(&out_txt_path)
      .map(|raw| raw.trim().to_string())
      .unwrap_or_default();

    let _ = fs::remove_file(&wav_path);
    let _ = fs::remove_file(&out_txt_path);

    Ok(transcript)
  }
}

#[tauri::command]
pub fn native_voice_tts(
  text: String,
  voice_hint: Option<String>,
  rate: Option<f32>,
  volume: Option<f32>,
) -> Result<String, String> {
  #[cfg(not(target_os = "windows"))]
  {
    let _ = text;
    let _ = voice_hint;
    let _ = rate;
    let _ = volume;
    return Err(String::from("native voice TTS is only implemented for Windows"));
  }

  #[cfg(target_os = "windows")]
  {
    let trimmed = text.trim().to_string();
    if trimmed.is_empty() {
      return Err(String::from("text cannot be empty"));
    }

    let out_wav = temp_file_path("mindscribe-tts", "wav")?;
    let out_wav_str = out_wav.to_string_lossy().to_string();

    let rate_value = rate.unwrap_or(1.0).clamp(0.5, 2.0);
    let volume_value = volume.unwrap_or(0.85).clamp(0.0, 1.0);
    let sapi_rate = ((rate_value - 1.0) * 10.0).round().clamp(-10.0, 10.0) as i32;
    let sapi_volume = (volume_value * 100.0).round().clamp(0.0, 100.0) as i32;

    let script = r#"
Add-Type -AssemblyName System.Speech

$text = $env:MINDSCRIBE_TTS_TEXT
$voiceHint = $env:MINDSCRIBE_TTS_VOICE_HINT
$rate = [int]$env:MINDSCRIBE_TTS_RATE
$volume = [int]$env:MINDSCRIBE_TTS_VOLUME
$wavPath = $env:MINDSCRIBE_TTS_WAV_PATH

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = $rate
$synth.Volume = $volume

if ($voiceHint -and $voiceHint.Length -gt 0) {
  $candidate = $synth.GetInstalledVoices() |
    ForEach-Object { $_.VoiceInfo } |
    Where-Object { $_.Name -like "*$voiceHint*" -or $_.Culture.Name -like "*$voiceHint*" } |
    Select-Object -First 1
  if ($candidate) {
    $synth.SelectVoice($candidate.Name)
  }
}

$synth.SetOutputToWaveFile($wavPath)
$synth.Speak($text)
$synth.Dispose()

$bytes = [System.IO.File]::ReadAllBytes($wavPath)
[System.Convert]::ToBase64String($bytes)
"#;

    let result = run_powershell(
      script,
      &[
        ("MINDSCRIBE_TTS_TEXT", trimmed),
        (
          "MINDSCRIBE_TTS_VOICE_HINT",
          voice_hint.unwrap_or_else(String::new),
        ),
        ("MINDSCRIBE_TTS_RATE", sapi_rate.to_string()),
        ("MINDSCRIBE_TTS_VOLUME", sapi_volume.to_string()),
        ("MINDSCRIBE_TTS_WAV_PATH", out_wav_str.clone()),
      ],
    );

    let _ = fs::remove_file(&out_wav);
    result
  }
}

#[tauri::command]
pub fn native_voice_transcribe_wav_base64(
  wav_base64: String,
  locale: Option<String>,
) -> Result<NativeSttResult, String> {
  #[cfg(not(target_os = "windows"))]
  {
    let _ = wav_base64;
    let _ = locale;
    return Err(String::from("native voice STT is only implemented for Windows"));
  }

  #[cfg(target_os = "windows")]
  {
    let audio_bytes = STANDARD
      .decode(wav_base64.trim())
      .map_err(|error| format!("failed to decode wav payload: {error}"))?;
    if audio_bytes.is_empty() {
      return Ok(NativeSttResult {
        text: String::new(),
        confidence: 0.0,
        segments: 0,
      });
    }

    let wav_path = temp_file_path("mindscribe-stt", "wav")?;
    fs::write(&wav_path, audio_bytes)
      .map_err(|error| format!("failed to write temp wav: {error}"))?;

    let script = r#"
Add-Type -AssemblyName System.Speech

$wavPath = $env:MINDSCRIBE_STT_WAV_PATH
$locale = if ($env:MINDSCRIBE_STT_LOCALE) { $env:MINDSCRIBE_STT_LOCALE } else { "en-US" }

$culture = [System.Globalization.CultureInfo]::GetCultureInfo($locale)
$recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine($culture)
$recognizer.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
$recognizer.SetInputToWaveFile($wavPath)

$parts = New-Object System.Collections.Generic.List[string]
$confidences = New-Object System.Collections.Generic.List[double]
while ($true) {
  $result = $recognizer.Recognize()
  if ($null -eq $result) { break }
  if ($result.Text) {
    $parts.Add($result.Text)
    $confidences.Add([double]$result.Confidence)
  }
}

$recognizer.Dispose()

$avgConfidence = 0.0
if ($confidences.Count -gt 0) {
  $avgConfidence = ($confidences | Measure-Object -Average).Average
}

[PSCustomObject]@{
  text = ($parts -join " ").Trim()
  confidence = [math]::Round([double]$avgConfidence, 4)
  segments = $parts.Count
} | ConvertTo-Json -Compress
"#;

    let output = run_powershell(
      script,
      &[
        (
          "MINDSCRIBE_STT_WAV_PATH",
          wav_path.to_string_lossy().to_string(),
        ),
        (
          "MINDSCRIBE_STT_LOCALE",
          locale.unwrap_or_else(|| String::from("en-US")),
        ),
      ],
    );

    let _ = fs::remove_file(&wav_path);
    let parsed = serde_json::from_str::<NativeSttResult>(&output?)
      .map_err(|error| format!("failed to parse native stt json: {error}"))?;
    Ok(parsed)
  }
}
