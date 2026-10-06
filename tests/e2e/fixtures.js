'use strict';
const base = require('@playwright/test');
const path = require('node:path');
const { startServer } = require('../fixtures/server.js');

const EXT_PATH = path.resolve(__dirname, '../..');

const test = base.test.extend({
  server: [async ({}, use) => {
    const s = await startServer();
    await use(s);
    await s.close();
  }, { scope: 'worker' }],

  // One browser (with the unpacked extension loaded) per worker; pages/data are per test.
  ext: [async ({}, use) => {
    const context = await base.chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      locale: 'en-US',
      args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
    });
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    const extId = new URL(sw.url()).host;
    // Wait for the install handler to finish (starter pack + meta written).
    await base.expect.poll(() => sw.evaluate(async () => !!(await chrome.storage.local.get('meta')).meta)).toBe(true);
    await use({ context, sw, extId });
    await context.close();
  }, { scope: 'worker' }],

  context: async ({ ext }, use) => { await use(ext.context); },
  sw: async ({ ext }, use) => { await use(ext.sw); },
  extId: async ({ ext }, use) => { await use(ext.extId); },

  page: async ({ ext }, use) => {
    const page = await ext.context.newPage();
    await use(page);
    await page.close();
  },

  // Reads the system clipboard. Extension pages cannot be granted clipboard-read, so a helper
  // http page (permission granted, clipboard shared browser-wide) does the reading.
  clipboard: async ({ ext, server }, use) => {
    const origin = `http://127.0.0.1:${server.port}`;
    await ext.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    const reader = await ext.context.newPage();
    await reader.goto(`${origin}/shadow.html`);
    await use(async (backTo) => {
      await reader.bringToFront();
      const text = await reader.evaluate(() => navigator.clipboard.readText());
      if (backTo) await backTo.bringToFront();
      return text;
    });
    await reader.close();
  },

  // Auto fixture: every test starts from a known storage state (no snippets).
  data: [async ({ ext }, use) => {
    const api = makeDataApi(ext.sw);
    await api.reset();
    await use(api);
  }, { auto: true }],
});

function makeDataApi(sw) {
  const api = {
    /** Replace all stored data. snippets: [{ shortcut, content, name?, id? }] */
    async reset(opts = {}) {
      const now = Date.now();
      const snippets = (opts.snippets || []).map((s, i) => ({
        id: s.id || `t${i}`, name: s.name || s.shortcut, shortcut: s.shortcut, content: s.content,
        createdAt: now, updatedAt: now,
      }));
      const settings = { enabled: true, disabledSites: [], ...(opts.settings || {}) };
      const stats = opts.stats || { total: { uses: 0, charsSaved: 0 }, bySnippet: {} };
      await sw.evaluate(async (d) => {
        await chrome.storage.local.clear();
        await chrome.storage.local.set(d);
      }, { snippets, settings, stats, meta: { schemaVersion: 1, installedAt: now } });
    },
    async set(opts) { await api.reset({ ...opts }); },
    async get(key) { return sw.evaluate(async (k) => (await chrome.storage.local.get(k))[k], key); },
    /** Ask every tab's content script to reload its state; resolves when they have. */
    async refresh() {
      await sw.evaluate(async () => {
        const tabs = await chrome.tabs.query({});
        await Promise.all(tabs.map((t) => chrome.tabs.sendMessage(t.id, { type: 'typebolt:refresh' }).catch(() => null)));
      });
    },
  };
  return api;
}

/**
 * Negative assertions ("must NOT expand") need the extension's deferred check (setTimeout 0 plus
 * an async insertion) to have had its chance to run; wait for that before asserting.
 */
async function flush(page) {
  await page.evaluate(() => new Promise((r) => setTimeout(r, 150)));
}

// Text before the caret; the extension positions the caret asynchronously, so poll this
// before typing again.
async function caretBefore(page, sel) {
  return page.$eval(sel, (el) => {
    if ('value' in el) return el.value.slice(0, el.selectionStart);
    const s = getSelection();
    if (!s.rangeCount) return null;
    const r = document.createRange();
    r.selectNodeContents(el);
    r.setEnd(s.anchorNode, s.anchorOffset);
    return r.toString();
  });
}

module.exports = { test, expect: base.expect, EXT_PATH, flush, caretBefore };
