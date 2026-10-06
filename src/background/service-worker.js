/* TypeBolt service worker: install/update bootstrap, stats queue, content-script injection. */
importScripts('../shared/engine.js', '../shared/storage.js', '../shared/starter-pack.js');

const CONTENT_FILES = [
  'src/shared/engine.js',
  'src/content/form-overlay.js',
  'src/content/content.js',
];

async function injectIntoOpenTabs() {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  } catch (_) {
    return;
  }
  await Promise.all(tabs.map(async (tab) => {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: CONTENT_FILES,
      });
    } catch (_) {
      // Restricted pages (Web Store, discarded tabs, ...) are ignored.
    }
  }));
}

// Which starter pack to install. We ask the message catalog (starterPackLang is "zh" in the
// zh_CN catalog and "en" in the English one) instead of chrome.i18n.getUILanguage(): at install
// time getUILanguage()/@@ui_locale can still report the browser's default language ("en-US")
// even though chrome.i18n already resolves messages from the locale the user actually runs.
function uiLanguage() {
  let lang = '';
  try { lang = chrome.i18n.getMessage('starterPackLang'); } catch (_) { /* ignore */ }
  return lang || chrome.i18n.getUILanguage();
}

// Exposed as a global so tests can exercise the install/update path directly.
async function handleInstalled(details) {
  const reason = details && details.reason;
  if (reason !== 'install' && reason !== 'update') return;
  const keys = ['snippets', 'settings', 'stats', 'meta'];
  const pack = reason === 'install' ? TypeBoltStarter.getPack(uiLanguage()) : null;
  // Re-read right before writing so anything stored in the meantime is never overwritten.
  const existing = await chrome.storage.local.get(keys);
  const patch = TypeBoltStorage.buildInstallPatch(existing, reason, pack, Date.now());
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
  if (reason === 'install') {
    await chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html?welcome=1') });
  }
  await injectIntoOpenTabs();
}

chrome.runtime.onInstalled.addListener((details) => {
  handleInstalled(details).catch((e) => console.warn('typebolt install failed', e));
});

// Stats are updated through a promise chain so rapid expansions never lose counts.
let statsQueue = Promise.resolve();
function recordUsage(id, charsSaved) {
  statsQueue = statsQueue.then(async () => {
    const { stats } = await chrome.storage.local.get('stats');
    const next = TypeBoltStorage.applyUsage(stats, id, charsSaved, Date.now());
    await chrome.storage.local.set({ stats: next });
  }).catch((e) => console.warn('typebolt stats failed', e));
  return statsQueue;
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'typebolt:used' && typeof msg.id === 'string') {
    recordUsage(msg.id, msg.charsSaved);
  }
  return false;
});
