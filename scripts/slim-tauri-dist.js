import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..');
const distDir = path.join(repoRoot, 'dist');

const OPTIONAL_HEAVY_PATHS = [
  path.join(distDir, 'models'),
];

function formatMB(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFolderSize(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return 0;
  }

  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    return stat.size;
  }

  let total = 0;
  for (const entry of fs.readdirSync(targetPath)) {
    total += getFolderSize(path.join(targetPath, entry));
  }
  return total;
}

function removePath(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return { removed: false, bytes: 0 };
  }

  const bytes = getFolderSize(targetPath);
  fs.rmSync(targetPath, { recursive: true, force: true });
  return { removed: true, bytes };
}

function run() {
  if (!fs.existsSync(distDir)) {
    console.log('[slim-tauri-dist] dist folder not found, skipping.');
    return;
  }

  let removedTotal = 0;

  console.log('[slim-tauri-dist] Removing optional heavy assets from dist for desktop bundle...');
  for (const targetPath of OPTIONAL_HEAVY_PATHS) {
    const { removed, bytes } = removePath(targetPath);
    if (removed) {
      removedTotal += bytes;
      console.log(`  - removed ${path.relative(repoRoot, targetPath)} (${formatMB(bytes)})`);
    } else {
      console.log(`  - skipped ${path.relative(repoRoot, targetPath)} (not present)`);
    }
  }

  console.log(`[slim-tauri-dist] Total removed: ${formatMB(removedTotal)}`);
  console.log('[slim-tauri-dist] Note: Models will download on first use and then be cached locally.');
}

run();
