// Page-level listeners used by tests (external file so it also works under strict CSP).
window.__events = [];
window.__bubbleKeydowns = 0;
const t = document.getElementById('text');
if (t) {
  t.addEventListener('input', (e) => window.__events.push({ type: e.type, inputType: e.inputType, value: t.value }));
}
// Bubble-phase document listener, like Gmail-style shortcut handlers.
document.addEventListener('keydown', () => { window.__bubbleKeydowns++; });
// An editor that handles typing itself: swallows beforeinput and edits the value manually.
const sup = document.getElementById('suppressed');
if (sup) {
  sup.addEventListener('beforeinput', (e) => {
    if (e.inputType !== 'insertText' || !e.data) return;
    e.preventDefault();
    const s = sup.selectionStart;
    sup.setRangeText(e.data, s, sup.selectionEnd, 'end');
  });
}
// Capture console errors for tests.
window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
