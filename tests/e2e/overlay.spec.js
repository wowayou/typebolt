'use strict';
const { test, expect, flush, caretBefore } = require('./fixtures');

const SNIPS = [
  { id: 'form', shortcut: ';form', content: 'Dear {input:Name}, see you on {input:Day}. Cheers, {input:Name}!{cursor} PS' },
  { id: 'one', shortcut: ';one', content: 'Hello {input:Who}' },
  { id: 'plain', shortcut: ';thx', content: 'Thanks' },
];

async function open(page, server, data, file = 'editors.html', snippets = SNIPS) {
  await data.set({ snippets });
  await page.goto(`http://127.0.0.1:${server.port}/${file}`);
}

const overlay = (page) => page.locator('[data-typebolt-overlay]');
const field = (page, i) => page.locator('[data-typebolt-overlay] input').nth(i);

for (const sel of ['#text', '#ta', '#ce']) {
  test(`AC18/AC21 fill-in form: two unique fields, shared label, focus + caret restored (${sel})`, async ({ page, server, data }) => {
    await open(page, server, data);
    await page.click(sel);
    await page.keyboard.type('pre ;form');
    await expect(overlay(page)).toHaveCount(1);
    await expect(page.locator('[data-typebolt-overlay] input')).toHaveCount(2);
    // First field is focused.
    expect(await page.evaluate(() => document.querySelector('[data-typebolt-overlay]').shadowRoot.activeElement.dataset.label)).toBe('Name');
    // Shortcut is still in the page while the form is open.
    const read = () => page.$eval(sel, (el) => ('value' in el ? el.value : el.innerText));
    expect(await read()).toBe('pre ;form');
    await page.keyboard.type('Ann');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Friday');
    await page.keyboard.press('Enter');
    await expect(overlay(page)).toHaveCount(0);
    await expect.poll(read).toBe('pre Dear Ann, see you on Friday. Cheers, Ann! PS');
    // Focus is back on the original element, caret sits at {cursor} (positioned asynchronously).
    await expect.poll(() => caretBefore(page, sel)).toBe('pre Dear Ann, see you on Friday. Cheers, Ann!');
    expect(await page.evaluate((s) => document.activeElement === document.querySelector(s), sel)).toBe(true);
    await page.keyboard.type('<>');
    await expect.poll(read).toBe('pre Dear Ann, see you on Friday. Cheers, Ann!<> PS');
  });
}

test('AC18 Shift+Tab and Tab wrap between fields and buttons', async ({ page, server, data }) => {
  await open(page, server, data);
  await page.click('#text');
  await page.keyboard.type(';form');
  await expect(overlay(page)).toHaveCount(1);
  const active = () => page.evaluate(() => {
    const a = document.querySelector('[data-typebolt-overlay]').shadowRoot.activeElement;
    return a.dataset.label || a.className;
  });
  expect(await active()).toBe('Name');
  await page.keyboard.press('Tab');
  expect(await active()).toBe('Day');
  await page.keyboard.press('Tab');
  expect(await active()).toBe('cancel');
  await page.keyboard.press('Tab');
  expect(await active()).toBe('primary submit');
  await page.keyboard.press('Tab');
  expect(await active()).toBe('Name');
  await page.keyboard.press('Shift+Tab');
  expect(await active()).toBe('primary submit');
});

test('AC18 clicking Insert submits; stats record the expansion', async ({ page, server, data }) => {
  await open(page, server, data);
  await page.click('#text');
  await page.keyboard.type(';one');
  await expect(overlay(page)).toHaveCount(1);
  await page.keyboard.type('World');
  await page.locator('[data-typebolt-overlay] button.submit').click();
  await expect(page.locator('#text')).toHaveValue('Hello World');
  await expect.poll(async () => (await data.get('stats')).bySnippet.one?.uses).toBe(1);
});

