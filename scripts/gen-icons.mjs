// Render icons/icon.svg to PNG at 16/32/48/128 using Playwright's Chromium.
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = await readFile(path.join(root, 'icons/icon.svg'), 'utf8');
const browser = await chromium.launch({ channel: 'chromium' });
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`
  );
  const buf = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await writeFile(path.join(root, `icons/icon${size}.png`), buf);
  await page.close();
}
await browser.close();
console.log('icons generated');
