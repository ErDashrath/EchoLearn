Offline voice model behavior

Current behavior:
- On first install/run, app can download missing voice models automatically (internet needed once).
- After models are cached, voice processing works offline.
- If local files are present, app uses local files first.

To run voice fully offline (no internet dependency), place model files in these folders:

1) Whisper STT (Transformers.js local model)
Folder: /public/models/transformers/onnx-community/whisper-tiny.en/
Required files (typical):
- config.json
- generation_config.json
- preprocessor_config.json
- tokenizer.json
- tokenizer_config.json
- onnx/model_quantized.onnx (or model.onnx depending on export)

2) Piper TTS voice models (local)
Folder: /public/models/piper/
For each voice id, add:
- <voice-id>.onnx
- <voice-id>.onnx.json

Example for Amy voice:
- /public/models/piper/en_US-amy-medium.onnx
- /public/models/piper/en_US-amy-medium.onnx.json

Current code uses these local paths only and disables remote model fetching.
