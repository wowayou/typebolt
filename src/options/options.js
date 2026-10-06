/* TypeBolt options page: snippet manager, settings, import/export, welcome. */
(function () {
  'use strict';
  const E = TypeBoltEngine;
  const S = TypeBoltStorage;
  const { t } = TypeBoltI18n;
  const $ = (id) => document.getElementById(id);
  const locale = navigator.language || 'en';

  let state = { snippets: [], settings: S.defaultSettings(), stats: S.defaultStats() };
  let selectedId = null; // id of the snippet being edited; null with mode 'new' = unsaved draft
  let mode = 'none'; // 'none' | 'edit' | 'new'
  let touched = { shortcut: false, content: false };
  let toastTimer = null;

  /* ---------- small helpers ---------- */

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

  function toast(text) {
    const box = $('toast');
    box.textContent = text;
    box.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove('show'), 1800);
  }

  function errText(code) {
    return t('err_' + code);
  }

  /* ---------- stats ---------- */

  function renderStats() {
    const tot = state.stats.total;
    $('stat-uses').textContent = String(tot.uses);
    $('stat-chars').textContent = String(tot.charsSaved);
    $('stat-minutes').textContent = String(E.minutesSaved(tot.charsSaved));
  }

  /* ---------- list ---------- */

  function visibleSnippets() {
    const q = $('search').value;
    const list = E.filterSnippets(state.snippets, q);
    return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  function firstLine(content) {
    return (content || '').split('\n').find((l) => l.trim()) || '';
  }

  function renderList() {
    const ul = $('list');
    ul.replaceChildren();
    const items = visibleSnippets();
    const emptyBox = $('list-empty');
    if (items.length === 0) {
      emptyBox.hidden = false;
      emptyBox.textContent = t(state.snippets.length === 0 ? 'listEmpty' : 'listNoResults');
    } else {
      emptyBox.hidden = true;
    }
    for (const s of items) {
      const uses = (state.stats.bySnippet[s.id] || {}).uses || 0;
      const btn = el('button', { type: 'button', class: 'item', role: 'option', 'data-id': s.id, 'aria-selected': String(mode === 'edit' && s.id === selectedId) },
        el('span', { class: 'item-top' },
          el('span', { class: 'item-name', text: s.name || s.shortcut }),
          el('span', { class: 'item-code', text: s.shortcut })),
        el('span', { class: 'item-preview', text: firstLine(s.content) }),
        el('span', { class: 'item-uses', text: t('usesCount', uses) }));
      btn.addEventListener('click', () => selectSnippet(s.id));
      ul.append(el('li', {}, btn));
    }
  }

  /* ---------- editor ---------- */

  function showEditor(visible) {
    $('editor').hidden = !visible;
    $('editor-empty').hidden = visible;
  }

  function clearErrors() {
    for (const id of ['f-shortcut', 'f-content']) $(id).removeAttribute('aria-invalid');
    $('err-shortcut').textContent = '';
    $('err-content').textContent = '';
  }

  function currentDraft() {
    return {
      id: mode === 'edit' ? selectedId : undefined,
      name: $('f-name').value.trim(),
      shortcut: $('f-shortcut').value,
      content: $('f-content').value,
    };
  }

  function renderErrors(errors, all) {
    const sc = errors.filter((c) => c.startsWith('shortcut_') || c === 'prefix_conflict');
    const ct = errors.filter((c) => c === 'content_empty');
    const showSc = all || touched.shortcut;
    const showCt = all || touched.content;
    $('err-shortcut').textContent = showSc && sc.length ? errText(sc[0]) : '';
    $('f-shortcut').setAttribute('aria-invalid', String(showSc && sc.length > 0));
    $('err-content').textContent = showCt && ct.length ? errText(ct[0]) : '';
    $('f-content').setAttribute('aria-invalid', String(showCt && ct.length > 0));
  }

  function renderPreview() {
    const box = $('preview');
    box.replaceChildren();
    const content = $('f-content').value;
    if (!content) {
      box.classList.add('is-empty');
      box.textContent = t('previewEmpty');
      return;
    }
    box.classList.remove('is-empty');
    const now = new Date();
    let caretShown = false;
    for (const tok of E.parseTemplate(content)) {
      if (tok.type === 'text') box.append(document.createTextNode(tok.value));
      else if (tok.type === 'date' || tok.type === 'time') box.append(document.createTextNode(E.formatDate(now, tok.format, locale)));
      else if (tok.type === 'input') box.append(el('span', { class: 'ph', text: `[${tok.label}]` }));
      else if (tok.type === 'cursor' && !caretShown) { caretShown = true; box.append(el('span', { class: 'caret', 'aria-hidden': 'true' })); }
    }
  }

  function onEditorInput(which) {
    if (which) touched[which] = true;
    renderErrors(E.validateSnippet(currentDraft(), state.snippets), false);
    renderPreview();
  }

  function openEditor(snippet) {
    touched = { shortcut: false, content: false };
    $('f-name').value = snippet.name || '';
    $('f-shortcut').value = snippet.shortcut || '';
    $('f-content').value = snippet.content || '';
    $('delete-confirm').hidden = true;
    $('btn-delete').hidden = mode !== 'edit';
    $('btn-duplicate').hidden = mode !== 'edit';
    $('editor-title').textContent = t(mode === 'edit' ? 'editorEditTitle' : 'editorNewTitle');
    clearErrors();
    showEditor(true);
    renderPreview();
    renderList();
  }

  function selectSnippet(id) {
    const s = state.snippets.find((x) => x.id === id);
    if (!s) return;
    mode = 'edit';
    selectedId = id;
    openEditor(s);
  }

  function startNew(prefill) {
    mode = 'new';
    selectedId = null;
    openEditor(prefill || {});
    $('f-shortcut').focus();
  }

  async function save() {
    const draft = currentDraft();
    // Re-read storage so edits made elsewhere (other tab, import) are not clobbered.
    const current = await S.getSnippets();
    const errors = E.validateSnippet(draft, current);
    touched = { shortcut: true, content: true };
    renderErrors(errors, true);
    if (errors.length) {
      (errors.some((c) => c !== 'content_empty') ? $('f-shortcut') : $('f-content')).focus();
      return;
    }
    const now = Date.now();
    let saved;
    let next;
    if (mode === 'edit' && current.some((s) => s.id === selectedId)) {
      next = current.map((s) => {
        if (s.id !== selectedId) return s;
        saved = { ...s, name: draft.name || draft.shortcut, shortcut: draft.shortcut, content: draft.content, updatedAt: now };
        return saved;
      });
    } else {
      saved = { id: S.newId(), name: draft.name || draft.shortcut, shortcut: draft.shortcut, content: draft.content, createdAt: now, updatedAt: now };
      next = [...current, saved];
    }
    await S.setSnippets(next);
    state.snippets = next;
    mode = 'edit';
    selectedId = saved.id;
    $('btn-delete').hidden = false;
    $('btn-duplicate').hidden = false;
    $('editor-title').textContent = t('editorEditTitle');
    renderList();
    toast(t('toastSaved'));
  }

  async function remove() {
    if (mode !== 'edit') return;
    const id = selectedId;
    const { snippets, stats } = await S.getAll();
    const nextStats = S.normalizeStats(stats);
    delete nextStats.bySnippet[id]; // the running total is kept on purpose
    const next = snippets.filter((s) => s.id !== id);
    await chrome.storage.local.set({ snippets: next, stats: nextStats });
    state.snippets = next;
    state.stats = nextStats;
    mode = 'none';
    selectedId = null;
    showEditor(false);
    renderList();
    renderStats();
    toast(t('toastDeleted'));
  }

  function duplicate() {
    if (mode !== 'edit') return;
    const s = state.snippets.find((x) => x.id === selectedId);
    if (!s) return;
    startNew({ name: (s.name || s.shortcut) + t('duplicateSuffix'), shortcut: '', content: s.content });
    toast(t('toastDuplicated'));
  }

  function insertPlaceholder(btn) {
    const ta = $('f-content');
    const text = btn.getAttribute('data-insert');
    const sel = btn.getAttribute('data-select');
    const start = ta.selectionStart;
    ta.focus();
    ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
    if (sel) {
      const from = start + text.indexOf(sel);
      ta.setSelectionRange(from, from + sel.length);
    }
    onEditorInput('content');
  }

  /* ---------- settings ---------- */

  function renderSettings() {
    $('set-enabled').checked = state.settings.enabled;
    const ul = $('site-list');
    ul.replaceChildren();
    for (const site of state.settings.disabledSites) {
      const rm = el('button', { type: 'button', 'aria-label': `${t('btnRemove')} ${site}`, title: t('btnRemove'), text: '×' });
      rm.addEventListener('click', () => removeSite(site));
      ul.append(el('li', { 'data-site': site }, el('span', { text: site }), rm));
    }
    $('site-empty').hidden = state.settings.disabledSites.length > 0;
  }

  async function saveSettings(patch) {
    state.settings = S.normalizeSettings({ ...state.settings, ...patch });
    await S.setSettings(state.settings);
    renderSettings();
  }

  async function addSite() {
    const input = $('site-input');
    const host = E.normalizeSite(input.value);
    if (!host) {
      $('err-site').textContent = t('siteInvalid');
      input.setAttribute('aria-invalid', 'true');
      return;
    }
    $('err-site').textContent = '';
    input.removeAttribute('aria-invalid');
    if (!state.settings.disabledSites.includes(host)) {
      await saveSettings({ disabledSites: [...state.settings.disabledSites, host] });
    }
    input.value = '';
  }

  async function removeSite(site) {
    await saveSettings({ disabledSites: state.settings.disabledSites.filter((s) => s !== site) });
  }

  /* ---------- import / export ---------- */

  function showImportResult(text, details, isError) {
    const box = $('import-result');
    box.hidden = false;
    box.classList.toggle('is-error', !!isError);
    box.replaceChildren(el('div', { text }));
    if (details && details.length) box.append(el('ul', {}, ...details.map((d) => el('li', { text: d }))));
  }

  async function importFile(file) {
    let text;
    try { text = await file.text(); } catch (_) { showImportResult(t('importFailed'), [], true); return; }
    const current = await S.getSnippets();
    const res = E.validateImport(text, current);
    if (res.error) {
      showImportResult(`${t('importFailed')} ${errText(res.error)}`, [], true);
      return;
    }
    const now = Date.now();
    const added = res.toAdd.map((s) => ({ id: S.newId(), name: s.name, shortcut: s.shortcut, content: s.content, createdAt: now, updatedAt: now }));
    if (added.length) {
      const next = [...current, ...added];
      await S.setSnippets(next);
      state.snippets = next;
      renderList();
    }
    const details = res.skipped.map((s) => `${t('importSkipped')}: ${(s.item && s.item.shortcut) || '?'} - ${errText(s.reason)}`);
    showImportResult(t('importResult', added.length, res.skipped.length), details, false);
  }

  function exportFile() {
    const data = E.buildExport(state.snippets, new Date());
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const a = el('a', { href: URL.createObjectURL(blob), download: `typebolt-export-${stamp}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------- tabs / welcome ---------- */

  function showTab(name) {
    for (const tab of document.querySelectorAll('.tab')) tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
    $('panel-snippets').hidden = name !== 'snippets';
    $('panel-settings').hidden = name !== 'settings';
  }

  function renderTryHint() {
    const first = state.snippets[0];
    $('tryit-hint').textContent = first ? t('welcomeTryHint', first.shortcut) : '';
  }

  /* ---------- wiring ---------- */

  async function reload() {
    state = await S.getAll();
    renderStats();
    renderList();
    renderSettings();
    renderTryHint();
  }

  function wire() {
    for (const tab of document.querySelectorAll('.tab')) tab.addEventListener('click', () => showTab(tab.dataset.tab));
    $('btn-new').addEventListener('click', () => startNew());
    $('search').addEventListener('input', renderList);
    $('search').addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { const first = $('list').querySelector('.item'); if (first) { e.preventDefault(); first.focus(); } }
      else if (e.key === 'Enter') { const first = $('list').querySelector('.item'); if (first) { e.preventDefault(); first.click(); } }
    });
    $('list').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = [...$('list').querySelectorAll('.item')];
      const idx = items.indexOf(document.activeElement);
      if (idx === -1) return;
      e.preventDefault();
      const next = items[e.key === 'ArrowDown' ? Math.min(idx + 1, items.length - 1) : Math.max(idx - 1, 0)];
      if (idx === 0 && e.key === 'ArrowUp') { $('search').focus(); return; }
      const id = next.dataset.id;
      next.click(); // re-renders the list, so focus is restored by id afterwards
      const again = $('list').querySelector(`[data-id="${CSS.escape(id)}"]`);
      if (again) again.focus();
    });
    $('f-name').addEventListener('input', () => onEditorInput(null));
    $('f-shortcut').addEventListener('input', () => onEditorInput('shortcut'));
    $('f-content').addEventListener('input', () => onEditorInput('content'));
    $('editor').addEventListener('submit', (e) => { e.preventDefault(); save(); });
    $('editor').addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    });
    for (const b of document.querySelectorAll('.chip')) b.addEventListener('click', () => insertPlaceholder(b));
    $('btn-duplicate').addEventListener('click', duplicate);
    $('btn-delete').addEventListener('click', () => { $('delete-confirm').hidden = false; $('btn-delete-confirm').focus(); });
    $('btn-delete-cancel').addEventListener('click', () => { $('delete-confirm').hidden = true; $('btn-delete').focus(); });
    $('btn-delete-confirm').addEventListener('click', remove);

    $('set-enabled').addEventListener('change', (e) => saveSettings({ enabled: e.target.checked }));
    $('site-form').addEventListener('submit', (e) => { e.preventDefault(); addSite(); });
    $('btn-import').addEventListener('click', () => $('import-file').click());
    $('import-file').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) await importFile(f);
      e.target.value = '';
    });
    $('btn-export').addEventListener('click', exportFile);

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.snippets) state.snippets = Array.isArray(changes.snippets.newValue) ? changes.snippets.newValue : [];
      if (changes.stats) state.stats = S.normalizeStats(changes.stats.newValue);
      if (changes.settings) state.settings = S.normalizeSettings(changes.settings.newValue);
      renderStats();
      renderList();
      renderSettings();
      renderTryHint();
    });
  }

  async function init() {
    TypeBoltI18n.init();
    wire();
    await reload();
    const welcome = new URLSearchParams(location.search).get('welcome') === '1';
    $('welcome').open = welcome;
    showEditor(false);
    showTab('snippets');
    if (welcome) $('tryit').focus();
  }

  init();
})();
