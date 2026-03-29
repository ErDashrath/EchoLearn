import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

const root = process.cwd();
const catalogPath = path.join(root, 'public', 'webllm-config.js');
const outputDir = path.join(root, 'src-tauri', 'resources', 'llm', 'models');
const dryRun = process.env.NATIVE_GGUF_DRY_RUN === '1';
const strict = process.env.NATIVE_GGUF_STRICT === '1';
const mode = (process.env.NATIVE_GGUF_DOWNLOAD_MODE || 'all').toLowerCase();
const includeIds = (process.env.NATIVE_GGUF_MODEL_IDS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

function sanitizeName(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function loadCatalog() {
  if (!fs.existsSync(catalogPath)) {
    throw new Error(`Catalog not found: ${catalogPath}`);
  }

  const scriptText = fs.readFileSync(catalogPath, 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(scriptText, sandbox, { filename: 'webllm-config.js' });

  const models = sandbox.window.__MINDSCRIBE_WEBLLM_MODELS__;
  if (!Array.isArray(models)) {
    throw new Error('window.__MINDSCRIBE_WEBLLM_MODELS__ is not an array.');
  }

  return models;
}

function pickModels(models) {
  const withNative = models.filter((model) => model?.native?.hfUrl);
  if (withNative.length === 0) {
    return [];
  }

  if (includeIds.length > 0) {
    return withNative.filter((model) => includeIds.includes(model.id));
  }

  if (mode === 'minimal') {
    const sorted = [...withNative].sort((a, b) => {
      const left = typeof a.sizeGB === 'number' ? a.sizeGB : Number.MAX_SAFE_INTEGER;
      const right = typeof b.sizeGB === 'number' ? b.sizeGB : Number.MAX_SAFE_INTEGER;
      return left - right;
    });
    return sorted.slice(0, 1);
  }

  return withNative;
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function downloadFile(url, outFile) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed download (${response.status}) ${url}`);
  }

  await ensureDir(path.dirname(outFile));

  const writable = fs.createWriteStream(outFile);
  await response.body.pipeTo(
    new WritableStream({
      write(chunk) {
        writable.write(Buffer.from(chunk));
      },
      close() {
        writable.end();
      },
      abort(error) {
        writable.destroy(error instanceof Error ? error : new Error(String(error)));
      },
    }),
  );
}

async function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function main() {
  const models = loadCatalog();
  const selected = pickModels(models);

  if (selected.length === 0) {
    console.log('[native-gguf] No native.hfUrl entries found in webllm-config.js.');
    return;
  }

  await ensureDir(outputDir);

  const map = {};
  const errors = [];

  for (const model of selected) {
    const targetFileName = `${sanitizeName(model.id)}.gguf`;
    const targetPath = path.join(outputDir, targetFileName);
    const url = model.native.hfUrl;

    try {
      if (dryRun) {
        console.log(`[native-gguf][dry-run] MLC id '${model.id}' -> GGUF '${url}' -> '${targetPath}'`);
      } else if (!fs.existsSync(targetPath)) {
        console.log(`[native-gguf] Downloading GGUF for MLC id '${model.id}'`);
        console.log(`[native-gguf] Source: ${url}`);
        console.log(`[native-gguf] Target: ${targetPath}`);
        await downloadFile(url, targetPath);
      } else {
        console.log(`[native-gguf] GGUF already exists for MLC id '${model.id}', skipping`);
      }

      map[model.id] = targetPath.replace(/\\/g, '/');

      if (!dryRun && process.env.NATIVE_GGUF_PRINT_HASH === '1') {
        const digest = await sha256(targetPath);
        console.log(`[native-gguf] sha256 ${model.id}: ${digest}`);
      }
    } catch (error) {
      const message = `${model.id}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(message);
      console.error(`[native-gguf] ${message}`);
    }
  }

  const mapPath = path.join(root, 'src-tauri', 'resources', 'llm', 'model-map.json');
  await ensureDir(path.dirname(mapPath));
  await fsp.writeFile(mapPath, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
  console.log(`[native-gguf] Wrote ${mapPath}`);

  if (errors.length > 0 && strict) {
    throw new Error(`Native GGUF download failed: ${errors.join('; ')}`);
  }
}

main().catch((error) => {
  console.error(`[native-gguf] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
