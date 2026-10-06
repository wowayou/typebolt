'use strict';
const { test, expect, flush } = require('./fixtures');

const SNIPS = [
  { id: 'thx', shortcut: ';thx', content: 'Thanks so much!' },
  { id: 'rep', shortcut: ';rep', content: 'x ;rep' },
  { id: 'long', shortcut: ';long', content: 'abcdefghijklmnopqrstuvwxyz' },
];

async function open(page, server, data, file = 'editors.html') {
  await data.set({ snippets: SNIPS });
  await page.goto(`http://127.0.0.1:${server.port}/${file}`);
}

for (const sel of ['#text', '#ta', '#ce']) {
  test(`AC8 IME composition does not expand until committed (${sel})`, async ({ page, server, data, context }) => {
    await open(page, server, data);
    await page.click(sel);
    const cdp = await context.newCDPSession(page);
    const read = () => page.$eval(sel, (el) => ('value' in el ? el.value : el.innerText));
    await page.evaluate(() => { window.__comp = []; for (const t of ['compositionstart', 'compositionend']) document.addEventListener(t, () => window.__comp.push(t)); });
    await cdp.send('Input.imeSetComposition', { text: 'hi ;thx', selectionStart: 7, selectionEnd: 7 });
    expect(await page.evaluate(() => window.__comp)).toEqual(['compositionstart']);
    expect(await read()).toBe('hi ;thx');
    await page.waitForTimeout(100); // an incorrect implementation would have expanded by now
    expect(await read()).toBe('hi ;thx');
    // Update the composition once more; still no expansion.
    await cdp.send('Input.imeSetComposition', { text: 'hi ;thx', selectionStart: 7, selectionEnd: 7 });
    expect(await read()).toBe('hi ;thx');
    // Commit: compositionend fires and the text before the caret ends with the shortcut.
    await cdp.send('Input.insertText', { text: 'hi ;thx' });
    await expect.poll(read).toBe('hi Thanks so much!');
    expect(await page.evaluate(() => window.__comp)).toEqual(['compositionstart', 'compositionend']);
  });
}

test('AC8 committed IME text that does not end with a shortcut is left alone', async ({ page, server, data, context }) => {
  await open(page, server, data);
  await page.click('#text');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: '你好', selectionStart: 2, selectionEnd: 2 });
  await cdp.send('Input.insertText', { text: '你好' });
  await page.waitForTimeout(100);
  await expect(page.locator('#text')).toHaveValue('你好');
});

test('AC22 rapid expansions are all counted (5 in a row)', async ({ page, server, data }) => {
  await open(page, server, data);
  await page.click('#ta');
  // Expansion is asynchronous (the page's editor gets to handle each keystroke first), so type
  // at a human-ish pace; counting 5 in a row still exercises the serialized stats queue.
  await page.keyboard.type(';thx ;thx ;thx ;thx ;thx', { delay: 25 });
  await expect.poll(() => page.$eval('#ta', (el) => el.value)).toBe(Array(5).fill('Thanks so much!').join(' '));
  const per = 'Thanks so much!'.length - ';thx'.length;
  await expect.poll(() => data.get('stats')).toMatchObject({
    total: { uses: 5, charsSaved: 5 * per },
    bySnippet: { thx: { uses: 5, charsSaved: 5 * per } },
  });
});

test('AC22 stats accumulate per snippet and into totals across snippets', async ({ page, server, data }) => {
  await open(page, server, data);
  await page.click('#text');
  await page.keyboard.type(';thx');
  await expect(page.locator('#text')).toHaveValue('Thanks so much!');
  await page.fill('#text', '');
  await page.keyboard.type(';long');
  await expect(page.locator('#text')).toHaveValue('abcdefghijklmnopqrstuvwxyz');
  await page.fill('#text', '');
  await page.keyboard.type(';thx');
  await expect(page.locator('#text')).toHaveValue('Thanks so much!');
  await expect.poll(async () => (await data.get('stats')).total.uses).toBe(3);
  const stats = await data.get('stats');
  expect(stats.bySnippet.thx.uses).toBe(2);
  expect(stats.bySnippet.thx.charsSaved).toBe(2 * ('Thanks so much!'.length - 4));
  expect(stats.bySnippet.long).toMatchObject({ uses: 1, charsSaved: 26 - 5 });
  expect(stats.total.charsSaved).toBe(2 * 11 + 21);
  expect(stats.bySnippet.thx.lastUsedAt).toBeGreaterThan(0);
});

