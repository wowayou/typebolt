'use strict';
const fs = require('node:fs');
const { test, expect } = require('./fixtures');

const optionsUrl = (extId, q = '') => `chrome-extension://${extId}/src/options/options.html${q}`;

const BASE = [
  { id: 'a', name: 'Thanks', shortcut: ';thx', content: 'Thanks so much!' },
  { id: 'b', name: 'Greeting', shortcut: ';hi', content: 'Hello {input:Name}' },
];

async function open(page, extId, data, snippets = BASE, q = '', extra = {}) {
  await data.set({ snippets, ...extra });
  await page.goto(optionsUrl(extId, q));
  await expect(page.locator('#list')).toBeVisible();
}

const listItems = (page) => page.locator('#list .item');

test('AC23 create a snippet through the editor', async ({ page, extId, data }) => {
  await open(page, extId, data, []);
  await expect(page.locator('#list-empty')).toBeVisible();
  await page.click('#btn-new');
  await page.fill('#f-name', 'Signature');
  await page.fill('#f-shortcut', ';sig');
  await page.fill('#f-content', 'Best,\nMe');
  await page.click('#btn-save');
  await expect(listItems(page)).toHaveCount(1);
  await expect(listItems(page).first()).toContainText(';sig');
  const saved = await data.get('snippets');
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ name: 'Signature', shortcut: ';sig', content: 'Best,\nMe' });
  expect(typeof saved[0].id).toBe('string');
  expect(saved[0].createdAt).toBeGreaterThan(0);
  expect(saved[0].updatedAt).toBeGreaterThan(0);
});

test('AC23 edit an existing snippet and change its shortcut', async ({ page, extId, data }) => {
  await open(page, extId, data);
  await listItems(page).filter({ hasText: ';thx' }).click();
  await expect(page.locator('#f-shortcut')).toHaveValue(';thx');
  await page.fill('#f-shortcut', ';thanks');
  await page.fill('#f-content', 'Many thanks');
  await page.keyboard.press('Control+s');
  await expect(listItems(page).filter({ hasText: ';thanks' })).toHaveCount(1);
  const saved = await data.get('snippets');
  expect(saved).toHaveLength(2);
  expect(saved.find((s) => s.id === 'a')).toMatchObject({ shortcut: ';thanks', content: 'Many thanks', name: 'Thanks' });
});

test('AC23 invalid input shows inline errors and does not save', async ({ page, extId, data }) => {
  await open(page, extId, data);
  await page.click('#btn-new');
  // Empty everything.
  await page.click('#btn-save');
  await expect(page.locator('#err-shortcut')).toHaveText('Enter a shortcut, for example ;thx');
  await expect(page.locator('#err-content')).toHaveText('Content cannot be empty');
  await expect(page.locator('#f-shortcut')).toHaveAttribute('aria-invalid', 'true');
  const cases = [
    [';', 'Shortcut must be at least 2 characters'],
    [';a b', 'Shortcut cannot contain spaces or line breaks'],
    [';' + 'x'.repeat(40), 'Shortcut can be at most 32 characters'],
    [';thx', 'Another snippet already uses this shortcut'],
    [';th', 'This shortcut overlaps with another one'],
    [';thxy', 'This shortcut overlaps with another one'],
  ];
  await page.fill('#f-content', 'something');
  for (const [value, msg] of cases) {
    await page.fill('#f-shortcut', value);
    await page.click('#btn-save');
    await expect(page.locator('#err-shortcut')).toContainText(msg);
  }
  expect(await data.get('snippets')).toHaveLength(2);
  // Fixing the input clears the error and saves.
  await page.fill('#f-shortcut', ';ok');
  await expect(page.locator('#err-shortcut')).toHaveText('');
  await page.click('#btn-save');
  await expect(listItems(page)).toHaveCount(3);
  // Whitespace-only content is rejected.
  await page.click('#btn-new');
  await page.fill('#f-shortcut', ';blank');
  await page.fill('#f-content', '   \n ');
  await page.click('#btn-save');
  await expect(page.locator('#err-content')).toHaveText('Content cannot be empty');
  expect(await data.get('snippets')).toHaveLength(3);
});

