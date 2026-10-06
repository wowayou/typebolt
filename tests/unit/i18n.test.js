'use strict';
// AC31: en / zh_CN message catalogs stay in sync and every referenced key exists.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const en = JSON.parse(read('_locales/en/messages.json'));
const zh = JSON.parse(read('_locales/zh_CN/messages.json'));

test('en and zh_CN define exactly the same keys', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
});

test('every message has non-empty text and matching placeholders', () => {
  for (const k of Object.keys(en)) {
    assert.ok(en[k].message && zh[k].message, k);
    assert.deepEqual(Object.keys(en[k].placeholders || {}).sort(), Object.keys(zh[k].placeholders || {}).sort(), k);
    // Each $NAME$ token used in a message must be a declared placeholder (case-insensitive).
    for (const m of [en[k], zh[k]]) {
      for (const tok of m.message.matchAll(/\$([A-Za-z0-9_@]+)\$/g)) {
        assert.ok(m.placeholders && m.placeholders[tok[1].toLowerCase()], `${k}: undeclared placeholder ${tok[1]}`);
      }
    }
  }
});

const HTML_FILES = ['src/options/options.html', 'src/popup/popup.html'];
test('every data-i18n* key used in HTML exists', () => {
  for (const f of HTML_FILES) {
    const html = read(f);
    for (const m of html.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)) {
      assert.ok(en[m[1]], `${f}: missing key ${m[1]}`);
    }
  }
});

test('every t("key") / getMessage("key") used in JS exists', () => {
  const files = ['src/options/options.js', 'src/popup/popup.js', 'src/content/form-overlay.js'];
  for (const f of files) {
    const js = read(f);
    for (const m of js.matchAll(/\b(?:t|getMessage)\('([A-Za-z0-9_]+)'\s*[,)]/g)) {
      assert.ok(en[m[1]], `${f}: missing key ${m[1]}`);
    }
  }
});

test('every validation / import error code has an err_ message', () => {
  const E = require('../../src/shared/engine.js');
  const codes = new Set(['invalid_item', 'invalid_json', 'invalid_format']);
  const probes = [
    { shortcut: '', content: '' }, { shortcut: 'x', content: 'c' }, { shortcut: 'a b', content: 'c' },
    { shortcut: 'x'.repeat(40), content: 'c' }, { shortcut: ';a', content: 'c' }, { shortcut: ';ab', content: 'c' },
  ];
  const existing = [{ id: '1', shortcut: ';a' }];
  for (const p of probes) E.validateSnippet(p, existing).forEach((c) => codes.add(c));
  for (const c of codes) assert.ok(en['err_' + c], `err_${c}`);
});

test('manifest __MSG_ references exist and referenced files are present', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const text = JSON.stringify(manifest);
  for (const m of text.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) assert.ok(en[m[1]], m[1]);
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'scripting', 'storage']);
  assert.deepEqual(manifest.host_permissions, ['<all_urls>']);
  const files = [
    manifest.background.service_worker, manifest.options_ui.page, manifest.action.default_popup,
    ...Object.values(manifest.icons), ...manifest.content_scripts.flatMap((c) => c.js),
  ];
  for (const f of files) assert.ok(fs.existsSync(path.join(root, f)), f);
  const cs = manifest.content_scripts[0];
  assert.deepEqual(cs.js, ['src/shared/engine.js', 'src/content/form-overlay.js', 'src/content/content.js']);
  assert.equal(cs.all_frames, true);
  assert.equal(cs.match_about_blank, true);
  assert.equal(cs.run_at, 'document_idle');
});

test('AC33 static guard: no eval / new Function / innerHTML / remote URLs in extension sources', () => {
  const dirs = ['src'];
  const walk = (d) => fs.readdirSync(path.join(root, d), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of dirs.flatMap(walk)) {
    const text = read(f);
    if (f.endsWith('.js')) {
      assert.ok(!/\beval\s*\(/.test(text), `${f}: eval`);
      assert.ok(!/new Function\b/.test(text), `${f}: new Function`);
      assert.ok(!/\.innerHTML\s*=(?!=)/.test(text) && !/insertAdjacentHTML/.test(text) && !/outerHTML\s*=(?!=)/.test(text), `${f}: HTML injection`);
      assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(text), `${f}: network API`);
    }
    if (f.endsWith('.html')) {
      assert.ok(!/(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i.test(text), `${f}: remote resource`);
      assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(text), `${f}: inline script`);
    }
    if (f.endsWith('.css')) {
      assert.ok(!/@import|url\(\s*["']?(?:https?:)?\/\//i.test(text), `${f}: remote CSS`);
    }
  }
});

test('starterPackLang selects the matching starter pack in each catalog', () => {
  const P = require('../../src/shared/starter-pack.js');
  assert.equal(en.starterPackLang.message, 'en');
  assert.equal(zh.starterPackLang.message, 'zh');
  assert.equal(P.getPack(en.starterPackLang.message)[0].shortcut, P.EN[0].shortcut);
  assert.equal(P.getPack(zh.starterPackLang.message)[0].shortcut, P.ZH[0].shortcut);
});
