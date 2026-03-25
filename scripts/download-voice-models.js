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
import os from 'os';
import { spawn } from 'child_process';
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
const whisperCppBaseLocal = path.join(repoRoot, 'public', 'models', 'whisper-cpp');
const whisperCppBinDir = path.join(repoRoot, 'src-tauri', 'bin', 'whisper');
const piperBinDir = path.join(repoRoot, 'src-tauri', 'bin', 'piper');

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

async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'ignore',
      shell: false,
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });
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

async function prepareWhisperCppAssets() {
  console.log('🧠 Preparing Whisper.cpp GGML assets...');
  const failures = [];

  const modelCandidates = [
    {
      file: 'ggml-tiny.en.bin',
      url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
    },
    {
      file: 'ggml-small.en.bin',
      url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin',
    },
    {
      file: 'ggml-base.en.bin',
      url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
    },
  ];

  let downloadedAny = false;
  for (const candidate of modelCandidates) {
    const dest = path.join(whisperCppBaseLocal, candidate.file);
    try {
      await downloadIfMissing(candidate.url, dest, `Whisper.cpp ${candidate.file}`);
      downloadedAny = true;
      break;
    } catch (error) {
      failures.push(`Whisper.cpp ${candidate.file}: ${error.message}`);
    }
  }

  if (!downloadedAny) {
    failures.push('Whisper.cpp model: no GGML English model could be downloaded.');
  }

  return failures;
}

async function prepareWhisperCppBinary() {
  if (process.platform !== 'win32') {
    return [];
  }

  console.log('⚙️  Preparing Whisper.cpp Windows binary...');
  const failures = [];

  const preferredBinary = path.join(whisperCppBinDir, 'whisper-cli.exe');
  const alternateBinary = path.join(whisperCppBinDir, 'main.exe');
  if ((await fileExists(preferredBinary)) || (await fileExists(alternateBinary))) {
    console.log('  - Whisper.cpp binary: already present');
    return failures;
  }

  const zipUrl = 'https://github.com/ggml-org/whisper.cpp/releases/latest/download/whisper-bin-x64.zip';
  const tempZip = path.join(os.tmpdir(), 'mindscribe-whisper-bin-x64.zip');
  const extractDir = path.join(os.tmpdir(), `mindscribe-whisper-extract-${Date.now()}`);

  try {
    await ensureDir(path.dirname(tempZip));
    await downloadFile(zipUrl, tempZip);
    await ensureDir(extractDir);

    await runCommand('powershell', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Expand-Archive -Path \"${tempZip}\" -DestinationPath \"${extractDir}\" -Force`,
    ]);

    await ensureDir(whisperCppBinDir);
    const extractedEntries = await fs.promises.readdir(extractDir, { withFileTypes: true });

    for (const entry of extractedEntries) {
      const sourcePath = path.join(extractDir, entry.name);
      if (entry.isDirectory()) {
        const nestedFiles = await fs.promises.readdir(sourcePath, { withFileTypes: true });
        for (const nestedEntry of nestedFiles) {
          if (!nestedEntry.isFile()) continue;
          const nestedSource = path.join(sourcePath, nestedEntry.name);
          const dest = path.join(whisperCppBinDir, nestedEntry.name);
          await fs.promises.copyFile(nestedSource, dest);
        }
      } else if (entry.isFile()) {
        const dest = path.join(whisperCppBinDir, entry.name);
        await fs.promises.copyFile(sourcePath, dest);
      }
    }

    if ((await fileExists(preferredBinary)) || (await fileExists(alternateBinary))) {
      console.log('  - Whisper.cpp binary: downloaded and extracted');
    } else {
      failures.push('Whisper.cpp binary: extraction finished but executable not found.');
    }
  } catch (error) {
    failures.push(`Whisper.cpp binary: ${error.message}`);
  } finally {
    try {
      await fs.promises.rm(tempZip, { force: true });
      await fs.promises.rm(extractDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  }

  return failures;
}

async function prepareNativePiperBinary() {
  if (process.platform !== 'win32') {
    return [];
  }

  console.log('🎛️  Preparing Native Piper Windows binary...');
  const failures = [];

  const piperExe = path.join(piperBinDir, 'piper.exe');
  if (await fileExists(piperExe)) {
    console.log('  - Native Piper binary: already present');
    return failures;
  }

  const zipUrl = 'https://github.com/rhasspy/piper/releases/latest/download/piper_windows_amd64.zip';
  const tempZip = path.join(os.tmpdir(), 'mindscribe-piper-windows-amd64.zip');
  const extractDir = path.join(os.tmpdir(), `mindscribe-piper-extract-${Date.now()}`);

  try {
    await downloadFile(zipUrl, tempZip);
    await ensureDir(extractDir);

    await runCommand('powershell', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Expand-Archive -Path \"${tempZip}\" -DestinationPath \"${extractDir}\" -Force`,
    ]);

    await ensureDir(piperBinDir);
    const extractedEntries = await fs.promises.readdir(extractDir, { withFileTypes: true });
    for (const entry of extractedEntries) {
      const sourcePath = path.join(extractDir, entry.name);
      if (entry.isDirectory()) {
        const nestedFiles = await fs.promises.readdir(sourcePath, { withFileTypes: true });
        for (const nestedEntry of nestedFiles) {
          if (!nestedEntry.isFile() && !nestedEntry.isDirectory()) continue;
          const nestedSource = path.join(sourcePath, nestedEntry.name);
          const nestedDest = path.join(piperBinDir, nestedEntry.name);
          if (nestedEntry.isDirectory()) {
            await fs.promises.cp(nestedSource, nestedDest, { recursive: true, force: true });
          } else {
            await fs.promises.copyFile(nestedSource, nestedDest);
          }
        }
      } else if (entry.isFile()) {
        const dest = path.join(piperBinDir, entry.name);
        await fs.promises.copyFile(sourcePath, dest);
      }
    }

    if (await fileExists(piperExe)) {
      console.log('  - Native Piper binary: downloaded and extracted');
    } else {
      failures.push('Native Piper binary: extraction finished but piper.exe was not found.');
    }
  } catch (error) {
    failures.push(`Native Piper binary: ${error.message}`);
  } finally {
    try {
      await fs.promises.rm(tempZip, { force: true });
      await fs.promises.rm(extractDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
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
    ...(await prepareWhisperCppAssets()),
    ...(await prepareWhisperCppBinary()),
    ...(await prepareNativePiperBinary()),
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
