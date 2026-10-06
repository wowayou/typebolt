/* TypeBolt fill-in form overlay ({input:Label} placeholders).
 * Lives in a Shadow DOM under <html>; styles come from a constructable stylesheet
 * (adoptedStyleSheets), so strict page CSP and page CSS cannot affect it. */
(function () {
  'use strict';

  const CSS = `
    :host { all: initial; }
    *, *::before, *::after { box-sizing: border-box; }
    .panel {
      --bg: #ffffff; --fg: #1c1d21; --muted: #6b6f7a; --border: #dcdde3;
      --field: #f6f6f8; --accent: #5b5bd6; --accent-fg: #ffffff; --ring: rgba(91, 91, 214, 0.35);
      --shadow: 0 12px 32px rgba(15, 16, 24, 0.18), 0 2px 6px rgba(15, 16, 24, 0.08);
      position: fixed; z-index: 2147483647; width: 320px; max-width: calc(100vw - 16px);
      padding: 12px; border: 1px solid var(--border); border-radius: 12px;
      background: var(--bg); color: var(--fg); box-shadow: var(--shadow);
      font: 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "PingFang SC", "Microsoft YaHei", sans-serif;
      text-align: left; letter-spacing: normal;
    }
    @media (prefers-color-scheme: dark) {
      .panel {
        --bg: #1d1e24; --fg: #ececf1; --muted: #9a9ea9; --border: #34363f;
        --field: #26272f; --accent: #7c7cf0; --accent-fg: #101018; --ring: rgba(124, 124, 240, 0.45);
        --shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
      }
    }
    .title { margin: 0 0 10px; font-size: 13px; font-weight: 600; color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .field { display: block; margin: 0 0 10px; }
    .label { display: block; margin: 0 0 4px; font-size: 12px; color: var(--muted); }
    input {
      display: block; width: 100%; height: 32px; margin: 0; padding: 0 10px;
      border: 1px solid var(--border); border-radius: 8px; background: var(--field); color: var(--fg);
      font: inherit; outline: none;
    }
    input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--ring); }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
    button {
      height: 30px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--border);
      background: transparent; color: var(--fg); font: inherit; cursor: pointer;
    }
    button:hover { background: var(--field); }
    button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); font-weight: 600; }
    button.primary:hover { filter: brightness(1.06); }
    button:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ring); }
  `;

  const FALLBACK = { overlayInsert: 'Insert (Enter)', overlayCancel: 'Cancel (Esc)' };
  function msg(key) {
    try {
      const v = chrome.i18n.getMessage(key);
      if (v) return v;
    } catch (_) { /* no i18n available */ }
    return FALLBACK[key] || key;
  }

  let current = null;

  function open(opts) {
    if (current) current.cancel();

    const host = document.createElement('div');
    host.setAttribute('data-typebolt-ignore', '');
    host.setAttribute('data-typebolt-overlay', '');
    const hs = (k, v) => host.style.setProperty(k, v, 'important');
    hs('all', 'initial');
    hs('position', 'fixed');
    hs('z-index', '2147483647');
    hs('top', '0');
    hs('left', '0');
    const root = host.attachShadow({ mode: 'open' });
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      root.adoptedStyleSheets = [sheet];
    } catch (_) { /* very old engines: fall back to unstyled controls */ }

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = opts.title || '';
    panel.setAttribute('aria-label', opts.title || 'TypeBolt');
    panel.appendChild(title);

    const inputs = [];
    for (const label of opts.fields) {
      const wrap = document.createElement('label');
      wrap.className = 'field';
      const cap = document.createElement('span');
      cap.className = 'label';
      cap.textContent = label;
      const input = document.createElement('input');
      input.type = 'text';
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('spellcheck', 'false');
      input.dataset.label = label;
      wrap.append(cap, input);
      panel.appendChild(wrap);
      inputs.push(input);
    }

    const actions = document.createElement('div');
    actions.className = 'actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'cancel';
    cancelBtn.textContent = msg('overlayCancel');
    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'primary submit';
    okBtn.textContent = msg('overlayInsert');
    actions.append(cancelBtn, okBtn);
    panel.appendChild(actions);
    root.appendChild(panel);

    let closed = false;
    const anchor = opts.anchor;

    function position() {
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const vh = document.documentElement.clientHeight || window.innerHeight;
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      let r = { left: 8, top: 8, bottom: 8 };
      try { r = anchor.getBoundingClientRect(); } catch (_) { /* detached */ }
      let top = r.bottom + 6;
      if (top + h > vh - 8) top = r.top - h - 6; // not enough room below: go above
      top = Math.max(8, Math.min(top, vh - h - 8));
      const left = Math.max(8, Math.min(r.left, vw - w - 8));
      panel.style.setProperty('top', `${Math.round(top)}px`);
      panel.style.setProperty('left', `${Math.round(left)}px`);
    }

    function teardown() {
      closed = true;
      document.removeEventListener('mousedown', onOutside, true);
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      observer.disconnect();
      host.remove();
      if (current === handle) current = null;
    }

    function submit() {
      if (closed) return;
      const values = {};
      for (const i of inputs) values[i.dataset.label] = i.value;
      teardown();
      if (opts.onSubmit) opts.onSubmit(values);
    }

    function cancel() {
      if (closed) return;
      teardown();
      if (opts.onCancel) opts.onCancel();
    }

    function onOutside(e) {
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
      if (!path.includes(host)) cancel();
    }

    // Keep page-level shortcut handlers (bubble phase) from seeing keystrokes typed here.
    for (const type of ['keydown', 'keyup', 'keypress', 'input', 'beforeinput']) {
      host.addEventListener(type, (e) => e.stopPropagation());
    }

    root.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return; // IME is still composing
      if (e.key === 'Enter') {
        if (e.target === cancelBtn) { e.preventDefault(); cancel(); return; }
        e.preventDefault();
        submit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      } else if (e.key === 'Tab') {
        const items = [...inputs, cancelBtn, okBtn];
        const idx = items.indexOf(root.activeElement);
        const next = e.shiftKey ? (idx <= 0 ? items.length - 1 : idx - 1) : (idx + 1) % items.length;
        e.preventDefault();
        items[next].focus();
      }
    });
    cancelBtn.addEventListener('click', cancel);
    okBtn.addEventListener('click', submit);

    const observer = new MutationObserver(() => {
      if (anchor && !anchor.isConnected) cancel();
    });

    document.documentElement.appendChild(host);
    position();
    document.addEventListener('mousedown', onOutside, true);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    if (inputs[0]) inputs[0].focus();

    const handle = { close: teardown, cancel, submit, host };
    current = handle;
    return handle;
  }

  globalThis.TypeBoltOverlay = { open };
})();
