'use strict';
const base = require('@playwright/test');
const { test, expect, EXT_PATH } = require('./fixtures');
const Starter = require('../../src/shared/starter-pack.js');

test('AC29 fresh install writes the English starter pack, defaults and opens the welcome page', async () => {
  const context = await base.chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true, locale: 'en-US',
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
  });
  try {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    const read = () => sw.evaluate(() => chrome.storage.local.get(null));
    await expect.poll(async () => (await read()).meta !== undefined).toBe(true);
    const all = await read();
    expect(all.snippets.map((s) => ({ name: s.name, shortcut: s.shortcut, content: s.content }))).toEqual(Starter.EN);
    expect(all.snippets.every((s) => s.id && s.createdAt && s.updatedAt)).toBe(true);
    expect(all.settings).toEqual({ enabled: true, disabledSites: [] });
    expect(all.stats).toEqual({ total: { uses: 0, charsSaved: 0 }, bySnippet: {} });
    expect(all.meta.schemaVersion).toBe(1);
    expect(all.meta.installedAt).toBeGreaterThan(0);
    await expect.poll(() => context.pages().map((p) => p.url()).some((u) => u.endsWith('/src/options/options.html?welcome=1'))).toBe(true);
    // The welcome page shows the starter snippets.
    const welcome = context.pages().find((p) => p.url().includes('welcome=1'));
    await expect(welcome.locator('#list .item')).toHaveCount(Starter.EN.length);
    await expect(welcome.locator('#welcome')).toHaveJSProperty('open', true);
  } finally {
    await context.close();
  }
});

test('AC29 a zh-CN browser gets the Chinese starter pack, matching the UI language it shows', async () => {
  const context = await base.chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true, locale: 'zh-CN',
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`, '--lang=zh-CN'],
  });
  try {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    await expect.poll(() => sw.evaluate(async () => (await chrome.storage.local.get('meta')).meta !== undefined)).toBe(true);
    // The UI really is Chinese (this is what the pack must agree with).
    expect(await sw.evaluate(() => chrome.i18n.getMessage('extName'))).toContain('文本快捷短语');
    const snippets = await sw.evaluate(async () => (await chrome.storage.local.get('snippets')).snippets);
    expect(snippets.map((s) => ({ name: s.name, shortcut: s.shortcut, content: s.content }))).toEqual(Starter.ZH);
  } finally {
    await context.close();
  }
});

test('AC29 update keeps user data untouched and re-injects into open tabs', async ({ page, server, data, sw }) => {
  const custom = [{ id: 'u1', name: 'Mine', shortcut: ';mine', content: 'mine' }];
  await data.set({ snippets: custom, settings: { enabled: false, disabledSites: ['a.com'] }, stats: { total: { uses: 3, charsSaved: 30 }, bySnippet: {} } });
  const before = await sw.evaluate(() => chrome.storage.local.get(null));
  await page.goto(`http://127.0.0.1:${server.port}/editors.html`);
  // Spy on executeScript to verify the injection call, then run the real handler.
  const calls = await sw.evaluate(async () => {
    const calls = [];
    const orig = chrome.scripting.executeScript.bind(chrome.scripting);
    chrome.scripting.executeScript = (opts) => { calls.push(opts); return orig(opts); };
    try { await handleInstalled({ reason: 'update' }); } finally { chrome.scripting.executeScript = orig; }
    return calls;
  });
  expect(calls.length).toBeGreaterThanOrEqual(1);
  expect(calls.some((c) => c.target.allFrames === true && c.files.join() === 'src/shared/engine.js,src/content/form-overlay.js,src/content/content.js')).toBe(true);
  const after = await sw.evaluate(() => chrome.storage.local.get(null));
  expect(after).toEqual(before);
  // No welcome tab was opened for an update.
  expect(page.context().pages().filter((p) => p.url().includes('welcome=1')).length).toBeLessThanOrEqual(1);
});

test('AC29 install handler never overwrites existing snippets', async ({ data, sw }) => {
  const custom = [{ id: 'u1', name: 'Mine', shortcut: ';mine', content: 'mine' }];
  await data.set({ snippets: custom });
  await sw.evaluate(() => handleInstalled({ reason: 'install' }));
  const snippets = await data.get('snippets');
  expect(snippets.map((x) => x.id)).toEqual(['u1']);
  expect(snippets[0]).toMatchObject(custom[0]);
});
