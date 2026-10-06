import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { schema } from 'prosemirror-schema-basic';
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { createEditor, $getRoot } from 'lexical';
import { registerRichText } from '@lexical/rich-text';
import { registerHistory, createEmptyHistoryState } from '@lexical/history';

// ProseMirror (ChatGPT / Claude.ai style)
const pmView = new EditorView(document.querySelector('#pm'), {
  state: EditorState.create({ schema, plugins: [history(), keymap({ 'Mod-z': undo, 'Mod-y': redo }), keymap(baseKeymap)] }),
});
window.pmText = () => pmView.state.doc.textBetween(0, pmView.state.doc.content.size, '\n', '\n');
window.pmCursor = () => pmView.state.selection.from;

// Lexical
const lx = createEditor({ namespace: 'acc', onError: (e) => { throw e; } });
lx.setRootElement(document.querySelector('#lx'));
registerRichText(lx);
registerHistory(lx, createEmptyHistoryState(), 300);
window.lxText = () => lx.getEditorState().read(() => $getRoot().getTextContent());

// React controlled fields
function App() {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  window.reactState = { a, b };
  return (
    <div>
      <input id="r-input" value={a} onChange={(e) => setA(e.target.value)} />
      <textarea id="r-ta" value={b} onChange={(e) => setB(e.target.value)} />
    </div>
  );
}
createRoot(document.querySelector('#react')).render(<App />);
