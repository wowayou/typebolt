import React, { useState, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import Quill from 'quill';
import { Editor, EditorState } from 'draft-js';
import { createEditor } from 'slate';
import { Slate, Editable, withReact } from 'slate-react';
import { withHistory } from 'slate-history';
import { Node } from 'slate';

// Quill (Gemini-style)
const q = new Quill('#quill', {});
window.quillText = () => q.getText().replace(/\n$/, '');

// Draft.js (X/Twitter-style)
function DraftBox() {
  const [es, setEs] = useState(() => EditorState.createEmpty());
  window.draftText = () => es.getCurrentContent().getPlainText('\n');
  return <div id="draft-wrap"><Editor editorState={es} onChange={setEs} /></div>;
}
createRoot(document.querySelector('#draft')).render(<DraftBox />);

// Slate (Discord-style)
function SlateBox() {
  const editor = useMemo(() => withHistory(withReact(createEditor())), []);
  window.slateText = () => editor.children.map((n) => Node.string(n)).join('\n');
  return (
    <Slate editor={editor} initialValue={[{ type: 'p', children: [{ text: '' }] }]}>
      <Editable id="slate-ed" />
    </Slate>
  );
}
createRoot(document.querySelector('#slate')).render(<SlateBox />);
