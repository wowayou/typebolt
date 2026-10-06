'use strict';
// Regression suite against real editor frameworks. Assertions read each editor's own model
// (not just the DOM), driven by real keyboard input.
const { test, expect } = require('./fixtures');

const EDITORS = {
  pm: { label: 'ProseMirror', page: 'real-editors.html', sel: '#pm .ProseMirror', model: 'pmText()' },
  lx: { label: 'Lexical', page: 'real-editors.html', sel: '#lx', model: 'lxText()' },
  ri: { label: 'React input', page: 'real-editors.html', sel: '#r-input', model: 'reactState.a', single: true },
  rt: { label: 'React textarea', page: 'real-editors.html', sel: '#r-ta', model: 'reactState.b' },
  ql: { label: 'Quill', page: 'real-editors2.html', sel: '#quill .ql-editor', model: 'quillText()' },
  dj: { label: 'Draft.js', page: 'real-editors2.html', sel: '#draft .public-DraftEditor-content', model: 'draftText()' },
  sl: { label: 'Slate', page: 'real-editors2.html', sel: '#slate-ed', model: 'slateText()' },
};

const SNIPS = [
  { id: 'thx', shortcut: ';thx', content: 'Thanks!' },
  { id: 'ml', shortcut: ';ml', content: 'Line one\nLine two' },
  { id: 'cur', shortcut: ';cur', content: 'Hello {cursor}world' },
  { id: 'fm', shortcut: ';fm', content: 'Hi {input:Name}, see you {input:Day}. Bye {input:Name}' },
];

const DELAY = { delay: 30 };