test('AC30 re-injecting the content script does not cause double expansion', async ({ page, server, data, sw }) => {
  await open(page, server, data);
  const inject = () => sw.evaluate(async (port) => {
    const [tab] = await chrome.tabs.query({ url: `http://127.0.0.1:${port}/*` });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ['src/shared/engine.js', 'src/content/form-overlay.js', 'src/content/content.js'],
    });
  }, server.port);
  await inject();
  await inject();
  await data.refresh();
  await page.click('#text');
  await page.keyboard.type(';rep');
  // A second live instance would re-expand the inserted text (see 'x x ;rep').
  await expect(page.locator('#text')).toHaveValue('x ;rep');
  await flush(page);
  await expect(page.locator('#text')).toHaveValue('x ;rep');
  await expect.poll(async () => (await data.get('stats')).total.uses).toBe(1);
  await page.waitForTimeout(150);
  expect((await data.get('stats')).total.uses).toBe(1);
});

test('contenteditable: boundary rule across inline elements, <br> and block edges', async ({ page, server, data }) => {
  await open(page, server, data);
  const typeAtEnd = async (html, text, expectExpanded) => {
    await page.evaluate((h) => {
      const ce = document.getElementById('ce');
      ce.innerHTML = h;
      ce.focus();
      const r = document.createRange();
      r.selectNodeContents(ce);
      r.collapse(false);
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
    }, html);
    await page.keyboard.type(text, { delay: 20 });
    // Negative cases wait for the deferred check; positive ones are polled by the caller.
    if (!expectExpanded) await flush(page);
    else await expect.poll(() => page.$eval('#ce', (el) => el.innerText)).toContain('Thanks so much!');
    return page.$eval('#ce', (el) => el.innerText);
  };
  // A word character in a previous inline element blocks the expansion.
  expect(await typeAtEnd('<b>abc</b>', ';thx', false)).toBe('abc;thx');
  // Start of a block counts as a boundary even if the previous block ends with a word.
  expect(await typeAtEnd('<div>abc</div><div><br></div>', ';thx', true)).toBe('abc\nThanks so much!');
  // After a <br>.
  expect(await typeAtEnd('abc<br><br>', ';thx', true)).toBe('abc\nThanks so much!');
  // After a space inside an inline element.
  expect(await typeAtEnd('<i>hello&nbsp;</i>', ';thx', true)).toBe('hello Thanks so much!');
  // After punctuation in plain text.
  expect(await typeAtEnd('end.', ';thx', true)).toBe('end.Thanks so much!');
});

test('{cursor} before a multi-line tail lands on the right line (contenteditable and textarea)', async ({ page, server, data }) => {
  await data.set({ snippets: [{ shortcut: ';cur2', content: 'A\nB{cursor}\nC' }] });
  await page.goto(`http://127.0.0.1:${server.port}/editors.html`);
  for (const sel of ['#ce', '#ta']) {
    await page.click(sel);
    await page.keyboard.type(';cur2', { delay: 20 });
    await expect.poll(() => page.$eval(sel, (el) => {
      const s = getSelection();
      if ('value' in el) return el.value.slice(0, el.selectionStart);
      if (!s.rangeCount) return null;
      const r = document.createRange();
      r.selectNodeContents(el);
      r.setEnd(s.anchorNode, s.anchorOffset);
      return r.toString();
    })).toBe(sel === '#ta' ? 'A\nB' : 'AB');
    await page.keyboard.type('X', { delay: 20 });
    await expect.poll(() => page.$eval(sel, (el) => ('value' in el ? el.value : el.innerText))).toBe('A\nBX\nC');
  }
});

test('shortcut with emoji / CJK characters expands (grapheme-aware selection)', async ({ page, server, data }) => {
  await data.set({ snippets: [{ shortcut: ';😀', content: 'smile' }, { shortcut: ';你好', content: 'hello' }] });
  await page.goto(`http://127.0.0.1:${server.port}/editors.html`);
  await page.click('#ce');
  await page.keyboard.insertText(';');
  await page.keyboard.insertText('😀');
  await expect.poll(() => page.$eval('#ce', (el) => el.innerText)).toBe('smile');
  await page.keyboard.type(' ;', { delay: 20 });
  await page.keyboard.insertText('你好');
  await expect.poll(() => page.$eval('#ce', (el) => el.innerText)).toBe('smile hello');
});