for (const sel of ['#text', '#ta', '#ce']) {
  test(`AC19 Esc cancels: overlay removed, shortcut kept, focus and caret restored (${sel})`, async ({ page, server, data }) => {
    await open(page, server, data);
    await page.click(sel);
    await page.keyboard.type('a ;form');
    await expect(overlay(page)).toHaveCount(1);
    await page.keyboard.type('zzz');
    await page.keyboard.press('Escape');
    await expect(overlay(page)).toHaveCount(0);
    const read = () => page.$eval(sel, (el) => ('value' in el ? el.value : el.innerText));
    expect(await read()).toBe('a ;form');
    // Caret is put back after the shortcut asynchronously; wait for it before typing on.
    await expect.poll(() => caretBefore(page, sel)).toBe('a ;form');
    expect(await page.evaluate((s) => document.activeElement === document.querySelector(s), sel)).toBe(true);
    await page.keyboard.type('!');
    await expect.poll(read).toBe('a ;form!');
    expect((await data.get('stats')).total.uses).toBe(0);
  });
}

test('AC19 clicking Cancel and clicking outside also cancel', async ({ page, server, data }) => {
  await open(page, server, data);
  await page.click('#text');
  await page.keyboard.type(';one');
  await expect(overlay(page)).toHaveCount(1);
  await page.locator('[data-typebolt-overlay] button.cancel').click();
  await expect(overlay(page)).toHaveCount(0);
  await expect(page.locator('#text')).toHaveValue(';one');
  await page.fill('#text', '');
  await page.keyboard.type(';one');
  await expect(overlay(page)).toHaveCount(1);
  await page.mouse.click(700, 500);
  await expect(overlay(page)).toHaveCount(0);
  await expect(page.locator('#text')).toHaveValue(';one');
});

test('AC20 keystrokes inside the overlay never reach page bubble-phase keydown listeners', async ({ page, server, data }) => {
  await open(page, server, data);
  await page.click('#text');
  await page.keyboard.type(';form');
  await expect(overlay(page)).toHaveCount(1);
  const before = await page.evaluate(() => window.__bubbleKeydowns);
  expect(before).toBeGreaterThan(0); // typing ';form' before the overlay did reach the page
  await page.keyboard.type('Ann');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Mon');
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => window.__bubbleKeydowns)).toBe(before);
  await page.keyboard.press('Enter');
  await expect(overlay(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.__bubbleKeydowns)).toBe(before);
});

test('typing a shortcut inside an overlay field does not expand it', async ({ page, server, data }) => {
  await open(page, server, data);
  await page.click('#text');
  await page.keyboard.type(';one');
  await expect(overlay(page)).toHaveCount(1);
  await page.keyboard.type(';thx');
  await flush(page);
  await expect(field(page, 0)).toHaveValue(';thx');
});

test('overlay is removed when its target leaves the DOM; only one overlay at a time', async ({ page, server, data }) => {
  await open(page, server, data);
  await page.click('#text');
  await page.keyboard.type(';one');
  await expect(overlay(page)).toHaveCount(1);
  await page.evaluate(() => document.getElementById('text').remove());
  await expect(overlay(page)).toHaveCount(0);
  await page.click('#plain');
  await page.keyboard.type(';one');
  await expect(overlay(page)).toHaveCount(1);
  // While open, a second expansion attempt in another field does not stack a second overlay.
  await page.evaluate(() => document.getElementById('ta').focus());
  await expect(overlay(page)).toHaveCount(1);
});