test('AC23 delete needs confirmation, keeps the running total', async ({ page, extId, data }) => {
  await open(page, extId, data, BASE, '', {
    stats: { total: { uses: 4, charsSaved: 40 }, bySnippet: { a: { uses: 3, charsSaved: 30, lastUsedAt: 1 }, b: { uses: 1, charsSaved: 10, lastUsedAt: 1 } } },
  });
  await listItems(page).filter({ hasText: ';thx' }).click();
  await page.click('#btn-delete');
  await expect(page.locator('#delete-confirm')).toBeVisible();
  await page.click('#btn-delete-cancel');
  expect(await data.get('snippets')).toHaveLength(2);
  await page.click('#btn-delete');
  await page.click('#btn-delete-confirm');
  await expect(listItems(page)).toHaveCount(1);
  expect((await data.get('snippets')).map((s) => s.id)).toEqual(['b']);
  const stats = await data.get('stats');
  expect(stats.total).toEqual({ uses: 4, charsSaved: 40 });
  expect(stats.bySnippet.a).toBeUndefined();
  await expect(page.locator('#stat-uses')).toHaveText('4');
});

test('AC23 duplicate prefills a new draft without a shortcut', async ({ page, extId, data }) => {
  await open(page, extId, data);
  await listItems(page).filter({ hasText: ';thx' }).click();
  await page.click('#btn-duplicate');
  await expect(page.locator('#f-shortcut')).toHaveValue('');
  await expect(page.locator('#f-content')).toHaveValue('Thanks so much!');
  await expect(page.locator('#f-name')).toHaveValue('Thanks (copy)');
  await page.fill('#f-shortcut', ';thx2'); // would conflict (prefix of existing? ;thx2 starts with ;thx)
  await page.click('#btn-save');
  await expect(page.locator('#err-shortcut')).toContainText('overlaps');
  await page.fill('#f-shortcut', ';ty2');
  await page.click('#btn-save');
  await expect(listItems(page)).toHaveCount(3);
});

test('search filters the list by name, shortcut and content', async ({ page, extId, data }) => {
  await open(page, extId, data);
  await page.fill('#search', 'greet');
  await expect(listItems(page)).toHaveCount(1);
  await page.fill('#search', ';thx');
  await expect(listItems(page)).toHaveCount(1);
  await page.fill('#search', 'so much');
  await expect(listItems(page)).toHaveCount(1);
  await page.fill('#search', 'zzzz');
  await expect(listItems(page)).toHaveCount(0);
  await expect(page.locator('#list-empty')).toContainText('No snippets match');
});

