// Bundle the real-editor fixtures (ProseMirror, Lexical, Quill, Draft.js, Slate, React) for E2E.
// Page 1 uses React 19; page 2 (Draft.js, Slate) uses React 18 via aliases (Draft.js needs <= 18).
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'tests/fixtures/editors-src');
const out = path.join(root, 'tests/fixtures/dist');
const common = { bundle: true, format: 'iife', platform: 'browser', logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"production"', global: 'window' }, loader: { '.js': 'jsx' } };

await build({ ...common, entryPoints: [path.join(src, 'editors.jsx')], outfile: path.join(out, 'bundle.js') });
await build({
  ...common,
  entryPoints: [path.join(src, 'editors2.jsx')],
  outfile: path.join(out, 'bundle2.js'),
  alias: { react: 'react18', 'react-dom': 'react-dom18' },
});
console.log('fixtures built');
