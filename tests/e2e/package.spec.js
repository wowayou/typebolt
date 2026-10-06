'use strict';
// AC32: the zip produced by `npm run package` contains only the allowed entries and loads in Chrome.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect, chromium } = require('@playwright/test');
const { startServer } = require('../fixtures/server.js');

const ROOT = path.resolve(__dirname, '../..');

test('AC32 packaged zip has the expected layout and the unpacked zip works in Chrome', async () => {
  execFileSync('node', ['scripts/package.mjs'], { cwd: ROOT, stdio: 'pipe' });
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).version;
  const zip = path.join(ROOT, 'dist', `typebolt-${version}.zip`);
  expect(fs.existsSync(zip)).toBe(true);
  const entries = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').filter(Boolean);
  expect(new Set(entries.map((e) => e.split('/')[0]))).toEqual(new Set(['manifest.json', '_locales', 'icons', 'src', 'LICENSE']));
  expect(entries.some((e) => /node_modules|tests\/|docs\/|\.map$/.test(e))).toBe(false);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typebolt-zip-'));
  execFileSync('unzip', ['-q', zip, '-d', dir]);
  const server = await startServer();
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true, locale: 'en-US',
    args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
  });
  try {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    await expect.poll(() => sw.evaluate(async () => (await chrome.storage.local.get('snippets')).snippets?.length ?? 0)).toBeGreaterThan(0);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.port}/editors.html`);
    await page.click('#text');
    await page.keyboard.type(';thx');
    await expect(page.locator('#text')).toHaveValue('Thanks so much! I really appreciate your help.');
  } finally {
    await context.close();
    await server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