test('keyboard: arrows move through the list and open snippets', async ({ page, extId, data }) => {
  await open(page, extId, data);
  await page.focus('#search');
  await page.keyboard.press('ArrowDown');
  await expect(listItems(page).first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(listItems(page).nth(1)).toBeFocused();
  await expect(listItems(page).nth(1)).toHaveAttribute('aria-selected', 'true');
  const name = await page.inputValue('#f-name');
  expect(['Thanks', 'Greeting']).toContain(name);
});

test('AC24 preview updates live', async ({ page, extId, data }) => {
  await open(page, extId, data, []);
  await page.click('#btn-new');
  await expect(page.locator('#preview')).toHaveText('Nothing to preview yet');
  await page.fill('#f-content', 'Hi {input:Name}, year {date:YYYY}');
  const year = String(new Date().getFullYear());
  await expect(page.locator('#preview')).toHaveText(`Hi [Name], year ${year}`);
  await page.fill('#f-content', 'Hi {input:Other}! {cursor}done');
  await expect(page.locator('#preview')).toHaveText('Hi [Other]! done');
  await expect(page.locator('#preview .caret')).toHaveCount(1);
  await page.fill('#f-content', '{time:HH:mm}');
  await expect(page.locator('#preview')).toHaveText(/^\d{2}:\d{2}$/);
  await page.fill('#f-content', 'function() { x }');
  await expect(page.locator('#preview')).toHaveText('function() { x }');
});

test('placeholder buttons insert at the caret', async ({ page, extId, data }) => {
  await open(page, extId, data, []);
  await page.click('#btn-new');
  await page.fill('#f-content', 'ab');
  await page.evaluate(() => { const t = document.getElementById('f-content'); t.focus(); t.setSelectionRange(1, 1); });
  await page.click('.chip[data-insert="{cursor}"]');
  await expect(page.locator('#f-content')).toHaveValue('a{cursor}b');
  await page.click('.chip[data-insert="{input:Label}"]');
  await expect(page.locator('#f-content')).toHaveValue('a{cursor}{input:Label}b');
  const sel = await page.evaluate(() => { const t = document.getElementById('f-content'); return t.value.slice(t.selectionStart, t.selectionEnd); });
  expect(sel).toBe('Label');
  await expect(page.locator('#preview')).toContainText('[Label]');
});

test('AC25 export downloads a correctly shaped file', async ({ page, extId, data }) => {
  await open(page, extId, data);
  await page.click('#tab-settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export')]);
  expect(download.suggestedFilename()).toMatch(/^typebolt-export-\d{8}\.json$/);
  const json = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  expect(json.format).toBe('typebolt');
  expect(json.version).toBe(1);
  expect(new Date(json.exportedAt).toISOString()).toBe(json.exportedAt);
  expect(json.snippets).toEqual([
    { name: 'Thanks', shortcut: ';thx', content: 'Thanks so much!' },
    { name: 'Greeting', shortcut: ';hi', content: 'Hello {input:Name}' },
  ]);
});

