/* TypeBolt content script: detects a shortcut before the caret and expands it.
 * Wrapped in an IIFE because it may be injected more than once into the same page. */
(function () {
  'use strict';
  const E = globalThis.TypeBoltEngine;
  if (!E || typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;

  const INSTANCE_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel', '']);
  const IGNORE_ATTR = 'data-typebolt-ignore';

  // Single-instance guard: announce ourselves; older instances (same page, earlier
  // injection or pre-update version) tear themselves down on seeing a newer id.
  let destroyed = false;
  let index = E.buildIndex([]);
  let enabled = true;
  let disabledSites = [];
  let siteOff = false;
  let blocked = false; // set after an expansion until the next real keydown (no chained expansion)
  let inserting = false; // true while we mutate the DOM ourselves
  let pendingKey = null; // keydown awaiting an input event (keyup fallback)
  let activeOverlay = null;
  let guard = null; // pending-expansion guard, see armGuard()
  let busy = false; // an expansion is in flight (async)
  let checkTimer = null;
  let checkTarget = null;

  function onInit(e) {
    if (e.detail !== INSTANCE_ID) destroy();
  }
  document.addEventListener('typebolt:init', onInit, true);
  document.dispatchEvent(new CustomEvent('typebolt:init', { detail: INSTANCE_ID }));
  if (destroyed) return;

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    document.removeEventListener('typebolt:init', onInit, true);
    document.removeEventListener('input', onInput, true);
    document.removeEventListener('compositionend', onCompositionEnd, true);
    document.removeEventListener('compositionstart', onCompositionStart, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('keyup', onKeyUp, true);
    try { chrome.storage.onChanged.removeListener(onStorageChanged); } catch (_) { /* context gone */ }
    try { chrome.runtime.onMessage.removeListener(onMessage); } catch (_) { /* context gone */ }
    disarmGuard();
    if (activeOverlay) { try { activeOverlay.close(); } catch (_) { /* ignore */ } activeOverlay = null; }
  }

  function contextAlive() {
    let alive = false;
    try { alive = !!(chrome.runtime && chrome.runtime.id); } catch (_) { alive = false; }
    if (!alive) destroy();
    return alive;
  }

  /* ---------- state ---------- */

  function currentHostname() {
    if (location.hostname) return location.hostname;
    // about:blank / srcdoc frames: borrow the nearest same-origin ancestor's hostname.
    let w = window;
    for (let i = 0; i < 10 && w !== w.parent; i++) {
      w = w.parent;
      try { if (w.location.hostname) return w.location.hostname; } catch (_) { return ''; }
    }
    return '';
  }

  function recomputeSite() {
    siteOff = E.isSiteDisabled(currentHostname(), disabledSites);
  }

  function applyData(v) {
    index = E.buildIndex(Array.isArray(v.snippets) ? v.snippets : []);
    const s = v.settings && typeof v.settings === 'object' ? v.settings : {};
    enabled = s.enabled !== false;
    disabledSites = Array.isArray(s.disabledSites) ? s.disabledSites : [];
    recomputeSite();
  }

  function loadState() {
    return chrome.storage.local.get(['snippets', 'settings']).then(applyData).catch(() => {});
  }
  // Until the first load finishes, input events wait for it instead of being dropped.
  let ready = false;
  const firstLoad = loadState().then(() => { ready = true; });

  function onStorageChanged(changes, area) {
    if (area !== 'local' || destroyed) return;
    if (changes.snippets || changes.settings) loadState();
  }
  chrome.storage.onChanged.addListener(onStorageChanged);

  // Lets the service worker (and tests) force a state reload and know when it is done.
  function onMessage(msg, _sender, sendResponse) {
    if (msg && msg.type === 'typebolt:refresh') {
      loadState().then(() => sendResponse({ ok: true, id: INSTANCE_ID }));
      return true;
    }
    return false;
  }
  chrome.runtime.onMessage.addListener(onMessage);

  /* ---------- target detection ---------- */

  function hasIgnoreAncestor(node) {
    let n = node;
    while (n) {
      if (n.nodeType === 1 && n.hasAttribute(IGNORE_ATTR)) return true;
      n = n.parentNode || n.host || null; // hop out of shadow roots
    }
    return false;
  }

  /** Returns { kind: 'field'|'ce', el } or null. */
  function resolveTarget(node) {
    if (!node || node.nodeType !== 1 && node.nodeType !== 3) return null;
    const el = node.nodeType === 3 ? node.parentElement : node;
    if (!el) return null;
    const tag = el.localName;
    if (tag === 'textarea' || tag === 'input') {
      if (el.disabled || el.readOnly) return null;
      if (tag === 'input' && !TEXT_INPUT_TYPES.has(el.type)) return null;
      if (hasIgnoreAncestor(el)) return null;
      return { kind: 'field', el };
    }
    if (el.isContentEditable) {
      let host = el;
      while (host.parentElement && host.parentElement.isContentEditable) host = host.parentElement;
      if (hasIgnoreAncestor(host)) return null;
      return { kind: 'ce', el: host };
    }
    return null;
  }

  /* ---------- text before caret ---------- */

  function isBlockEl(el) {
    const d = el.ownerDocument.defaultView.getComputedStyle(el).display;
    return !(d === 'inline' || d.startsWith('inline-') || d === 'contents' || d === 'none');
  }

  /**
   * Collect at most `limit` chars immediately before the caret inside `host`.
   * Walks backwards node by node and stops at <br> or block boundaries, so the work
   * per keystroke is bounded by `limit`, never by document size.
   */
  function textBeforeCaretCE(host, limit) {
    const sel = host.ownerDocument.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    if (!host.contains(range.startContainer)) return null;
    let out = '';
    let cur;

    // Enter `n` (and its last descendants) from the end. Returns the leaf reached, or null on a boundary.
    function enterFromEnd(n) {
      for (;;) {
        if (n.nodeType === 1) {
          if (n.localName === 'br' || isBlockEl(n)) return null;
        } else if (n.nodeType === 3) {
          const room = limit - out.length;
          out = n.data.slice(Math.max(0, n.data.length - room)) + out;
          return n;
        } else {
          return n;
        }
        if (!n.lastChild) return n;
        n = n.lastChild;
      }
    }

    const node = range.startContainer;
    const offset = range.startOffset;
    if (node.nodeType === 3) {
      out = node.data.slice(Math.max(0, offset - limit), offset);
      if (out.length >= limit || offset - out.length > 0) return out;
      cur = node;
    } else if (offset > 0) {
      cur = enterFromEnd(node.childNodes[offset - 1]);
      if (!cur) return out;
    } else {
      if (node === host || isBlockEl(node)) return out;
      cur = node;
    }

    while (out.length < limit && cur && cur !== host) {
      if (cur.previousSibling) {
        cur = enterFromEnd(cur.previousSibling);
      } else {
        const parent = cur.parentNode;
        if (!parent || parent === host) break;
        if (parent.nodeType === 1 && isBlockEl(parent)) break; // left a block
        cur = parent;
      }
    }
    return out;
  }

  function textBeforeCaret(t) {
    const limit = index.maxLen + 2;
    if (t.kind === 'field') {
      const el = t.el;
      let a;
      let b;
      try { a = el.selectionStart; b = el.selectionEnd; } catch (_) { return null; }
      if (a == null || a !== b) return null;
      return el.value.slice(Math.max(0, a - limit), a);
    }
    return textBeforeCaretCE(t.el, limit);
  }

  /* ---------- expansion ---------- */

  function graphemeCount(str) {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      let n = 0;
      for (const _ of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(str)) n++; // eslint-disable-line no-unused-vars
      return n;
    }
    return Array.from(str).length;
  }

  const tick = (ms) => new Promise((r) => setTimeout(r, ms || 0));

  /**
   * Resolve after the next selectionchange (or a short timeout). Rich editors (Lexical, Slate,
   * Draft.js) sync their model from selectionchange, so they must see our selection change
   * before we insert or paste.
   */
  function settleSelection(doc) {
    return new Promise((resolve) => {
      let done = false;
      const fin = () => {
        if (done) return;
        done = true;
        doc.removeEventListener('selectionchange', fin);
        setTimeout(resolve, 0);
      };
      doc.addEventListener('selectionchange', fin);
      setTimeout(fin, 40);
    });
  }

  /** Give an editor that commits asynchronously (microtask / React render) time to finish. */
  async function waitForCommit() {
    await tick(0);
    await tick(16);
  }

  /**
   * Pending-expansion guard. While we hold the shortcut selected (before the replacement is
   * inserted), a real user key / input / click must never replace that selection: the guard
   * collapses it back to the end of the shortcut *before* the browser's default action runs and
   * marks the expansion aborted. Outcome: the literal shortcut plus what the user typed, never
   * lost text. Synthetic events (ours or the page's) are ignored via isTrusted.
   */
  const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'NumLock', 'ScrollLock', 'Fn']);

  function onUserAction(e) {
    const g = guard;
    if (!g || g.aborted || !e.isTrusted) return;
    if (e.type === 'keydown' && MODIFIER_KEYS.has(e.key)) return;
    g.aborted = true;
    try {
      if (g.kind === 'field') {
        const end = g.el.selectionEnd;
        if (g.el.selectionStart !== end) g.el.setSelectionRange(end, end);
      } else {
        const sel = g.el.ownerDocument.getSelection();
        if (sel && !sel.isCollapsed && sel.toString() === g.shortcut) sel.collapseToEnd();
      }
    } catch (_) { /* element gone */ }
  }

  function armGuard(kind, el, shortcut) {
    disarmGuard();
    guard = { kind, el, shortcut, aborted: false };
    for (const type of ['keydown', 'beforeinput', 'mousedown', 'compositionstart']) document.addEventListener(type, onUserAction, true);
    return guard;
  }

  function disarmGuard() {
    if (!guard) return;
    for (const type of ['keydown', 'beforeinput', 'mousedown', 'compositionstart']) document.removeEventListener(type, onUserAction, true);
    guard = null;
  }

  /** Select the shortcut (which ends at the caret). Returns a context or null. */
  async function selectShortcut(t, shortcut) {
    if (t.kind === 'field') {
      const el = t.el;
      const end = el.selectionEnd;
      const start = end - shortcut.length;
      if (start < 0 || el.value.slice(start, end) !== shortcut) return null;
      el.setSelectionRange(start, end);
      return { kind: 'field', el, start, end, shortcut };
    }
    const doc = t.el.ownerDocument;
    const sel = doc.getSelection();
    const n = graphemeCount(shortcut);
    for (let i = 0; i < n; i++) sel.modify('extend', 'backward', 'character');
    if (sel.toString() !== shortcut) {
      sel.collapseToEnd();
      return null;
    }
    const ctx = { kind: 'ce', el: t.el, range: sel.getRangeAt(0).cloneRange(), shortcut };
    await settleSelection(doc);
    // The editor may have re-rendered; make sure the shortcut is still what is selected.
    const again = doc.getSelection();
    if (!again.rangeCount || again.isCollapsed || again.toString() !== shortcut) return null;
    if (guard && guard.aborted) return null;
    return ctx;
  }

  function ctxStillSelected(ctx) {
    const sel = ctx.el.ownerDocument.getSelection();
    return !!sel && sel.rangeCount > 0 && !sel.isCollapsed && sel.toString() === ctx.shortcut;
  }

  /** True when the text right before the caret in `t` ends with `shortcut`. */
  function caretAfterShortcut(t, shortcut) {
    const before = textBeforeCaret(t);
    return !!before && before.endsWith(shortcut);
  }

  /**
   * After a focus change (form overlay) re-find the shortcut by text instead of trusting a
   * possibly stale Range: first at the current caret, then at the end of the saved Range.
   */
  async function reselectShortcut(ctx) {
    const el = ctx.el;
    if (!el.isConnected) return null;
    el.focus();
    if (ctx.kind === 'field') {
      let start = ctx.start;
      if (el.value.slice(ctx.start, ctx.end) !== ctx.shortcut) {
        start = el.value.lastIndexOf(ctx.shortcut, ctx.end);
        if (start < 0) return null;
      }
      ctx.start = start;
      ctx.end = start + ctx.shortcut.length;
      el.setSelectionRange(ctx.start, ctx.end);
      return ctx;
    }
    await tick(0);
    if (!(await caretAfterShortcutCE(el, ctx.shortcut, ctx.range))) return null;
    const t = { kind: 'ce', el };
    return selectShortcut(t, ctx.shortcut);
  }

  /**
   * Chrome's execCommand('insertText') fires `input` but no `beforeinput`, and several editors
   * (Slate, Lexical) only learn about text from `beforeinput`. So we dispatch one ourselves
   * first: if the page preventDefault()s it, the editor has taken the insertion over and must
   * be left alone; otherwise the native insertion runs.
   */
  function offerBeforeInput(el, text) {
    let ev;
    try {
      ev = new InputEvent('beforeinput', { bubbles: true, cancelable: true, composed: true, inputType: 'insertText', data: text });
    } catch (_) { return false; }
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  }

  /** Native insertion through the editing pipeline (undoable, fires `input`). */
  function execInsert(doc, text) {
    try { return doc.execCommand('insertText', false, text); } catch (_) { return false; }
  }

  function fireInput(el, text) {
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text }));
  }

  /** Slate only: `beforeinput` insertFromPaste (Lexical ignores its dataTransfer, so not generic). */
  function pasteViaBeforeInput(el, text) {
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const ev = new InputEvent('beforeinput', { bubbles: true, cancelable: true, composed: true, inputType: 'insertFromPaste', dataTransfer: dt });
      el.dispatchEvent(ev);
      return ev.defaultPrevented;
    } catch (_) { return false; }
  }

  /**
   * Multi-line text into rich editors: hand it over as a `paste` event, which every editor
   * framework handles (Draft.js mangles "\n" inside insertText). If nothing calls
   * preventDefault() (a plain contenteditable), the caller falls back to native insertion.
   * Returns true if an editor handled it.
   */
  function pasteInto(el, text) {
    let dt;
    try {
      dt = new DataTransfer();
      dt.setData('text/plain', text);
    } catch (_) { return false; }
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true, composed: true });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  }

  /**
   * Replace the selected shortcut in ctx with `text`; place the caret at cursorOffset.
   * Returns false (and changes nothing) if the user acted first and the guard aborted.
   */
  async function insertRendered(ctx, text, cursorOffset) {
    const el = ctx.el;
    const doc = el.ownerDocument;
    if (guard && guard.aborted) { disarmGuard(); return false; }
    inserting = true;
    try {
      if (ctx.kind === 'field') {
        disarmGuard();
        const before = el.value;
        const ok = execInsert(doc, text);
        if (!ok || el.value === before) {
          el.setRangeText(text, ctx.start, ctx.end, 'end');
          fireInput(el, text);
        }
        if (cursorOffset != null) {
          const caret = ctx.start + cursorOffset;
          el.setSelectionRange(caret, caret);
        }
        return true;
      }

      const sel = doc.getSelection();
      const beforeHtml = el.innerHTML;
      let handled = false;
      if (!ctxStillSelected(ctx)) { disarmGuard(); return false; }
      disarmGuard(); // from here on the replacement is being inserted synchronously
      if (text.includes('\n')) {
        // Slate throttles its DOM-selection sync (100 ms) and does not flush it on `paste`, but it
        // does flush it when handling a beforeinput, so offer it the text that way first.
        if (el.closest('[data-slate-editor]')) handled = pasteViaBeforeInput(el, text);
        if (!handled) handled = pasteInto(el, text);
      }
      if (!handled) {
        handled = offerBeforeInput(el, text);
        if (!handled) {
          const ok = execInsert(doc, text);
          if (!ok || el.innerHTML === beforeHtml) insertNodesFallback(ctx, text);
        }
      }
      // Editors commit asynchronously; wait before touching the selection again.
      await waitForCommit();
      if (cursorOffset != null) {
        const tail = graphemeCount(text.slice(cursorOffset));
        for (let i = 0; i < tail; i++) sel.modify('move', 'backward', 'character');
        await settleSelection(doc);
      }
      return true;
    } finally {
      inserting = false;
    }
  }

  /** Last resort when nothing handled the insertion and nothing changed: build the nodes. */
  function insertNodesFallback(ctx, text) {
    const el = ctx.el;
    const doc = el.ownerDocument;
    const sel = doc.getSelection();
    const rg = sel.rangeCount ? sel.getRangeAt(0) : ctx.range;
    rg.deleteContents();
    const frag = doc.createDocumentFragment();
    text.split('\n').forEach((ln, i) => {
      if (i > 0) frag.appendChild(doc.createElement('br'));
      if (ln) frag.appendChild(doc.createTextNode(ln));
    });
    const last = frag.lastChild;
    rg.insertNode(frag);
    if (last) {
      const nr = doc.createRange();
      nr.setStartAfter(last);
      nr.collapse(true);
      sel.removeAllRanges();
      sel.addRange(nr);
    }
    fireInput(el, text);
  }

  function report(snippet, text, shortcut) {
    try {
      chrome.runtime.sendMessage({ type: 'typebolt:used', id: snippet.id, charsSaved: E.charsSaved(text, shortcut) });
    } catch (_) { /* extension context invalidated */ }
  }

  async function tryExpand(node) {
    if (destroyed || blocked || busy || inserting || !enabled || siteOff) return;
    if (!contextAlive()) return;
    if (activeOverlay) return;
    const t = resolveTarget(node);
    if (!t) return;
    const before = textBeforeCaret(t);
    if (!before) return;
    const m = E.findMatch(before, index);
    if (!m) return;
    busy = true;
    armGuard(t.kind, t.el, m.shortcut);
    try {
      const ctx = await selectShortcut(t, m.shortcut);
      if (!ctx || destroyed) return;
      blocked = true;
      const { snippet, shortcut } = m;
      const fields = E.getInputFields(snippet.content);
      const locale = (navigator.language || 'en');

      if (fields.length === 0) {
        const { text, cursorOffset } = E.renderTemplate(snippet.content, { now: new Date(), locale });
        if (await insertRendered(ctx, text, cursorOffset)) report(snippet, text, shortcut);
        return;
      }

      const Overlay = globalThis.TypeBoltOverlay;
      if (!Overlay) { // overlay unavailable: leave the shortcut untouched
        await cancelContext(ctx);
        return;
      }
      // Park the page selection after the shortcut while the overlay owns the keyboard.
      collapseAfter(ctx);
      disarmGuard();
      activeOverlay = Overlay.open({
        title: snippet.name || shortcut,
        fields,
        anchor: t.el,
        onSubmit(values) {
          activeOverlay = null;
          finishOverlay(ctx, snippet, shortcut, values, locale);
        },
        onCancel() {
          activeOverlay = null;
          cancelContext(ctx);
        },
      });
    } finally {
      disarmGuard();
      busy = false;
    }
  }

  async function finishOverlay(ctx, snippet, shortcut, values, locale) {
    busy = true;
    armGuard(ctx.kind, ctx.el, shortcut);
    try {
      const fresh = await reselectShortcut(ctx);
      if (!fresh) return;
      await settleSelection(fresh.el.ownerDocument);
      const { text, cursorOffset } = E.renderTemplate(snippet.content, { now: new Date(), locale, inputs: values });
      if (await insertRendered(fresh, text, cursorOffset)) report(snippet, text, shortcut);
    } finally {
      disarmGuard();
      blocked = true; // keystrokes typed in the overlay cleared it; no chained expansion
      busy = false;
    }
  }

  function collapseAfter(ctx) {
    try {
      if (ctx.kind === 'field') ctx.el.setSelectionRange(ctx.end, ctx.end);
      else ctx.el.ownerDocument.getSelection().collapseToEnd();
    } catch (_) { /* element gone */ }
  }

  /**
   * Put the caret right after the shortcut in a contenteditable, tolerating editors that
   * restore their own selection on focus: try the current caret, the end of the saved Range,
   * then a search of the text nodes; verify, and retry once after the editor has settled.
   */
  async function caretAfterShortcutCE(el, shortcut, range) {
    const t = { kind: 'ce', el };
    const doc = el.ownerDocument;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (caretAfterShortcut(t, shortcut)) {
        await tick(30);
        if (caretAfterShortcut(t, shortcut)) return true;
      }
      const sel = doc.getSelection();
      try {
        if (range && el.contains(range.endContainer)) sel.collapse(range.endContainer, range.endOffset);
      } catch (_) { /* stale range */ }
      if (!caretAfterShortcut(t, shortcut)) {
        const hit = findShortcutText(el, shortcut);
        if (hit) sel.collapse(hit.node, hit.end);
      }
      await settleSelection(doc);
    }
    return caretAfterShortcut(t, shortcut);
  }

  /** Last text node in `el` containing `shortcut` (re-resolves positions after re-renders). */
  function findShortcutText(el, shortcut) {
    const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let found = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.data.lastIndexOf(shortcut);
      if (i >= 0) found = { node: n, end: i + shortcut.length };
    }
    return found;
  }

  /** Cancel: focus back on the element with the caret right after the (untouched) shortcut. */
  async function cancelContext(ctx) {
    try {
      const el = ctx.el;
      el.focus();
      if (ctx.kind === 'field') {
        el.setSelectionRange(ctx.end, ctx.end);
        return;
      }
      await tick(0);
      await caretAfterShortcutCE(el, ctx.shortcut, ctx.range);
    } catch (_) { /* element gone */ }
  }

  /* ---------- listeners ---------- */

  /**
   * Checks are deferred with setTimeout(0) and coalesced, so the page's editor finishes
   * handling its own keystroke (Slate/Lexical reconcile on input) before we touch the DOM.
   */
  function scheduleCheck(node) {
    checkTarget = node;
    if (checkTimer !== null) return;
    checkTimer = setTimeout(async () => {
      checkTimer = null;
      const target = checkTarget;
      checkTarget = null;
      if (destroyed) return;
      if (!ready) await firstLoad;
      tryExpand(target);
    }, 0);
  }

  function realTarget(e) {
    const p = typeof e.composedPath === 'function' ? e.composedPath() : null;
    return (p && p[0]) || e.target;
  }

  function onInput(e) {
    if (destroyed) return;
    if (pendingKey) pendingKey.gotInput = true;
    if (inserting || blocked) return;
    if (e.isComposing) return;
    if (e.inputType && e.inputType !== 'insertText') return;
    scheduleCheck(realTarget(e));
  }

  function onCompositionStart() {
    blocked = false;
  }

  function onCompositionEnd(e) {
    if (destroyed || inserting) return;
    // Chrome fires the final isComposing input before compositionend; check once after the
    // browser has committed the text.
    scheduleCheck(realTarget(e));
  }

  function onKeyDown(e) {
    if (destroyed) return;
    blocked = false;
    pendingKey = null;
    if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing) {
      pendingKey = { target: realTarget(e), gotInput: false };
    }
  }

  function onKeyUp() {
    if (destroyed) return;
    const p = pendingKey;
    pendingKey = null;
    if (p && !p.gotInput && !blocked) scheduleCheck(p.target);
  }

  document.addEventListener('input', onInput, true);
  document.addEventListener('compositionstart', onCompositionStart, true);
  document.addEventListener('compositionend', onCompositionEnd, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keyup', onKeyUp, true);
})();
