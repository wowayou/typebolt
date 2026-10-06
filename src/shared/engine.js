/* TypeBolt engine: pure, deterministic logic shared by the content script,
 * extension pages and Node unit tests. No DOM / chrome.* access in here. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TypeBoltEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SHORTCUT_MIN = 2;
  const SHORTCUT_MAX = 32;
  const DEFAULT_DATE_FORMAT = 'YYYY-MM-DD';
  const DEFAULT_TIME_FORMAT = 'HH:mm';

  // Only these placeholders are recognised; any other braces stay literal.
  const PLACEHOLDER_RE = /\{(cursor|date(?::[^{}]*)?|time(?::[^{}]*)?|input:[^{}]+)\}/g;
  // Longest token first so "YYYY" wins over "YY", "MM" over "M", etc.
  const DATE_TOKEN_RE = /YYYY|dddd|YY|MM|DD|HH|mm|ss|M|D|H/g;

  /* ---------- template ---------- */

  function parseTemplate(content) {
    const src = String(content == null ? '' : content);
    const tokens = [];
    let last = 0;
    PLACEHOLDER_RE.lastIndex = 0;
    let m;
    while ((m = PLACEHOLDER_RE.exec(src)) !== null) {
      if (m.index > last) tokens.push({ type: 'text', value: src.slice(last, m.index) });
      const body = m[1];
      if (body === 'cursor') {
        tokens.push({ type: 'cursor' });
      } else if (body.startsWith('input:')) {
        const label = body.slice(6).trim();
        if (label) tokens.push({ type: 'input', label });
        else tokens.push({ type: 'text', value: m[0] });
      } else {
        const type = body.startsWith('date') ? 'date' : 'time';
        const colon = body.indexOf(':');
        const fmt = colon === -1 ? '' : body.slice(colon + 1);
        const fallback = type === 'date' ? DEFAULT_DATE_FORMAT : DEFAULT_TIME_FORMAT;
        tokens.push({ type, format: fmt === '' ? fallback : fmt });
      }
      last = m.index + m[0].length;
    }
    if (last < src.length) tokens.push({ type: 'text', value: src.slice(last) });
    return tokens;
  }

  function getInputFields(content) {
    const seen = new Set();
    const out = [];
    for (const t of parseTemplate(content)) {
      if (t.type === 'input' && !seen.has(t.label)) {
        seen.add(t.label);
        out.push(t.label);
      }
    }
    return out;
  }

  function pad(n, w) {
    return String(n).padStart(w, '0');
  }

  function formatDate(date, format, locale) {
    return String(format).replace(DATE_TOKEN_RE, (tok) => {
      switch (tok) {
        case 'YYYY': return pad(date.getFullYear(), 4);
        case 'YY': return pad(date.getFullYear() % 100, 2);
        case 'MM': return pad(date.getMonth() + 1, 2);
        case 'M': return String(date.getMonth() + 1);
        case 'DD': return pad(date.getDate(), 2);
        case 'D': return String(date.getDate());
        case 'HH': return pad(date.getHours(), 2);
        case 'H': return String(date.getHours());
        case 'mm': return pad(date.getMinutes(), 2);
        case 'ss': return pad(date.getSeconds(), 2);
        case 'dddd':
          return new Intl.DateTimeFormat(locale || 'en', { weekday: 'long' }).format(date);
        default: return tok;
      }
    });
  }

  /**
   * Render a template. opts: { now: Date, locale: string, inputs: Record<string,string>,
   * inputFormatter?: (label) => string } — inputFormatter lets previews show "[Label]".
   * Returns { text, cursorOffset } where cursorOffset is a UTF-16 index or null.
   */
  function renderTemplate(content, opts) {
    const o = opts || {};
    const now = o.now instanceof Date ? o.now : new Date();
    const inputs = o.inputs || {};
    let text = '';
    let cursorOffset = null;
    for (const t of parseTemplate(content)) {
      switch (t.type) {
        case 'text': text += t.value; break;
        case 'cursor':
          if (cursorOffset === null) cursorOffset = text.length;
          break;
        case 'date':
        case 'time':
          text += formatDate(now, t.format, o.locale);
          break;
        case 'input':
          if (typeof o.inputFormatter === 'function') text += o.inputFormatter(t.label);
          else text += Object.prototype.hasOwnProperty.call(inputs, t.label) ? String(inputs[t.label]) : '';
          break;
      }
    }
    return { text, cursorOffset };
  }

  /* ---------- matching ---------- */

  function codePointLength(s) {
    let n = 0;
    for (const _ of s) n++; // eslint-disable-line no-unused-vars
    return n;
  }

  function buildIndex(snippets) {
    const map = new Map();
    let maxLen = 0;
    let minLen = Infinity;
    for (const s of snippets || []) {
      if (!s || typeof s.shortcut !== 'string' || !s.shortcut) continue;
      if (map.has(s.shortcut)) continue;
      map.set(s.shortcut, s);
      if (s.shortcut.length > maxLen) maxLen = s.shortcut.length; // UTF-16 length
      if (s.shortcut.length < minLen) minLen = s.shortcut.length;
    }
    if (map.size === 0) minLen = 0;
    return { map, maxLen, minLen };
  }

  const WORD_CHAR_RE = /^[A-Za-z0-9_]$/;

  /** Longest-match lookup at the end of textBeforeCaret, honouring the boundary rule. */
  function findMatch(textBeforeCaret, index) {
    if (!index || index.map.size === 0 || !textBeforeCaret) return null;
    const text = textBeforeCaret.length > index.maxLen + 2
      ? textBeforeCaret.slice(-(index.maxLen + 2))
      : textBeforeCaret;
    const top = Math.min(index.maxLen, text.length);
    for (let len = top; len >= index.minLen && len > 0; len--) {
      const cand = text.slice(text.length - len);
      const snippet = index.map.get(cand);
      if (!snippet) continue;
      const prev = text.length - len - 1 >= 0 ? text[text.length - len - 1] : '';
      if (prev && WORD_CHAR_RE.test(prev)) continue;
      return { snippet, shortcut: cand };
    }
    return null;
  }

  /* ---------- validation ---------- */

  /** Returns an array of error codes (empty when valid). */
  function validateSnippet(draft, allSnippets) {
    const errors = [];
    const d = draft || {};
    const shortcut = typeof d.shortcut === 'string' ? d.shortcut : '';
    const content = typeof d.content === 'string' ? d.content : '';
    if (!shortcut) {
      errors.push('shortcut_empty');
    } else if (/\s/.test(shortcut)) {
      errors.push('shortcut_whitespace');
    } else {
      const len = codePointLength(shortcut);
      if (len < SHORTCUT_MIN) errors.push('shortcut_too_short');
      else if (len > SHORTCUT_MAX) errors.push('shortcut_too_long');
      const others = (allSnippets || []).filter((s) => s && (d.id == null || s.id !== d.id));
      if (others.some((s) => s.shortcut === shortcut)) {
        errors.push('shortcut_duplicate');
      } else if (others.some((s) => s.shortcut && (s.shortcut.startsWith(shortcut) || shortcut.startsWith(s.shortcut)))) {
        errors.push('prefix_conflict');
      }
    }
    if (!content.trim()) errors.push('content_empty');
    return errors;
  }

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function validateImport(json, existingSnippets) {
    let data = json;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (_) { return { toAdd: [], skipped: [], error: 'invalid_json' }; }
    }
    if (!isPlainObject(data) || data.format !== 'typebolt' || data.version !== 1 || !Array.isArray(data.snippets)) {
      return { toAdd: [], skipped: [], error: 'invalid_format' };
    }
    const toAdd = [];
    const skipped = [];
    const pool = (existingSnippets || []).map((s) => ({ id: s.id, shortcut: s.shortcut, content: s.content }));
    for (const item of data.snippets) {
      if (!isPlainObject(item) || typeof item.shortcut !== 'string' || typeof item.content !== 'string'
        || (item.name != null && typeof item.name !== 'string')) {
        skipped.push({ item, reason: 'invalid_item' });
        continue;
      }
      const errs = validateSnippet({ shortcut: item.shortcut, content: item.content }, pool);
      if (errs.length) {
        skipped.push({ item, reason: errs[0] });
        continue;
      }
      const clean = { name: (item.name || item.shortcut).trim() || item.shortcut, shortcut: item.shortcut, content: item.content };
      toAdd.push(clean);
      pool.push({ id: undefined, shortcut: clean.shortcut, content: clean.content });
    }
    return { toAdd, skipped };
  }

  function buildExport(snippets, now) {
    return {
      format: 'typebolt',
      version: 1,
      exportedAt: (now instanceof Date ? now : new Date()).toISOString(),
      snippets: (snippets || []).map((s) => ({ name: s.name, shortcut: s.shortcut, content: s.content })),
    };
  }

  /* ---------- sites ---------- */

  const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

  function normalizeSite(input) {
    if (typeof input !== 'string') return null;
    let s = input.trim().toLowerCase();
    if (!s || /\s/.test(s)) return null;
    if (s.startsWith('*.')) s = s.slice(2);
    const scheme = /^([a-z][a-z0-9+.-]*):\/\//.exec(s);
    if (scheme && scheme[1] !== 'http' && scheme[1] !== 'https') return null;
    let host;
    try {
      host = new URL(scheme ? s : 'http://' + s).hostname;
    } catch (_) {
      return null;
    }
    host = host.replace(/\.$/, '');
    // IPv6 literals come back bracketed; accept them as-is.
    if (/^\[[0-9a-f:.]+\]$/.test(host)) return host;
    return HOST_RE.test(host) ? host : null;
  }

  function isSiteDisabled(hostname, disabledSites) {
    const h = String(hostname || '').toLowerCase();
    if (!h) return false;
    for (const raw of disabledSites || []) {
      const d = normalizeSite(raw);
      if (d && (h === d || h.endsWith('.' + d))) return true;
    }
    return false;
  }

  /* ---------- misc helpers ---------- */

  function charsSaved(renderedText, shortcut) {
    return Math.max(0, renderedText.length - shortcut.length);
  }

  function minutesSaved(chars) {
    return Math.round((chars || 0) / 200);
  }

  /** Case-insensitive substring filter on name / shortcut / content. */
  function filterSnippets(snippets, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return snippets.slice();
    return snippets.filter((s) =>
      (s.name || '').toLowerCase().includes(q)
      || (s.shortcut || '').toLowerCase().includes(q)
      || (s.content || '').toLowerCase().includes(q));
  }

  return {
    SHORTCUT_MIN, SHORTCUT_MAX,
    parseTemplate, getInputFields, formatDate, renderTemplate,
    buildIndex, findMatch, validateSnippet, validateImport, buildExport,
    normalizeSite, isSiteDisabled, charsSaved, minutesSaved, filterSnippets,
  };
});
