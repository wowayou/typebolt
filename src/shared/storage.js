/* TypeBolt storage helpers (chrome.storage.local). Shared by the service worker,
 * options page and popup. Pure helpers (defaults, applyUsage, buildInstallPatch)
 * do not touch chrome.* and are unit-tested in Node. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TypeBoltStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const SCHEMA_VERSION = 1;

  function defaultSettings() { return { enabled: true, disabledSites: [] }; }
  function defaultStats() { return { total: { uses: 0, charsSaved: 0 }, bySnippet: {} }; }

  function newId() {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    return 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  /** Fill in any missing/invalid parts of a stats object without discarding data. */
  function normalizeStats(stats) {
    const out = defaultStats();
    if (stats && typeof stats === 'object') {
      if (stats.total && typeof stats.total === 'object') {
        out.total.uses = Number(stats.total.uses) || 0;
        out.total.charsSaved = Number(stats.total.charsSaved) || 0;
      }
      if (stats.bySnippet && typeof stats.bySnippet === 'object') out.bySnippet = { ...stats.bySnippet };
    }
    return out;
  }

  function normalizeSettings(settings) {
    const out = defaultSettings();
    if (settings && typeof settings === 'object') {
      if (typeof settings.enabled === 'boolean') out.enabled = settings.enabled;
      if (Array.isArray(settings.disabledSites)) out.disabledSites = settings.disabledSites.filter((x) => typeof x === 'string');
    }
    return out;
  }

  /** Pure: returns a new stats object with one expansion recorded. */
  function applyUsage(stats, id, charsSaved, now) {
    const s = normalizeStats(stats);
    const n = Math.max(0, Number(charsSaved) || 0);
    s.total.uses += 1;
    s.total.charsSaved += n;
    const cur = s.bySnippet[id] || { uses: 0, charsSaved: 0, lastUsedAt: 0 };
    s.bySnippet[id] = { uses: cur.uses + 1, charsSaved: cur.charsSaved + n, lastUsedAt: now };
    return s;
  }

  /**
   * Pure: decide what to write on install/update. Never overwrites existing user data.
   * existing: raw storage values {snippets, settings, stats, meta}; starterPack: array of
   * {name, shortcut, content} or null. Returns a patch for chrome.storage.local.set.
   */
  function buildInstallPatch(existing, reason, starterPack, now) {
    const ex = existing || {};
    const patch = {};
    const hasSnippets = Array.isArray(ex.snippets) && ex.snippets.length > 0;
    if (!Array.isArray(ex.snippets)) patch.snippets = [];
    if (reason === 'install' && !hasSnippets && Array.isArray(starterPack)) {
      patch.snippets = starterPack.map((s) => ({
        id: newId(), name: s.name, shortcut: s.shortcut, content: s.content, createdAt: now, updatedAt: now,
      }));
    }
    if (!ex.settings || typeof ex.settings !== 'object') patch.settings = defaultSettings();
    if (!ex.stats || typeof ex.stats !== 'object') patch.stats = defaultStats();
    if (!ex.meta || typeof ex.meta !== 'object') patch.meta = { schemaVersion: SCHEMA_VERSION, installedAt: now };
    return patch;
  }

  /* ---- chrome.storage wrappers ---- */
  const area = () => root.chrome.storage.local;

  async function getAll() {
    const v = await area().get(['snippets', 'settings', 'stats', 'meta']);
    return {
      snippets: Array.isArray(v.snippets) ? v.snippets : [],
      settings: normalizeSettings(v.settings),
      stats: normalizeStats(v.stats),
      meta: v.meta || null,
    };
  }
  async function getSnippets() { return (await getAll()).snippets; }
  async function setSnippets(snippets) { await area().set({ snippets }); }
  async function getSettings() { return (await getAll()).settings; }
  async function setSettings(settings) { await area().set({ settings: normalizeSettings(settings) }); }
  async function getStats() { return (await getAll()).stats; }

  return {
    SCHEMA_VERSION, defaultSettings, defaultStats, newId,
    normalizeStats, normalizeSettings, applyUsage, buildInstallPatch,
    getAll, getSnippets, setSnippets, getSettings, setSettings, getStats,
  };
});
