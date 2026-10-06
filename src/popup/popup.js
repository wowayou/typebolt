/* TypeBolt popup: search, copy-with-fill, stats and quick toggles. */
(function () {
  'use strict';
  const E = TypeBoltEngine;
  const S = TypeBoltStorage;
  const { t } = TypeBoltI18n;
  const $ = (id) => document.getElementById(id);
  const locale = navigator.language || 'en';

  let state = { snippets: [], settings: S.defaultSettings(), stats: S.defaultStats() };
  let selected = 0;
  let items = [];
  let fillTarget = null;
  let hostname = '';
  let statusTimer = null;

  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('data-') || k.startsWith('aria-') || k === 'role') node.setAttribute(k, v);
      else node[k] = v;
    }
    for (const c of children) if (c) node.append(c);
    return node;
  }

  function setStatus(text, isError) {
    const box = $('status');
    box.textContent = text;
    box.classList.toggle('is-error', !!isError);
    clearTimeout(statusTimer);
    if (text) statusTimer = setTimeout(() => { box.textContent = ''; }, 2000);
  }

  function renderStats() {
    const tot = state.stats.total;
    $('stats').textContent = t('popupStats', tot.uses, E.minutesSaved(tot.charsSaved));
  }

  function previewOf(s) {
    return E.renderTemplate(s.content, { now: new Date(), locale, inputFormatter: (l) => `[${l}]` }).text.replace(/\s+/g, ' ').trim();
  }

  function renderList() {
    const ul = $('list');
    ul.replaceChildren();
    items = E.filterSnippets(state.snippets, $('search').value);
    if (selected >= items.length) selected = Math.max(0, items.length - 1);
    const empty = $('empty');
    if (items.length === 0) {
      empty.hidden = false;
      empty.textContent = t(state.snippets.length === 0 ? 'popupEmpty' : 'popupNoMatch');
    } else {
      empty.hidden = true;
    }
    items.forEach((s, i) => {
      const btn = el('button', { type: 'button', class: 'item', role: 'option', tabIndex: -1, 'data-id': s.id, 'aria-selected': String(i === selected) },
        el('span', { class: 'item-top' },
          el('span', { class: 'item-name', text: s.name || s.shortcut }),
          el('span', { class: 'item-code', text: s.shortcut })),
        el('span', { class: 'item-preview', text: previewOf(s) }));
      btn.addEventListener('click', () => { selected = i; choose(s); });
      ul.append(el('li', {}, btn));
    });
  }

  function moveSelection(delta) {
    if (items.length === 0) return;
    selected = (selected + delta + items.length) % items.length;
    const nodes = $('list').querySelectorAll('.item');
    nodes.forEach((n, i) => n.setAttribute('aria-selected', String(i === selected)));
    nodes[selected].scrollIntoView({ block: 'nearest' });
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      // Fallback for contexts where the async clipboard API is unavailable.
      const ta = el('textarea', { value: text });
      document.body.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (__) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  async function doCopy(snippet, inputs) {
    const { text } = E.renderTemplate(snippet.content, { now: new Date(), locale, inputs });
    const ok = await copyText(text);
    setStatus(t(ok ? 'popupCopied' : 'popupCopyFailed'), !ok);
    return ok;
  }

  function choose(snippet) {
    const fields = E.getInputFields(snippet.content);
    if (fields.length === 0) { doCopy(snippet, {}); return; }
    showFill(snippet, fields);
  }

  function showFill(snippet, fields) {
    fillTarget = { snippet, fields };
    $('fill-title').textContent = snippet.name || snippet.shortcut;
    const box = $('fill-fields');
    box.replaceChildren();
    for (const f of fields) {
      const input = el('input', { type: 'text', autocomplete: 'off' });
      input.dataset.label = f;
      box.append(el('label', { class: 'fill-field' }, el('span', { text: f }), input));
    }
    $('list').hidden = true;
    $('empty').hidden = true;
    $('fill').hidden = false;
    $('search').disabled = true;
    box.querySelector('input').focus();
  }

  function hideFill() {
    fillTarget = null;
    $('fill').hidden = true;
    $('list').hidden = false;
    $('search').disabled = false;
    renderList();
    $('search').focus();
  }

  async function submitFill() {
    if (!fillTarget) return;
    const inputs = {};
    for (const i of $('fill-fields').querySelectorAll('input')) inputs[i.dataset.label] = i.value;
    const ok = await doCopy(fillTarget.snippet, inputs);
    if (ok) hideFill();
  }

  /* ---------- site toggle ---------- */

  async function detectHostname() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) return '';
      const u = new URL(tab.url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
      return u.hostname.toLowerCase();
    } catch (_) {
      return '';
    }
  }

  function renderToggles() {
    $('tog-global').checked = state.settings.enabled;
    const row = $('site-row');
    if (!hostname) { row.hidden = true; return; }
    row.hidden = false;
    $('site-label').textContent = t('popupSite', hostname);
    $('tog-site').checked = !E.isSiteDisabled(hostname, state.settings.disabledSites);
  }

  async function setSiteEnabled(enabled) {
    const sites = state.settings.disabledSites;
    let next;
    if (enabled) {
      // Drop every rule that currently covers this host (the exact host or a parent domain).
      next = sites.filter((s) => !E.isSiteDisabled(hostname, [s]));
    } else {
      next = sites.includes(hostname) ? sites : [...sites, hostname];
    }
    state.settings = S.normalizeSettings({ ...state.settings, disabledSites: next });
    await S.setSettings(state.settings);
    renderToggles();
  }

  /* ---------- wiring ---------- */

  function wire() {
    $('search').addEventListener('input', () => { selected = 0; renderList(); });
    document.addEventListener('keydown', (e) => {
      if (fillTarget) {
        if (e.key === 'Escape') { e.preventDefault(); hideFill(); }
        return;
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1); }
      else if (e.key === 'Enter' && document.activeElement === $('search') && items[selected]) { e.preventDefault(); choose(items[selected]); }
      else if (e.key === 'Escape') window.close();
    });
    $('fill').addEventListener('submit', (e) => { e.preventDefault(); submitFill(); });
    $('fill-cancel').addEventListener('click', hideFill);
    $('tog-global').addEventListener('change', async (e) => {
      state.settings = S.normalizeSettings({ ...state.settings, enabled: e.target.checked });
      await S.setSettings(state.settings);
    });
    $('tog-site').addEventListener('change', (e) => setSiteEnabled(e.target.checked));
    $('manage').addEventListener('click', () => { chrome.runtime.openOptionsPage(); window.close(); });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.snippets) state.snippets = Array.isArray(changes.snippets.newValue) ? changes.snippets.newValue : [];
      if (changes.stats) state.stats = S.normalizeStats(changes.stats.newValue);
      if (changes.settings) state.settings = S.normalizeSettings(changes.settings.newValue);
      renderStats();
      if (!fillTarget) renderList();
      renderToggles();
    });
  }

  async function init() {
    TypeBoltI18n.init();
    wire();
    state = await S.getAll();
    hostname = await detectHostname();
    renderStats();
    renderList();
    renderToggles();
    $('search').focus();
  }

  init();
})();
