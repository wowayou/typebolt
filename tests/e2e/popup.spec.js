'use strict';
const { test, expect } = require('./fixtures');

const popupUrl = (extId) => `chrome-extension://${extId}/src/popup/popup.html`;

const SNIPS = [
  { id: 'a', name: 'Thanks', shortcut: ';thx', content: 'Thanks so much!' },
  { id: 'b', name: 'Greeting', shortcut: ';hi', content: 'Hello {input:Name}, from {input:City}.{cursor}' },
  { id: 'c', name: 'Meeting', shortcut: ';mt', content: 'Let us meet on {date:YYYY}' },
];

async function open(page, context, extId, data, extra = {}) {
  await data.set({ snippets: SNIPS, ...extra });
  await page.goto(popupUrl(extId));
  await expect(page.locator('#list .item').first()).toBeVisible();
}

const items = (page) => page.locator('#list .item');

test('AC28 lists snippets, search box is focused', async ({ page, context, extId, data }) => {
  await open(page, context, extId, data);
  await expect(items(page)).toHaveCount(3);
  await expect(page.locator('#search')).toBeFocused();
  await expect(items(page).first()).toContainText('Thanks');
  await expect(items(page).first()).toContainText(';thx');
  await expect(items(page).first()).toContainText('Thanks so much!');
  // Placeholders are shown in a readable form in the preview.
  await expect(items(page).nth(1)).toContainText('Hello [Name], from [City].');
});

test('AC28 search filters by name, shortcut and content', async ({ page, context, extId, data }) => {
  await open(page, context, extId, data);
  await page.fill('#search', 'greet');
  await expect(items(page)).toHaveCount(1);
  await page.fill('#search', ';mt');
  await expect(items(page)).toHaveCount(1);
  await expect(items(page).first()).toContainText('Meeting');
  await page.fill('#search', 'so much');
  await expect(items(page)).toHaveCount(1);
  await expect(items(page).first()).toContainText('Thanks');
  await page.fill('#search', 'nothing-here');
  await expect(items(page)).toHaveCount(0);
  await expect(page.locator('#empty')).toHaveText('No matches');
});

test('AC28 click copies rendered text to the clipboard', async ({ page, context, extId, data, clipboard }) => {
  await open(page, context, extId, data);
  await items(page).first().click();
  await expect(page.locator('#status')).toHaveText('Copied');
  expect(await clipboard(page)).toBe('Thanks so much!');
  await items(page).nth(2).click();
  await expect.poll(() => clipboard(page)).toBe(`Let us meet on ${new Date().getFullYear()}`);
});

test('AC28 keyboard: arrows select, Enter copies', async ({ page, context, extId, data, clipboard }) => {
  await open(page, context, extId, data);
  await page.keyboard.press('ArrowDown');
  await expect(items(page).nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(items(page).first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect.poll(() => clipboard(page)).toBe('Thanks so much!');
  // Filter then Enter copies the first match.
  await page.fill('#search', ';mt');
  await page.keyboard.press('Enter');
  await expect.poll(() => clipboard(page)).toMatch(/^Let us meet on \d{4}$/);
});

test('AC28 snippets with {input} show an inline form, then copy; {cursor} removed', async ({ page, context, extId, data, clipboard }) => {
  await open(page, context, extId, data);
  await items(page).nth(1).click();
  await expect(page.locator('#fill')).toBeVisible();
  await expect(page.locator('#fill-fields input')).toHaveCount(2);
  await expect(page.locator('#fill-fields input').first()).toBeFocused();
  await page.keyboard.type('Ann');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Oslo');
  await page.keyboard.press('Enter');
  await expect.poll(() => clipboard(page)).toBe('Hello Ann, from Oslo.');
  await expect(page.locator('#fill')).toBeHidden();
  await expect(items(page)).toHaveCount(3);
  // Esc goes back without copying.
  await items(page).nth(1).click();
  await page.keyboard.type('X');
  await page.keyboard.press('Escape');
  await expect(page.locator('#fill')).toBeHidden();
  expect(await clipboard(page)).toBe('Hello Ann, from Oslo.');
});

test('AC28 stats line', async ({ page, context, extId, data }) => {
  await open(page, context, extId, data, { stats: { total: { uses: 7, charsSaved: 650 }, bySnippet: {} } });
  await expect(page.locator('#stats')).toHaveText('Expanded 7 times · saved about 3 min');
});

test('AC28 global switch writes settings and expansion stops', async ({ page, context, extId, data, server }) => {
  await open(page, context, extId, data);
  await expect(page.locator('#tog-global')).toBeChecked();
  await page.locator('#tog-global').click({ force: true });
  await expect.poll(async () => (await data.get('settings')).enabled).toBe(false);
  const other = await context.newPage();
  await other.goto(`http://127.0.0.1:${server.port}/editors.html`);
  await other.click('#text');
  await other.keyboard.type(';thx');
  await expect(other.locator('#text')).toHaveValue(';thx');
  await page.locator('#tog-global').click({ force: true });
  await expect.poll(async () => (await data.get('settings')).enabled).toBe(true);
  await data.refresh();
  await other.fill('#text', '');
  await other.keyboard.type(';thx');
  await expect(other.locator('#text')).toHaveValue('Thanks so much!');
  await other.close();
});

test('AC28 site switch is hidden on non-http pages (the popup tab itself)', async ({ page, context, extId, data }) => {
  await open(page, context, extId, data);
  await expect(page.locator('#site-row')).toBeHidden();
});

test('AC28 site switch toggles the hostname (tab lookup stubbed; real tab is manual)', async ({ page, context, extId, data }) => {
  await page.addInitScript(() => {
    chrome.tabs.query = async () => [{ id: 1, url: 'https://mail.example.com/inbox?x=1' }];
  });
  await open(page, context, extId, data, { settings: { disabledSites: ['other.org'] } });
  await expect(page.locator('#site-row')).toBeVisible();
  await expect(page.locator('#site-label')).toHaveText('Enabled on mail.example.com');
  await expect(page.locator('#tog-site')).toBeChecked();
  await page.locator('#tog-site').click({ force: true });
  await expect.poll(async () => (await data.get('settings')).disabledSites).toEqual(['other.org', 'mail.example.com']);
  await page.locator('#tog-site').click({ force: true });
  await expect.poll(async () => (await data.get('settings')).disabledSites).toEqual(['other.org']);
});

test('AC28 site switch reflects a parent-domain rule and removes it when re-enabled', async ({ page, context, extId, data }) => {
  await page.addInitScript(() => {
    chrome.tabs.query = async () => [{ id: 1, url: 'https://mail.example.com/' }];
  });
  await open(page, context, extId, data, { settings: { disabledSites: ['example.com'] } });
  await expect(page.locator('#tog-site')).not.toBeChecked();
  await page.locator('#tog-site').click({ force: true });
  await expect.poll(async () => (await data.get('settings')).disabledSites).toEqual([]);
});

test('empty state', async ({ page, extId, data }) => {
  await data.set({ snippets: [] });
  await page.goto(popupUrl(extId));
  await expect(page.locator('#empty')).toHaveText('No snippets yet');
});
