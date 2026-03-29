mod device_store;
mod memory_store;
mod native_inference;
mod voice_native;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
      }
    }))
    .manage(device_store::DeviceStoreState::default())
    .manage(memory_store::MemoryStoreState::default())
    .invoke_handler(tauri::generate_handler![
      device_store::device_store_get,
      device_store::device_store_set,
      device_store::device_store_delete,
      device_store::device_store_clear,
      device_store::device_store_keys,
      device_store::device_store_entries,
      memory_store::get_user_memory_records,
      memory_store::upsert_memory_records,
      memory_store::delete_memory_records_by_prefixes,
      native_inference::native_inference_status,
      native_inference::native_inference_has_nvidia_gpu,
      native_inference::native_inference_download_model,
      native_inference::native_inference_download_runtime,
      native_inference::native_inference_generate,
      native_inference::native_inference_generate_stream,
      native_inference::native_inference_stop,
      voice_native::native_voice_is_available,
      voice_native::native_piper_is_available,
      voice_native::native_piper_tts,
      voice_native::native_whisper_cpp_is_available,
      voice_native::native_whisper_cpp_transcribe_wav_base64,
      voice_native::native_voice_tts,
      voice_native::native_voice_transcribe_wav_base64,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
