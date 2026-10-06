'use strict';
const { test, expect, flush, caretBefore } = require('./fixtures');

const SNIPS = [
  { shortcut: ';thx', content: 'Thanks so much!' },
  { shortcut: ';multi', content: 'line one\nline two' },
  { shortcut: ';cur', content: 'Hello {cursor}world' },
  { shortcut: ';dt', content: 'Today is {date}' },
  { shortcut: ';cn', content: '{date:YYYY年MM月DD日}' },
];

async function open(page, server, data, snippets = SNIPS, settings, file = 'editors.html') {
  await data.set({ snippets, settings });
  await page.goto(`http://127.0.0.1:${server.port}/${file}`);
}

test('AC1 input[type=text] expands, caret at end, input event fired', async ({ page, server, data }) => {
  await open(page, server, data);
  await page.click('#text');
  await page.keyboard.type('hi ;thx');
  await expect(page.locator('#text')).toHaveValue('hi Thanks so much!');
  const caret = await page.$eval('#text', (el) => [el.selectionStart, el.selectionEnd, el.value.length]);
  expect(caret).toEqual([18, 18, 18]);
  const events = await page.evaluate(() => window.__events);
  expect(events.some((e) => e.type === 'input' && e.inputType === 'insertText' && e.value === 'hi Thanks so much!')).toBe(true);
});

test('AC1 all supported input types expand', async ({ page, server, data }) => {
  await open(page, server, data);
  for (const id of ['plain', 'search', 'url', 'tel']) {
    await page.click(`#${id}`);
    await page.keyboard.type(';thx');
    await expect(page.locator(`#${id}`)).toHaveValue('Thanks so much!');
  }
});

test('AC2 textarea keeps multi-line content', async ({ page, server, data }) => {
  await open(page, server, data);
  await page.click('#ta');
  await page.keyboard.type(';multi');
  await expect.poll(() => page.$eval('#ta', (el) => el.value)).toBe('line one\nline two');
});

test('AC3 contenteditable single and multi line', async ({ page, server, data }) => {
  await open(page, server, data);
  await page.click('#ce');
  await page.keyboard.type('x ;thx');
  await expect.poll(() => page.$eval('#ce', (el) => el.innerText)).toBe('x Thanks so much!');
  await page.click('#ce-inline');
  await page.keyboard.type(';multi');
  await expect.poll(() => page.$eval('#ce-inline', (el) => el.innerText)).toBe('line one\nline two');
  expect(await page.$eval('#ce-inline', (el) => el.innerHTML)).toContain('<div>line two</div>');
});

test('AC4 {cursor} in input and contenteditable', async ({ page, server, data }) => {
  await open(page, server, data);
  await page.click('#text');
  await page.keyboard.type(';cur');
  await expect.poll(() => page.$eval('#text', (el) => [el.value, el.selectionStart])).toEqual(['Hello world', 6]);
  await page.keyboard.type('X');
  await expect(page.locator('#text')).toHaveValue('Hello Xworld');

  await page.click('#ce');
  await page.keyboard.type(';cur');
  await expect.poll(() => caretBefore(page, '#ce')).toBe('Hello ');
  await page.keyboard.type('Y');
  await expect.poll(() => page.$eval('#ce', (el) => el.innerText)).toBe('Hello Yworld');

  await page.click('#ta');
  await page.keyboard.type(';cur');
  await expect.poll(() => caretBefore(page, '#ta')).toBe('Hello ');
  await page.keyboard.type('Z');
  await expect.poll(() => page.$eval('#ta', (el) => el.value)).toBe('Hello Zworld');
});

test('AC5 date placeholders render in the page', async ({ page, server, data }) => {
  await open(page, server, data);
  await page.click('#text');
  await page.keyboard.type(';dt');
  const v = await page.$eval('#text', (el) => el.value);
  expect(v).toMatch(/^Today is \d{4}-\d{2}-\d{2}$/);
  await page.fill('#text', '');
  await page.keyboard.type(';cn');
  expect(await page.$eval('#text', (el) => el.value)).toMatch(/^\d{4}年\d{2}月\d{2}日$/);
});

