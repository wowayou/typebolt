// Build dist/typebolt-<version>.zip containing only what the Chrome Web Store needs.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const out = path.join(root, 'dist', `typebolt-${manifest.version}.zip`);

mkdirSync(path.dirname(out), { recursive: true });
if (existsSync(out)) rmSync(out);

const include = ['manifest.json', '_locales', 'icons', 'src', 'LICENSE'];
execFileSync('zip', ['-X', '-r', '-q', out, ...include, '-x', '*.DS_Store'], { cwd: root, stdio: 'inherit' });

// Sanity check: every file the manifest references must be inside the archive.
const listing = execFileSync('unzip', ['-Z1', out], { encoding: 'utf8' }).split('\n').filter(Boolean);
const referenced = [
  manifest.background.service_worker,
  manifest.options_ui.page,
  manifest.action.default_popup,
  ...Object.values(manifest.icons),
  ...Object.values(manifest.action.default_icon || {}),
  ...manifest.content_scripts.flatMap((c) => c.js),
];
const missing = referenced.filter((f) => !listing.includes(f));
if (missing.length) {
  console.error('Missing from zip:', missing);
  process.exit(1);
}
const top = new Set(listing.map((f) => f.split('/')[0]));
for (const t of top) if (!include.includes(t)) { console.error('Unexpected entry:', t); process.exit(1); }

console.log(`Created ${path.relative(root, out)}`);
console.log(execFileSync('unzip', ['-l', out], { encoding: 'utf8' }).trimEnd());
