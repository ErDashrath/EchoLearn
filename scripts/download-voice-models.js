/**
 * Post-install script to pre-download voice models for offline-first desktop usage.
 *
 * - Whisper tiny.en files for local STT model loading
 * - Piper voice ONNX + config files for local TTS model loading
 *
 * Notes:
 * - This script is best-effort by default and will not fail installation on network issues.
 * - Set STRICT_VOICE_MODEL_DOWNLOAD=1 to fail on missing required assets.
 * - Set SKIP_VOICE_MODEL_DOWNLOAD=1 to skip this script entirely.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..');

const STRICT_MODE = process.env.STRICT_VOICE_MODEL_DOWNLOAD === '1';
const SKIP_DOWNLOAD = process.env.SKIP_VOICE_MODEL_DOWNLOAD === '1';

const whisperBaseLocal = path.join(
  repoRoot,
  'public',
  'models',
  'transformers',
  'onnx-community',
  'whisper-tiny.en',
);

const piperBaseLocal = path.join(repoRoot, 'public', 'models', 'piper');

const whisperRepo = 'onnx-community/whisper-tiny.en';
const hfResolve = (repo, file) => `https://huggingface.co/${repo}/resolve/main/${file}`;

const whisperRequiredFiles = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'normalizer.json',
  'special_tokens_map.json',
  'merges.txt',
  'vocab.json',
  'added_tokens.json',
  'tokenizer.json',
  'tokenizer_config.json',
];

const whisperModelBundles = [
  [
    'onnx/encoder_model_quantized.onnx',
    'onnx/decoder_model_merged_quantized.onnx',
  ],
  [
    'onnx/encoder_model_int8.onnx',
    'onnx/decoder_model_merged_int8.onnx',
  ],
  [
    'onnx/encoder_model.onnx',
    'onnx/decoder_model_merged.onnx',
  ],
];

const piperVoices = [
  { id: 'en_US-amy-medium', modelPath: 'en/en_US/amy/medium/en_US-amy-medium.onnx' },
  { id: 'en_GB-jenny_dioco-medium', modelPath: 'en/en_GB/jenny_dioco/medium/en_GB-jenny_dioco-medium.onnx' },
  { id: 'en_US-lessac-medium', modelPath: 'en/en_US/lessac/medium/en_US-lessac-medium.onnx' },
  { id: 'en_US-joe-medium', modelPath: 'en/en_US/joe/medium/en_US-joe-medium.onnx' },
  { id: 'en_GB-alan-medium', modelPath: 'en/en_GB/alan/medium/en_GB-alan-medium.onnx' },
];

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function fileExists(filePath) {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function downloadFile(url, destinationPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await fs.promises.writeFile(destinationPath, buffer);
}

async function downloadIfMissing(url, destinationPath, label) {
  if (await fileExists(destinationPath)) {
    console.log(`  - ${label}: already present`);
    return { ok: true, downloaded: false };
  }

  await ensureDir(path.dirname(destinationPath));
  await downloadFile(url, destinationPath);
  console.log(`  - ${label}: downloaded`);
  return { ok: true, downloaded: true };
}

async function prepareWhisperAssets() {
  console.log('🎙️  Preparing Whisper offline assets...');
  const failures = [];

  for (const file of whisperRequiredFiles) {
    const url = hfResolve(whisperRepo, file);
    const dest = path.join(whisperBaseLocal, file);
    try {
      await downloadIfMissing(url, dest, `Whisper ${file}`);
    } catch (error) {
      // Some token files can be absent depending on model revision.
      if (['added_tokens.json', 'normalizer.json'].includes(file)) {
        console.warn(`  - Whisper ${file}: optional file missing`);
      } else {
        failures.push(`Whisper ${file}: ${error.message}`);
      }
    }
  }

  let modelReady = false;
  for (const bundle of whisperModelBundles) {
    const bundleErrors = [];

    for (const modelFile of bundle) {
      const dest = path.join(whisperBaseLocal, modelFile);
      const url = hfResolve(whisperRepo, modelFile);
      try {
        await downloadIfMissing(url, dest, `Whisper ${modelFile}`);
      } catch (error) {
        bundleErrors.push(`${modelFile}: ${error.message}`);
      }
    }

    if (bundleErrors.length === 0) {
      modelReady = true;
      break;
    }
  }

  if (!modelReady) {
    failures.push('Whisper model bundle: no supported ONNX encoder/decoder bundle could be downloaded.');
  }

  return failures;
}

async function resolvePiperBaseUrl() {
  // Keep this explicit to avoid module-format warnings in postinstall.
  return 'https://huggingface.co/rhasspy/piper-voices/resolve/main/';
}

async function preparePiperAssets() {
  console.log('🔊 Preparing Piper offline voice assets...');
  const failures = [];
  const piperBase = await resolvePiperBaseUrl();

  for (const voice of piperVoices) {
    const onnxUrl = `${piperBase}${voice.modelPath}`;
    const jsonUrl = `${piperBase}${voice.modelPath}.json`;

    const onnxDest = path.join(piperBaseLocal, `${voice.id}.onnx`);
    const jsonDest = path.join(piperBaseLocal, `${voice.id}.onnx.json`);

    try {
      await downloadIfMissing(onnxUrl, onnxDest, `Piper ${voice.id}.onnx`);
    } catch (error) {
      failures.push(`Piper ${voice.id}.onnx: ${error.message}`);
    }

    try {
      await downloadIfMissing(jsonUrl, jsonDest, `Piper ${voice.id}.onnx.json`);
    } catch (error) {
      failures.push(`Piper ${voice.id}.onnx.json: ${error.message}`);
    }
  }

  return failures;
}

async function main() {
  if (SKIP_DOWNLOAD) {
    console.log('⏭️  SKIP_VOICE_MODEL_DOWNLOAD=1, skipping model download.');
    return;
  }

  console.log('📦 Downloading voice models for offline-ready install...');

  const failures = [
    ...(await prepareWhisperAssets()),
    ...(await preparePiperAssets()),
  ];

  if (failures.length > 0) {
    console.warn('\n⚠️  Some voice assets could not be downloaded:');
    failures.forEach((line) => console.warn(`  - ${line}`));

    if (STRICT_MODE) {
      console.error('\n❌ STRICT_VOICE_MODEL_DOWNLOAD=1 and required assets are missing.');
      process.exit(1);
    }

    console.warn('\nInstall completed, but app may need internet on first voice use for missing assets.');
    return;
  }

  console.log('\n✅ Voice assets prepared. App can run voice offline after install.');
}

main().catch((error) => {
  console.error('❌ Voice model download script failed:', error.message);
  if (STRICT_MODE) {
    process.exit(1);
  }
});