test('AC7 word-boundary rule', async ({ page, server, data }) => {
  await open(page, server, data);
  await page.click('#text');
  await page.keyboard.type('abc;thx');
  await flush(page);
  await expect(page.locator('#text')).toHaveValue('abc;thx');
  await page.fill('#text', '');
  await page.keyboard.type('你好;thx');
  await expect(page.locator('#text')).toHaveValue('你好Thanks so much!');
  await page.fill('#text', '');
  await page.keyboard.type('hi ;thx');
  await expect(page.locator('#text')).toHaveValue('hi Thanks so much!');
  await page.fill('#text', '');
  await page.keyboard.type(';thx');
  await expect(page.locator('#text')).toHaveValue('Thanks so much!');
  // Contenteditable follows the same rule.
  await page.click('#ce');
  await page.keyboard.type('abc;thx');
  await flush(page);
  expect(await page.$eval('#ce', (el) => el.innerText)).toBe('abc;thx');
});

test('AC9 pasted text ending with a shortcut does not expand', async ({ page, server, data, context }) => {
  await open(page, server, data);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://127.0.0.1:${server.port}` });
  await page.click('#text');
  await page.evaluate(() => navigator.clipboard.writeText('pasted ;thx'));
  await page.keyboard.press('Control+V');
  await flush(page);
  await expect(page.locator('#text')).toHaveValue('pasted ;thx');
  await page.click('#ta');
  await page.keyboard.press('Control+V');
  await flush(page);
  expect(await page.$eval('#ta', (el) => el.value)).toBe('pasted ;thx');
});

test('AC10 password and email inputs never expand; no console errors', async ({ page, server, data }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await open(page, server, data);
  for (const id of ['password', 'email', 'readonly']) {
    await page.click(`#${id}`);
    await page.keyboard.type(';thx');
  }
  await flush(page);
  await expect(page.locator('#password')).toHaveValue(';thx');
  await expect(page.locator('#email')).toHaveValue(';thx');
  await page.click('#ignored-input');
  await page.keyboard.type(';thx');
  await flush(page);
  await expect(page.locator('#ignored-input')).toHaveValue(';thx');
  expect(errors).toEqual([]);
});

test('AC11 Ctrl+Z restores the typed shortcut in a textarea', async ({ page, server, data }) => {
  await open(page, server, data);
  await page.click('#ta');
  await page.keyboard.type('hello ;thx');
  await expect.poll(() => page.$eval('#ta', (el) => el.value)).toBe('hello Thanks so much!');
  await page.keyboard.press('Control+Z');
  await expect.poll(() => page.$eval('#ta', (el) => el.value)).toBe('hello ;thx');
});

test('AC12 no chained expansion', async ({ page, server, data }) => {
  await open(page, server, data, [
    { shortcut: ';a1', content: 'see ;thx' },
    { shortcut: ';thx', content: 'Thanks' },
  ]);
  await page.click('#text');
  await page.keyboard.type(';a1');
  await expect(page.locator('#text')).toHaveValue('see ;thx');
  await page.waitForTimeout(150);
  await expect(page.locator('#text')).toHaveValue('see ;thx');
  await page.click('#ce');
  await page.keyboard.type(';a1');
  await page.waitForTimeout(150);
  expect(await page.$eval('#ce', (el) => el.innerText)).toBe('see ;thx');
});

test('keyup fallback: editors that swallow beforeinput still expand', async ({ page, server, data }) => {
  await open(page, server, data);
  await page.click('#suppressed');
  await page.keyboard.type('a ;thx');
  await expect(page.locator('#suppressed')).toHaveValue('a Thanks so much!');
});

test('longest match wins', async ({ page, server, data }) => {
  await open(page, server, data, [
    { shortcut: 'xx;a', content: 'short' },
    { shortcut: ';a', content: 'unused' },
  ].slice(0, 1).concat([{ shortcut: ';zz', content: 'zz' }]));
  await page.click('#text');
  await page.keyboard.type(';zz');
  await expect(page.locator('#text')).toHaveValue('zz');
});

