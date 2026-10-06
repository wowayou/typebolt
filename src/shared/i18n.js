/* Fills data-i18n* attributes from chrome.i18n and exposes t(). */
(function (root) {
  'use strict';

  function t(key, ...subs) {
    let msg = '';
    try { msg = chrome.i18n.getMessage(key, subs.map(String)); } catch (_) { /* ignore */ }
    return msg || key;
  }

  function apply(scope) {
    const rootEl = scope || document;
    for (const el of rootEl.querySelectorAll('[data-i18n]')) el.textContent = t(el.getAttribute('data-i18n'));
    for (const [attr, target] of [['data-i18n-placeholder', 'placeholder'], ['data-i18n-title', 'title'], ['data-i18n-aria-label', 'aria-label']]) {
      for (const el of rootEl.querySelectorAll(`[${attr}]`)) el.setAttribute(target, t(el.getAttribute(attr)));
    }
  }

  function init() {
    try { document.documentElement.lang = chrome.i18n.getUILanguage(); } catch (_) { /* ignore */ }
    apply(document);
  }

  root.TypeBoltI18n = { t, apply, init };
})(globalThis);