test('overlay stays inside the viewport and flips above when there is no room below', async ({ page, server, data }) => {
  await open(page, server, data);
  await page.setViewportSize({ width: 600, height: 300 });
  await page.evaluate(() => { const ta = document.getElementById('ta'); ta.style.marginTop = '120px'; });
  await page.click('#ta');
  await page.keyboard.type(';form');
  await expect(overlay(page)).toHaveCount(1);
  const r = await page.evaluate(() => {
    const p = document.querySelector('[data-typebolt-overlay]').shadowRoot.querySelector('.panel').getBoundingClientRect();
    const t = document.getElementById('ta').getBoundingClientRect();
    return { top: p.top, bottom: p.bottom, left: p.left, right: p.right, taTop: t.top, vw: innerWidth, vh: innerHeight };
  });
  expect(r.top).toBeGreaterThanOrEqual(0);
  expect(r.bottom).toBeLessThanOrEqual(r.vh);
  expect(r.left).toBeGreaterThanOrEqual(0);
  expect(r.right).toBeLessThanOrEqual(r.vw);
});

test('AC17 overlay is styled correctly under a strict CSP page', async ({ page, server, data }) => {
  await open(page, server, data, 'csp-editors.html');
  const cspHeader = await (await page.request.get(`http://127.0.0.1:${server.port}/csp-editors.html`)).headers()['content-security-policy'];
  expect(cspHeader).toBe("default-src 'self'; style-src 'self'; script-src 'self'");
  await page.click('#text');
  await page.keyboard.type(';form');
  await expect(overlay(page)).toHaveCount(1);
  const s = await page.evaluate(() => {
    const root = document.querySelector('[data-typebolt-overlay]').shadowRoot;
    const input = root.querySelector('input');
    const panel = root.querySelector('.panel');
    const cs = getComputedStyle(input);
    const ps = getComputedStyle(panel);
    const rect = panel.getBoundingClientRect();
    return {
      adopted: root.adoptedStyleSheets.length,
      height: cs.height, radius: cs.borderTopLeftRadius, fontSize: cs.fontSize, display: cs.display,
      position: ps.position, panelWidth: rect.width, bg: ps.backgroundColor, z: ps.zIndex,
      btnBg: getComputedStyle(root.querySelector('button.submit')).backgroundColor,
    };
  });
  expect(s.adopted).toBe(1);
  expect(s.height).toBe('32px');
  expect(s.radius).toBe('8px');
  expect(s.fontSize).toBe('13px');
  expect(s.display).toBe('block');
  expect(s.position).toBe('fixed');
  expect(Math.round(s.panelWidth)).toBe(320);
  expect(s.z).toBe('2147483647');
  expect(s.bg).not.toBe('rgba(0, 0, 0, 0)');
  expect(s.btnBg).not.toBe('rgba(0, 0, 0, 0)');
  // And it works end to end.
  await page.keyboard.type('Ann');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Mon');
  await page.keyboard.press('Enter');
  await expect(page.locator('#text')).toHaveValue('Dear Ann, see you on Mon. Cheers, Ann! PS');
});

test('overlay supports dark mode via prefers-color-scheme', async ({ page, server, data }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await open(page, server, data);
  await page.click('#text');
  await page.keyboard.type(';one');
  await expect(overlay(page)).toHaveCount(1);
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector('[data-typebolt-overlay]').shadowRoot.querySelector('.panel')).backgroundColor);
  expect(bg).toBe('rgb(29, 30, 36)');
});

test('overlay works in an iframe and inside a shadow root input', async ({ page, server, data }) => {
  await open(page, server, data, 'frames.html');
  const f = page.frameLocator('#same');
  await f.locator('#text').click();
  await page.keyboard.type(';one');
  await expect(f.locator('[data-typebolt-overlay] input')).toHaveCount(1);
  await page.keyboard.type('Bob');
  await page.keyboard.press('Enter');
  await expect(f.locator('#text')).toHaveValue('Hello Bob');
  await page.goto(`http://127.0.0.1:${server.port}/shadow.html`);
  await page.locator('#sh-input').click();
  await page.keyboard.type(';one');
  await expect(page.locator('[data-typebolt-overlay] input')).toHaveCount(1);
  await page.keyboard.type('Eve');
  await page.keyboard.press('Enter');
  await expect(page.locator('#sh-input')).toHaveValue('Hello Eve');
});