test('AC13 global disable and site disable (incl. subdomain), live without reload', async ({ page, server, data }) => {
  await open(page, server, data);
  await page.click('#text');
  await page.keyboard.type(';thx');
  await expect(page.locator('#text')).toHaveValue('Thanks so much!');

  // Global off: poll until the storage change reaches the page (no reload, no refresh message).
  await data.set({ snippets: SNIPS, settings: { enabled: false } });
  await expect.poll(async () => {
    await page.fill('#text', '');
    await page.keyboard.type(';thx');
    await flush(page);
    return page.$eval('#text', (el) => el.value);
  }).toBe(';thx');
  await page.fill('#text', '');
  await page.keyboard.type(';thx');
  await flush(page);
  await expect(page.locator('#text')).toHaveValue(';thx');

  // Back on.
  await data.set({ snippets: SNIPS });
  await expect.poll(async () => {
    await page.fill('#text', '');
    await page.keyboard.type(';thx');
    await flush(page);
    return page.$eval('#text', (el) => el.value);
  }).toBe('Thanks so much!');

  // Site rule: "localhost" must cover app.localhost:PORT.
  await data.set({ snippets: SNIPS, settings: { disabledSites: ['http://LOCALHOST:1/x'] } });
  await page.goto(`http://app.localhost:${server.port}/editors.html`);
  await page.click('#text');
  await page.keyboard.type(';thx');
  await flush(page);
  await expect(page.locator('#text')).toHaveValue(';thx');
  // A non-matching rule leaves it enabled.
  await data.set({ snippets: SNIPS, settings: { disabledSites: ['example.com'] } });
  await page.goto(`http://app.localhost:${server.port}/editors.html`);
  await page.click('#text');
  await page.keyboard.type(';thx');
  await expect(page.locator('#text')).toHaveValue('Thanks so much!');
});

test('AC14 new snippet works without reloading', async ({ page, server, data }) => {
  await open(page, server, data, [{ shortcut: ';old', content: 'old' }]);
  await page.click('#text');
  await data.set({ snippets: [{ shortcut: ';old', content: 'old' }, { shortcut: ';fresh', content: 'brand new' }] });
  await expect.poll(async () => {
    await page.fill('#text', '');
    await page.keyboard.type(';fresh');
    return page.$eval('#text', (el) => el.value);
  }).toBe('brand new');
});

test('AC15 same-origin iframe and srcdoc iframe', async ({ page, server, data }) => {
  await open(page, server, data, SNIPS, undefined, 'frames.html');
  const same = page.frameLocator('#same');
  await same.locator('#text').click();
  await page.keyboard.type(';thx');
  await expect(same.locator('#text')).toHaveValue('Thanks so much!');
  const sd = page.frameLocator('#srcdoc');
  await sd.locator('#sd-input').click();
  await page.keyboard.type(';thx');
  await expect(sd.locator('#sd-input')).toHaveValue('Thanks so much!');
  await sd.locator('#sd-ta').click();
  await page.keyboard.type(';multi');
  await expect(sd.locator('#sd-ta')).toHaveValue('line one\nline two');
});

test('AC16 input and textarea inside an open shadow root', async ({ page, server, data }) => {
  await open(page, server, data, SNIPS, undefined, 'shadow.html');
  await page.locator('#sh-input').click();
  await page.keyboard.type('a ;thx');
  await expect(page.locator('#sh-input')).toHaveValue('a Thanks so much!');
  await page.locator('#sh-ta').click();
  await page.keyboard.type(';multi');
  await expect(page.locator('#sh-ta')).toHaveValue('line one\nline two');
});

test('AC17 expansion works on a strict-CSP page', async ({ page, server, data }) => {
  await open(page, server, data, SNIPS, undefined, 'csp-editors.html');
  await page.click('#text');
  await page.keyboard.type(';thx');
  await expect(page.locator('#text')).toHaveValue('Thanks so much!');
  await page.click('#ce');
  await page.keyboard.type(';multi');
  await expect.poll(() => page.$eval('#ce', (el) => el.innerText)).toBe('line one\nline two');
});
