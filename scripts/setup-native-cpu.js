import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();

const runtimePath = process.env.MINDSCRIBE_NATIVE_CPU_RUNTIME
  ? path.resolve(process.env.MINDSCRIBE_NATIVE_CPU_RUNTIME)
  : path.join(root, 'src-tauri', 'bin', 'llm', 'llama-cli.exe');

const modelPath = process.env.MINDSCRIBE_NATIVE_CPU_MODEL
  ? path.resolve(process.env.MINDSCRIBE_NATIVE_CPU_MODEL)
  : path.join(root, 'src-tauri', 'bin', 'llm', 'models', 'chat.gguf');

const runtimeDownloadUrl = process.env.NATIVE_CPU_RUNTIME_URL || '';
const modelDownloadUrl =
  process.env.NATIVE_CPU_GGUF_URL ||
  'https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf?download=true';

async function ensureDirFor(filePath) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
}

async function fileExists(filePath) {
  try {
    await fsp.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function downloadFile(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}) from ${url}`);
  }

  await ensureDirFor(outputPath);

  await new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(outputPath);
    response.body.pipeTo(
      new WritableStream({
        write(chunk) {
          stream.write(Buffer.from(chunk));
        },
        close() {
          stream.end();
          resolve();
        },
        abort(err) {
          stream.destroy(err instanceof Error ? err : new Error(String(err)));
          reject(err);
        },
      }),
    ).catch(reject);
  });
}

async function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function printVar(name, value) {
  console.log(`${name}=${value}`);
}

async function main() {
  console.log('Preparing native CPU assets for llama.cpp runtime + GGUF model...');
  console.log('Note: WebLLM uses MLC artifacts; native CPU requires GGUF.');

  if (!(await fileExists(modelPath))) {
    console.log(`Model not found at ${modelPath}`);
    console.log(`Downloading GGUF model from ${modelDownloadUrl}`);
    await downloadFile(modelDownloadUrl, modelPath);
  }

  if (!(await fileExists(runtimePath))) {
    if (!runtimeDownloadUrl) {
      throw new Error(
        [
          `Runtime not found at ${runtimePath}`,
          'Set MINDSCRIBE_NATIVE_CPU_RUNTIME to an existing llama-cli.exe,',
          'or provide NATIVE_CPU_RUNTIME_URL to auto-download a runtime binary.',
        ].join(' '),
      );
    }

    console.log(`Runtime not found. Downloading from ${runtimeDownloadUrl}`);
    await downloadFile(runtimeDownloadUrl, runtimePath);
  }

  const runtimeHash = await sha256(runtimePath);
  const modelHash = await sha256(modelPath);

  console.log('\nNative CPU assets are ready:');
  printVar('MINDSCRIBE_NATIVE_CPU_RUNTIME', runtimePath);
  printVar('MINDSCRIBE_NATIVE_CPU_MODEL', modelPath);
  printVar('MINDSCRIBE_NATIVE_CPU_RUNTIME_SHA256', runtimeHash);
  printVar('MINDSCRIBE_NATIVE_CPU_MODEL_SHA256', modelHash);

  console.log('\nPowerShell (current session):');
  console.log(`$env:MINDSCRIBE_NATIVE_CPU_RUNTIME = \"${runtimePath}\"`);
  console.log(`$env:MINDSCRIBE_NATIVE_CPU_MODEL = \"${modelPath}\"`);
  console.log(`$env:MINDSCRIBE_NATIVE_CPU_RUNTIME_SHA256 = \"${runtimeHash}\"`);
  console.log(`$env:MINDSCRIBE_NATIVE_CPU_MODEL_SHA256 = \"${modelHash}\"`);
  console.log('$env:MINDSCRIBE_NATIVE_CPU_REQUIRE_HASHES = "true"');

  console.log('\nTip: set MINDSCRIBE_NATIVE_CPU_MODEL_DIR to scan a folder for any .gguf model.');
}

main().catch((error) => {
  console.error(`native CPU setup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