test('AC25 import merges valid entries and reports skipped ones', async ({ page, extId, data }) => {
  await open(page, extId, data);
  await page.click('#tab-settings');
  const file = {
    format: 'typebolt', version: 1, exportedAt: new Date().toISOString(),
    snippets: [
      { name: 'New one', shortcut: ';new', content: 'brand new' },
      { name: 'Dup', shortcut: ';thx', content: 'dup' },
      { name: 'Empty', shortcut: ';emp', content: '' },
      { name: 'Second', shortcut: ';two', content: 'two' },
    ],
  };
  await page.setInputFiles('#import-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await expect(page.locator('#import-result')).toContainText('Added 2, skipped 2');
  await expect(page.locator('#import-result')).toContainText('Another snippet already uses this shortcut');
  await expect(page.locator('#import-result')).toContainText('Content cannot be empty');
  const saved = await data.get('snippets');
  expect(saved.map((s) => s.shortcut)).toEqual([';thx', ';hi', ';new', ';two']);
  expect(new Set(saved.map((s) => s.id)).size).toBe(4);
  await page.click('#tab-snippets');
  await expect(listItems(page)).toHaveCount(4);
  // Round trip: re-importing the same file adds nothing.
  await page.click('#tab-settings');
  await page.setInputFiles('#import-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await expect(page.locator('#import-result')).toContainText('Added 0, skipped 4');
  expect(await data.get('snippets')).toHaveLength(4);
});

test('AC25 invalid files are rejected and data stays unchanged', async ({ page, extId, data }) => {
  await open(page, extId, data);
  await page.click('#tab-settings');
  const before = await data.get('snippets');
  for (const [content, msg] of [
    ['{ not json', 'This file is not valid JSON'],
    [JSON.stringify({ format: 'other', version: 1, snippets: [] }), 'This is not a TypeBolt export file'],
    [JSON.stringify([1, 2, 3]), 'This is not a TypeBolt export file'],
    [JSON.stringify({ format: 'typebolt', version: 1 }), 'This is not a TypeBolt export file'],
  ]) {
    await page.setInputFiles('#import-file', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(content) });
    await expect(page.locator('#import-result')).toContainText('Import failed. Nothing was changed.');
    await expect(page.locator('#import-result')).toContainText(msg);
    expect(await data.get('snippets')).toEqual(before);
  }
});

test('AC26 disabled sites are normalised to hostnames; invalid input is rejected', async ({ page, extId, data }) => {
  await open(page, extId, data);
  await page.click('#tab-settings');
  await page.fill('#site-input', 'https://www.Example.com/path');
  await page.click('#btn-site-add');
  await expect(page.locator('#site-list li')).toHaveText(['www.example.com×']);
  expect((await data.get('settings')).disabledSites).toEqual(['www.example.com']);
  await page.fill('#site-input', 'example.com');
  await page.keyboard.press('Enter');
  await expect(page.locator('#site-list li')).toHaveCount(2);
  await page.fill('#site-input', 'example.com'); // duplicate is ignored
  await page.click('#btn-site-add');
  await expect(page.locator('#site-list li')).toHaveCount(2);
  await page.fill('#site-input', 'not a site');
  await page.click('#btn-site-add');
  await expect(page.locator('#err-site')).toHaveText('That does not look like a valid site address');
  expect((await data.get('settings')).disabledSites).toEqual(['www.example.com', 'example.com']);
  await page.locator('#site-list li[data-site="www.example.com"] button').click();
  expect((await data.get('settings')).disabledSites).toEqual(['example.com']);
});

test('global switch persists in settings', async ({ page, extId, data }) => {
  await open(page, extId, data);
  await page.click('#tab-settings');
  await expect(page.locator('#set-enabled')).toBeChecked();
  await page.locator('#set-enabled').click({ force: true });
  await expect.poll(async () => (await data.get('settings')).enabled).toBe(false);
  await page.locator('#set-enabled').click({ force: true });
  await expect.poll(async () => (await data.get('settings')).enabled).toBe(true);
});

test('AC27 welcome try-it box expands; editor fields never expand', async ({ page, extId, data }) => {
  await open(page, extId, data, BASE, '?welcome=1');
  await expect(page.locator('#welcome')).toHaveJSProperty('open', true);
  await expect(page.locator('#tryit-hint')).toContainText(';thx');
  await expect(page.locator('#tryit')).toBeFocused();
  await page.keyboard.type('a ;thx');
  await expect(page.locator('#tryit')).toHaveValue('a Thanks so much!');
  // Fill-in form also works in the try-it box.
  await page.fill('#tryit', '');
  await page.keyboard.type(';hi');
  await expect(page.locator('[data-typebolt-overlay] input')).toHaveCount(1);
  await page.keyboard.type('Zed');
  await page.keyboard.press('Enter');
  await expect(page.locator('#tryit')).toHaveValue('Hello Zed');
  // Editor fields are protected.
  await page.click('#btn-new');
  await page.click('#f-content');
  await page.keyboard.type(';thx');
  await expect(page.locator('#f-content')).toHaveValue(';thx');
  await page.fill('#f-name', '');
  await page.click('#f-name');
  await page.keyboard.type(';thx');
  await expect(page.locator('#f-name')).toHaveValue(';thx');
  await page.click('#search');
  await page.keyboard.type(';thx');
  await expect(page.locator('#search')).toHaveValue(';thx');
});

test('welcome is collapsed when opened normally', async ({ page, extId, data }) => {
  await open(page, extId, data);
  await expect(page.locator('#welcome')).toHaveJSProperty('open', false);
});

test('stats overview shows totals and estimated minutes', async ({ page, extId, data }) => {
  await open(page, extId, data, BASE, '', { stats: { total: { uses: 12, charsSaved: 1000 }, bySnippet: { a: { uses: 7, charsSaved: 10, lastUsedAt: 1 } } } });
  await expect(page.locator('#stat-uses')).toHaveText('12');
  await expect(page.locator('#stat-chars')).toHaveText('1000');
  await expect(page.locator('#stat-minutes')).toHaveText('5');
  await expect(listItems(page).filter({ hasText: ';thx' })).toContainText('7 uses');
});

test('page reflects live storage changes (stats from expansions elsewhere)', async ({ page, extId, data }) => {
  await open(page, extId, data);
  await page.evaluate(() => chrome.storage.local.set({ stats: { total: { uses: 9, charsSaved: 400 }, bySnippet: {} } }));
  await expect(page.locator('#stat-uses')).toHaveText('9');
  await expect(page.locator('#stat-minutes')).toHaveText('2');
});
