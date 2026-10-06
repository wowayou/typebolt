const root = document.getElementById('host').attachShadow({ mode: 'open' });
const wrap = document.createElement('div');
const input = document.createElement('input');
input.id = 'sh-input';
input.type = 'text';
const ta = document.createElement('textarea');
ta.id = 'sh-ta';
wrap.append(input, ta);
root.append(wrap);