for (const [key, ed] of Object.entries(EDITORS)) {
  test.describe(`real editor: ${ed.label}`, () => {
    let errors;
    const model = (page) => page.evaluate(ed.model);
    const dom = (page) => page.$eval(ed.sel, (el) => (('value' in el && el.tagName !== 'DIV') ? el.value : el.innerText));
    // Poll the editor model: some editors commit asynchronously.
    const expectModel = (page, expected) => expect.poll(() => model(page), { timeout: 3000 }).toBe(expected);

    // Text before the caret, read from the DOM selection (what the next keystroke will use).
    // Wait for it before typing again: the extension positions the caret asynchronously.
    const caretText = (page) => page.evaluate(() => {
      const a = document.activeElement;
      if (a && 'value' in a && a.tagName !== 'DIV') return a.value.slice(0, a.selectionStart);
      const sel = getSelection();
      if (!a || !sel.rangeCount) return null;
      const r = document.createRange();
      r.selectNodeContents(a);
      r.setEnd(sel.anchorNode, sel.anchorOffset);
      return r.toString();
    });
    const expectCaret = (page, expected) => expect.poll(() => caretText(page), { timeout: 3000 }).toBe(expected);

    test.beforeEach(async ({ page, server, data }) => {
      errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await data.set({ snippets: SNIPS });
      await page.goto(`http://127.0.0.1:${server.port}/${ed.page}`);
      await page.click(ed.sel);
    });
    test.afterEach(() => {
      expect(errors, 'page errors').toEqual([]);
    });

    test('simple expand (model and DOM agree)', async ({ page }) => {
      await page.keyboard.type('ok ;thx', DELAY);
      await expectModel(page, 'ok Thanks!');
      expect((await dom(page)).trim()).toBe('ok Thanks!');
    });

    test('keep typing after the expansion', async ({ page }) => {
      await page.keyboard.type(';thx more', DELAY);
      await expectModel(page, 'Thanks! more');
    });

    test('{cursor} places the caret in the editor selection', async ({ page }) => {
      await page.keyboard.type(';cur', DELAY);
      await expect.poll(() => model(page)).toBe('Hello world');
      await expectCaret(page, 'Hello ');
      await page.keyboard.type('X', DELAY);
      await expectModel(page, 'Hello Xworld');
    });

    if (!ed.single) {
      test('multi-line snippet keeps both lines', async ({ page }) => {
        await page.keyboard.type(';ml', DELAY);
        await expect.poll(() => model(page), { timeout: 3000 }).toMatch(/^Line one\n+Line two$/);
        await expect.poll(() => caretText(page), { timeout: 3000 }).toMatch(/^Line one\n*Line two$/);
        await page.keyboard.type('!', DELAY);
        await expect.poll(() => model(page), { timeout: 3000 }).toMatch(/^Line one\n+Line two!$/);
      });
    }

    // Fast typists keep typing right after a shortcut. Whatever happens, no user text may be
    // lost or duplicated: the model is either the full expansion + " ok" or exactly the literal
    // shortcut + " ok".
    for (const [short, expanded, ms] of [[';thx', 'Thanks!', 40], [';ml', 'Line one\nLine two', 40], [';ml', 'Line one\nLine two', 100]]) {
      if (ed.single && short === ';ml') continue;
      test(`fast typing "${short} ok" at ${ms} ms/key never loses text`, async ({ page }) => {
        await page.keyboard.type(`${short} ok`, { delay: ms });
        await page.waitForTimeout(500); // let any in-flight expansion finish or abort
        const m = await model(page);
        const isExpansion = m.replace(/\n+/g, '\n') === `${expanded} ok`;
        const isLiteral = m === `${short} ok`;
        expect(isExpansion || isLiteral, `unexpected result ${JSON.stringify(m)}`).toBe(true);
        // Report which outcome each editor produced (visible in the test log annotations).
        test.info().annotations.push({ type: 'outcome', description: isExpansion ? 'expanded' : 'literal' });
        // Shrunk window: every editor is expected to actually expand at these speeds.
        expect(isExpansion, `${ed.label} should expand at ${ms} ms/key, got ${JSON.stringify(m)}`).toBe(true);
      });
    }

    // Faster than a human can type: the pending-expansion guard may abort the expansion, but the
    // user's text must still survive intact (literal shortcut + " ok" is a legal outcome).
    for (const [short, expanded, ms] of [[';thx', 'Thanks!', 10], [';ml', 'Line one\nLine two', 10], [';ml', 'Line one\nLine two', 0]]) {
      if (ed.single && short === ';ml') continue;
      test(`superhuman typing "${short} ok" at ${ms} ms/key loses nothing`, async ({ page }) => {
        await page.keyboard.type(`${short} ok`, ms ? { delay: ms } : undefined);
        await page.waitForTimeout(600);
        const m = await model(page);
        const isExpansion = m.replace(/\n+/g, '\n') === `${expanded} ok`;
        const isLiteral = m === `${short} ok`;
        expect(isExpansion || isLiteral, `unexpected result ${JSON.stringify(m)}`).toBe(true);
        test.info().annotations.push({ type: 'outcome', description: isExpansion ? 'expanded' : 'literal' });
      });
    }

    test('form overlay with a repeated label fills the editor model', async ({ page }) => {
      await page.keyboard.type(';fm', DELAY);
      await expect(page.locator('[data-typebolt-overlay] input')).toHaveCount(2);
      await page.keyboard.type('Ann');
      await page.keyboard.press('Tab');
      await page.keyboard.type('Mon');
      await page.keyboard.press('Enter');
      await expectModel(page, 'Hi Ann, see you Mon. Bye Ann');
      await expectCaret(page, 'Hi Ann, see you Mon. Bye Ann');
      // Typed field values must not have leaked, and typing continues normally.
      await page.keyboard.type('!', DELAY);
      await expectModel(page, 'Hi Ann, see you Mon. Bye Ann!');
    });

    test('Esc on the form overlay leaves the shortcut and keeps the editor usable', async ({ page }) => {
      await page.keyboard.type(';fm', DELAY);
      await expect(page.locator('[data-typebolt-overlay]')).toHaveCount(1);
      await page.keyboard.type('zz');
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-typebolt-overlay]')).toHaveCount(0);
      await expectModel(page, ';fm');
      await expectCaret(page, ';fm');
      await page.keyboard.type('!', DELAY);
      await expectModel(page, ';fm!');
    });
  });
}

test('React textarea: Ctrl+Z restores the typed shortcut', async ({ page, server, data }) => {
  await data.set({ snippets: SNIPS });
  await page.goto(`http://127.0.0.1:${server.port}/real-editors.html`);
  await page.click('#r-ta');
  await page.keyboard.type(';thx', DELAY);
  await expect.poll(() => page.evaluate('reactState.b')).toBe('Thanks!');
  await page.keyboard.press('Control+z');
  await expect.poll(() => page.evaluate('reactState.b')).toBe(';thx');
});
