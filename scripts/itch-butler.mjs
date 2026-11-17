import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createItchZip } from './itch-package.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PKG_JSON = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));

function parseArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  const eq = process.argv.find((a) => a.startsWith(`${flag}=`));
  return eq ? eq.slice(flag.length + 1) : '';
}

function hasButler() {
  try {
    execFileSync('butler', ['-V'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const target = parseArg('--target') || process.env.ITCH_TARGET || '';
  const userVersion = parseArg('--version') || process.env.ITCH_VERSION || PKG_JSON.version || '1.0.0';
  const dryRun = process.argv.includes('--dry-run');

  console.log('[itch-butler] 1/3 Oyun derleniyor (vite build)...');
  execSync('npx vite build', { cwd: ROOT_DIR, stdio: 'inherit' });

  console.log('[itch-butler] 2/3 itch-bundle.zip oluşturuluyor...');
  const pkg = await createItchZip(DIST_DIR, path.join(ROOT_DIR, 'itch-bundle.zip'));
  console.log(`[itch-butler] Paket hazır (${pkg.fileCount} dosya, ${(pkg.bytes / 1024).toFixed(1)} KB).`);

  if (!target) {
    console.error(
      '\n[itch-butler] Hedef belirtilmedi. Örnek kullanım:\n' +
        '  ITCH_TARGET="kullaniciadi/harekat-kanyon:html5" npm run itch:push\n' +
        'veya:\n' +
        '  npm run itch:push -- --target kullaniciadi/harekat-kanyon:html5\n'
    );
    process.exit(1);
  }

  const args = ['push', pkg.outPath, target, '--userversion', userVersion];
  if (dryRun) {
    console.log(`[itch-butler] Dry-run komutu: butler ${args.join(' ')}`);
    return;
  }

  if (!hasButler()) {
    console.error(
      '\n[itch-butler] "butler" CLI sistemde bulunamadı.\n' +
        '1) Butler indirin: https://itch.io/docs/butler/installing.html\n' +
        '2) Giriş yapın: butler login (veya BUTLER_API_KEY env değişkeni ayarlayın)\n' +
        `3) Ardından çalıştırın: butler ${args.join(' ')}\n`
    );
    process.exit(1);
  }

  console.log(`[itch-butler] 3/3 itch.io'ya yükleniyor -> ${target} (v${userVersion})...`);
  execFileSync('butler', args, { cwd: ROOT_DIR, stdio: 'inherit' });
  console.log('[itch-butler] Yükleme başarıyla tamamlandı!');
}

main();
