import { execSync } from 'child_process';
import fs from 'fs';
import JSZip from 'jszip';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const OUT_ZIP = path.join(ROOT_DIR, 'itch-bundle.zip');

function collectFiles(rootDir, currentDir, out) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(currentDir, entry.name);
    const rel = path.relative(rootDir, abs).split(path.sep).join('/');
    if (rel === 'assets/aistudio' || rel.startsWith('assets/aistudio/')) {
      continue;
    }
    if (entry.isDirectory()) {
      collectFiles(rootDir, abs, out);
    } else if (entry.isFile()) {
      out.push({ rel, abs });
    }
  }
}

export async function createItchZip(distDir = DIST_DIR, outPath = OUT_ZIP) {
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    throw new Error('dist/index.html bulunamadı. Önce npm run build çalıştırın.');
  }

  const files = [];
  collectFiles(distDir, distDir, files);

  const zip = new JSZip();
  const now = new Date();
  for (const f of files) {
    const data = fs.readFileSync(f.abs);
    zip.file(f.rel, data, {
      binary: true,
      date: now,
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });
  }

  const zipBuf = await zip.generateAsync({
    type: 'nodebuffer',
    platform: 'DOS',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  fs.writeFileSync(outPath, zipBuf);
  return { outPath, fileCount: files.length, bytes: zipBuf.length, files: files.map((f) => f.rel) };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isCli) {
  const skipBuild = process.argv.includes('--skip-build');
  if (!skipBuild) {
    console.log('[itch-package] Vite üretim derlemesi başlatılıyor...');
    execSync('npx vite build', { cwd: ROOT_DIR, stdio: 'inherit' });
  }
  const result = await createItchZip();
  const kb = (result.bytes / 1024).toFixed(1);
  console.log(`[itch-package] Hazır: ${result.outPath} (${result.fileCount} dosya, ${kb} KB)`);
}
