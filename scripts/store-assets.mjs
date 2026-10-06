// Render the Chrome Web Store graphics by driving the real extension in Playwright's Chromium:
// five 1280x800 screenshots, the 440x280 small promo tile and the 1400x560 marquee per locale,
// plus the padded 128x128 store icon. Output goes to dist/store/ (gitignored).
// The expansion and fill-in overlay shown in screenshots 1-2 are produced by the extension itself.
import { chromium } from '@playwright/test';
import http from 'node:http';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = path.join(root, 'dist', 'store');
const iconSvg = readFileSync(path.join(root, 'icons/icon.svg'), 'utf8');
const BOLT = 'M74 20 40 70h22l-8 38 34-52H66z';

const COPY = {
  en: {
    lang: 'en-US',
    s1: {
      title: 'Type a shortcut, get the whole text',
      sub: 'Type ;thx in any text box and it expands instantly: emails, chats, forms and more.',
      url: 'mail.example.com', head: 'New message', to: 'To', toVal: 'sam@example.com',
      subject: 'Subject', subjectVal: 'Re: Q3 launch plan', send: 'Send',
      before: 'Hi Sam,', signoff: 'Best, Alex', shortcut: ';thx', after: 'Thanks so much! I really appreciate your help.',
    },
    s2: {
      title: 'AI prompt library with fill-in forms',
      sub: 'Type ;tr in any AI chat, fill in the blank, and the full prompt is inserted.',
      url: 'chat.example.com', app: 'AI Assistant', newChat: 'New chat',
      q: 'Can you help me localize our onboarding emails?',
      a: 'Of course! Paste the text you would like translated and tell me the target language.',
      shortcut: ';tr', field: 'Target language', value: 'Japanese',
    },
    s3: { title: 'Manage snippets with live preview', sub: 'Placeholders for the cursor, dates, times and fill-in fields. Import and export JSON.', pick: ';tr' },
    s4: { title: 'Search and copy from the toolbar', sub: 'Open it with Ctrl+Shift+. and see how much typing you have saved.', host: 'chat.example.com' },
    s5: {
      title: 'Private by design',
      sub: 'Everything happens in your browser. Nothing is ever uploaded.',
      cards: [
        ['lock', '100% local', 'Snippets, settings and stats stay in your browser.'],
        ['eye', 'No account, no tracking', 'No sign-up, no analytics, no network requests.'],
        ['keys', 'IME-friendly', 'Waits for Chinese, Japanese and Korean input to be committed.'],
        ['edit', 'Works in rich-text editors', 'Inputs, textareas and contenteditable editors.'],
        ['braces', 'Smart placeholders', '{cursor}  {date}  {time}  {input:Label}'],
        ['code', 'Open source', 'AGPL-3.0, with the full source on GitHub.'],
      ],
    },
    promo: { tagline: 'Text expander & AI prompt library', chips: ['100% local', 'No account', 'IME-friendly'] },
    marquee: {
      headline: 'Type less. Expand everything.',
      sub: 'Turn short codes into replies, signatures and AI prompts, in any text box.',
      prompt: 'Translate the following text into Japanese. Keep the original tone and formatting, and return only the translation.',
    },
  },
  zh_CN: {
    lang: 'zh-CN',
    s1: {
      title: '输入短码，整段文字即刻展开',
      sub: '在任意输入框输入 ;xiexie，立刻展开成完整的回复。邮件、聊天、表单都能用。',
      url: 'mail.example.com', head: '新邮件', to: '收件人', toVal: 'wang@example.com',
      subject: '主题', subjectVal: '回复：三季度发布计划', send: '发送',
      before: '王经理，您好：', signoff: '李明', shortcut: ';xiexie', after: '非常感谢！谢谢你的帮助。',
    },
    s2: {
      title: 'AI 提示词库，带填空表单',
      sub: '在 AI 聊天框输入 ;fy，填好目标语言，整段提示词自动插入。',
      url: 'chat.example.com', app: 'AI 助手', newChat: '新对话',
      q: '能帮我把新用户引导邮件本地化吗？',
      a: '当然可以！请把需要翻译的文字发给我，并告诉我目标语言。',
      shortcut: ';fy', field: '目标语言', value: '日语',
    },
    s3: { title: '片段管理，实时预览', sub: '支持光标位置、日期、时间与填空字段等占位符，可导入 / 导出 JSON。', pick: ';fy' },
    s4: { title: '弹窗搜索，一键复制', sub: '按 Ctrl+Shift+. 打开弹窗，还能看到累计节省了多少打字时间。', host: 'chat.example.com' },
    s5: {
      title: '隐私优先，完全本地',
      sub: '所有处理都在你的浏览器里完成，任何数据都不会上传。',
      cards: [
        ['lock', '完全本地', '片段、设置与统计只保存在你的浏览器里。'],
        ['eye', '无账号、无追踪', '无需注册，没有统计代码，不发送网络请求。'],
        ['keys', '中文输入法友好', '输入法组合过程中不会误触发，上屏后再展开。'],
        ['edit', '兼容富文本编辑器', '输入框、文本域与各类富文本编辑器都能用。'],
        ['braces', '智能占位符', '{cursor}  {date}  {time}  {input:标签}'],
        ['code', '开源可审计', 'AGPL-3.0 许可，源码公开在 GitHub。'],
      ],
    },
    promo: { tagline: '文本快捷短语与 AI 提示词库', chips: ['完全本地', '无需账号', '输入法友好'] },
    marquee: {
      headline: '少打字，多表达',
      sub: '把短码变成常用回复、邮件落款和 AI 提示词，任意输入框都能用。',
      prompt: '请把下面的文字翻译成日语，保持原有语气和格式，只输出译文。',
    },
  },
};

const ICONS = {
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/>',
  keys: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13 7l4 4"/>',
  braces: '<path d="M8 4c-2 0-3 1-3 3v2c0 1.5-1 3-2 3 1 0 2 1.5 2 3v2c0 2 1 3 3 3M16 4c2 0 3 1 3 3v2c0 1.5 1 3 2 3-1 0-2 1.5-2 3v2c0 2-1 3-3 3"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const bolt = (fill) => `<svg viewBox="0 0 128 128" aria-hidden="true"><path d="${BOLT}" fill="${fill}"/></svg>`;

const BASE_CSS = `
*{box-sizing:border-box}
html,body{margin:0;overflow:hidden}
body{font-family:"Noto Sans","Noto Sans CJK SC",sans-serif;-webkit-font-smoothing:antialiased;color:#fff;
  background:radial-gradient(900px 520px at 12% -12%,rgba(150,140,255,.55),transparent 62%),
  radial-gradient(800px 600px at 105% 110%,rgba(40,20,140,.55),transparent 60%),
  linear-gradient(155deg,#4646c4 0%,#5b5bd6 48%,#5a45c9 100%)}
.mono{font-family:"DejaVu Sans Mono",monospace}
.kbd{display:inline-block;padding:1px 9px;border-radius:7px;background:rgba(255,255,255,.18);
  border:1px solid rgba(255,255,255,.35);font-family:"DejaVu Sans Mono",monospace;font-size:.88em}
`;

const SHOT_CSS = `
html,body{width:1280px;height:800px}
.cap{position:absolute;top:44px;left:0;right:0;text-align:center;padding:0 80px;text-wrap:balance}
.cap h1{margin:0;font-size:44px;line-height:1.15;font-weight:700;letter-spacing:-.015em}
.cap p{margin:16px 0 0;font-size:20px;line-height:1.4;color:rgba(255,255,255,.86)}
.win{position:absolute;left:80px;right:80px;top:180px;bottom:0;background:#fff;border-radius:14px 14px 0 0;
  box-shadow:0 30px 80px rgba(18,8,80,.45),0 0 0 1px rgba(255,255,255,.08);overflow:hidden;color:#1c1d21}
.bar{height:42px;background:#f0f0f4;border-bottom:1px solid #e3e4ea;display:flex;align-items:center;gap:8px;padding:0 16px}
.bar>i{width:12px;height:12px;border-radius:50%;background:#d6d7df}
.url{margin-left:18px;width:460px;height:30px;border-radius:8px;background:#fff;border:1px solid #e3e4ea;
  font-size:13.5px;color:#6b6f7a;display:flex;align-items:center;padding:0 12px}
.tb{margin-left:auto;width:30px;height:30px;border-radius:8px;display:grid;place-items:center}
.tb svg{width:22px;height:22px}
.tb.on{background:#e3e3f7}
.content{position:absolute;top:42px;left:0;right:0;bottom:0;overflow:hidden}
`;

function page(css, body, w, h) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}${css}
html,body{width:${w}px;height:${h}px}</style></head><body>${body}</body></html>`;
}

function shot(c, inner, { url, css = '', tbOn = false } = {}) {
  return page(SHOT_CSS + css, `
<div class="cap"><h1>${esc(c.title)}</h1><p>${esc(c.sub)}</p></div>
<div class="win">
  <div class="bar"><i></i><i></i><i></i><div class="url">${esc(url || '')}</div>
    <div class="tb${tbOn ? ' on' : ''}">${iconSvg}</div></div>
  <div class="content">${inner}</div>
</div>`, 1280, 800);
}

function mailPage(c) {
  const css = `
.mail{padding:26px 40px;font-size:16px}
.mail h2{margin:0 0 14px;font-size:19px;font-weight:600}
.row{display:flex;gap:16px;padding:11px 0;border-bottom:1px solid #ececf1;color:#1c1d21}
.row span{width:84px;color:#8a8e99}
#body{margin-top:22px;min-height:230px;font-size:19px;line-height:1.75;outline:none}
#body mark{background:rgba(91,91,214,.14);color:inherit;border-radius:5px;padding:2px 3px;position:relative;
  box-shadow:inset 0 -2px 0 rgba(91,91,214,.55)}
.tag{position:absolute;left:calc(100% + 12px);top:50%;transform:translateY(-50%);white-space:nowrap;font-size:13px;line-height:1;padding:6px 9px;border-radius:7px;
  background:#1c1d21;color:#fff;font-family:"DejaVu Sans Mono",monospace;box-shadow:0 4px 12px rgba(0,0,0,.18)}
.tag b{color:#a5a5ff;font-weight:400}
.foot{display:flex;gap:10px;margin-top:8px}
.send{background:#5b5bd6;color:#fff;border:0;border-radius:8px;padding:10px 22px;font:600 15px inherit}`;
  return shot(c, `
<div class="mail">
  <h2>${esc(c.head)}</h2>
  <div class="row"><span>${esc(c.to)}</span>${esc(c.toVal)}</div>
  <div class="row"><span>${esc(c.subject)}</span>${esc(c.subjectVal)}</div>
  <div id="body" contenteditable="true" spellcheck="false"><div>${esc(c.before)}</div><div><br></div><div id="line"><br></div><div><br></div><div>${esc(c.signoff)}</div></div>
  <div class="foot"><button class="send">${esc(c.send)}</button></div>
</div>`, { url: c.url, css });
}

function chatPage(c) {
  const css = `
.chat{display:flex;height:100%}
aside{width:230px;background:#f6f6f8;border-right:1px solid #ececf1;padding:20px 16px}
aside .new{border:1px solid #e3e4ea;background:#fff;border-radius:9px;padding:9px 12px;font-size:14px;font-weight:600}
aside .h{height:10px;border-radius:5px;background:#e3e4ea;margin:22px 4px 0}
aside .h:nth-child(3){width:70%}aside .h:nth-child(4){width:82%}aside .h:nth-child(5){width:60%}
main{flex:1;position:relative;padding:28px 56px}
.title{font-size:15px;font-weight:600;color:#6b6f7a;margin-bottom:26px}
.msg{max-width:640px;font-size:16px;line-height:1.6;margin-bottom:18px}
.msg.u{margin-left:auto;width:fit-content;background:#f0f0f4;border-radius:16px;padding:11px 16px}
.msg.a{display:flex;gap:12px}
.msg.a i{flex:none;width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#8b8bf0,#5b5bd6)}
.composer{position:absolute;left:56px;right:56px;top:356px;border:1px solid #dcdde5;border-radius:16px;
  padding:14px 64px 14px 18px;min-height:96px;box-shadow:0 2px 10px rgba(20,20,60,.06)}
#box{font-size:16px;line-height:1.6;outline:none;min-height:60px;white-space:pre-wrap}
.go{position:absolute;right:12px;bottom:12px;width:36px;height:36px;border-radius:50%;background:#1c1d21}`;
  return shot(c, `
<div class="chat">
  <aside><div class="new">+ ${esc(c.newChat)}</div><div class="h"></div><div class="h"></div><div class="h"></div></aside>
  <main>
    <div class="title">${esc(c.app)}</div>
    <div class="msg u">${esc(c.q)}</div>
    <div class="msg a"><i></i><div>${esc(c.a)}</div></div>
    <div class="composer"><div id="box" contenteditable="true" spellcheck="false"></div><div class="go"></div></div>
  </main>
</div>`, { url: c.url, css });
}

function imagePage(c, img, url) {
  return shot(c, `<img src="${img}" style="display:block;width:1120px">`, { url });
}

function popupPage(c) {
  const css = `
.backdrop{position:absolute;inset:0;filter:saturate(.7);opacity:.55}
.pop{position:absolute;right:12px;top:6px;width:380px;border-radius:10px;overflow:hidden;
  box-shadow:0 18px 50px rgba(20,16,60,.32),0 0 0 1px rgba(20,16,60,.12)}
.pop img{display:block;width:380px}`;
  return shot(c, `<div class="backdrop"><img src="/img/chat-bg.png" style="display:block;width:1120px"></div>
<div class="pop"><img src="/img/popup.png"></div>`, { url: c.host, css, tbOn: true });
}

function featuresPage(c) {
  const css = `
.grid{position:absolute;left:80px;right:80px;top:226px;display:grid;grid-template-columns:repeat(3,1fr);gap:22px}
.card{background:#fff;color:#1c1d21;border-radius:16px;padding:28px 26px 26px;min-height:224px;
  box-shadow:0 18px 44px rgba(18,8,80,.28)}
.ic{width:48px;height:48px;border-radius:12px;background:#ededfb;display:grid;place-items:center;margin-bottom:20px}
.ic svg{width:26px;height:26px;fill:none;stroke:#5b5bd6;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.card h3{margin:0 0 10px;font-size:21px;font-weight:700}
.card p{margin:0;font-size:16px;line-height:1.55;color:#5d616c;text-wrap:pretty}
.card p.mono span{white-space:nowrap;margin-right:12px}
.card p.mono{font-size:15px;color:#4b4bc4}`;
  const cards = c.cards.map(([ic, h, p]) => `
<div class="card"><div class="ic"><svg viewBox="0 0 24 24">${ICONS[ic]}</svg></div>
<h3>${esc(h)}</h3>${ic === 'braces'
    ? `<p class="mono">${p.split(/\s+/).map((x) => `<span>${esc(x)}</span>`).join(' ')}</p>`
    : `<p>${esc(p)}</p>`}</div>`).join('');
  return page(SHOT_CSS + css, `<div class="cap"><h1>${esc(c.title)}</h1><p>${esc(c.sub)}</p></div><div class="grid">${cards}</div>`, 1280, 800);
}

function promoPage(c) {
  const css = `
.wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.logo{width:76px;height:76px;border-radius:20px;background:#fff;display:grid;place-items:center;
  box-shadow:0 10px 26px rgba(18,8,80,.35)}
.logo svg{width:64px;height:64px}
h1{margin:18px 0 0;font-size:38px;font-weight:700;letter-spacing:-.02em;line-height:1}
p{margin:12px 0 0;font-size:17px;color:rgba(255,255,255,.9)}`;
  return page(css, `<div class="wrap"><div class="logo">${bolt('#5b5bd6')}</div>
<h1>TypeBolt</h1><p>${esc(c.promo.tagline)}</p></div>`, 440, 280);
}

function marqueePage(c) {
  const css = `
.l{position:absolute;left:110px;top:0;bottom:0;width:620px;display:flex;flex-direction:column;justify-content:center}
.brand{display:flex;align-items:center;gap:16px}
.logo{width:64px;height:64px;border-radius:17px;background:#fff;display:grid;place-items:center;box-shadow:0 10px 26px rgba(18,8,80,.35)}
.logo svg{width:54px;height:54px}
.brand span{font-size:30px;font-weight:700}
h1{margin:30px 0 0;font-size:56px;line-height:1.1;font-weight:700;letter-spacing:-.02em}
.sub{margin:18px 0 0;font-size:21px;line-height:1.45;color:rgba(255,255,255,.88);text-wrap:balance}
.chips{display:flex;gap:10px;margin-top:28px}
.chips span{padding:7px 14px;border-radius:999px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.3);font-size:15px}
.r{position:absolute;right:110px;top:0;bottom:0;width:520px;display:flex;flex-direction:column;justify-content:center}
.in{background:#fff;color:#1c1d21;border-radius:14px;padding:18px 20px;font-size:22px;box-shadow:0 18px 44px rgba(18,8,80,.3)}
.in .k{font-family:"DejaVu Sans Mono",monospace;color:#5b5bd6}
.in .caret{display:inline-block;width:2px;height:24px;background:#5b5bd6;vertical-align:-4px;margin-left:2px}
.arrow{height:60px;display:grid;place-items:center}
.arrow svg{width:30px;height:30px;stroke:#fff;stroke-width:2.4;fill:none;stroke-linecap:round;stroke-linejoin:round}
.out{background:#fff;color:#1c1d21;border-radius:14px;padding:20px 22px;font-size:18px;line-height:1.6;text-wrap:pretty;box-shadow:0 18px 44px rgba(18,8,80,.3)}
.out mark{background:rgba(91,91,214,.14);box-shadow:inset 0 -2px 0 rgba(91,91,214,.55);border-radius:4px;padding:1px 3px;color:inherit}`;
  const m = c.marquee;
  return page(css, `
<div class="l"><div class="brand"><div class="logo">${bolt('#5b5bd6')}</div><span>TypeBolt</span></div>
<h1>${esc(m.headline)}</h1><p class="sub">${esc(m.sub)}</p>
<div class="chips">${c.promo.chips.map((x) => `<span>${esc(x)}</span>`).join('')}</div></div>
<div class="r"><div class="in"><span class="k">${esc(c.s2.shortcut)}</span><span class="caret"></span></div>
<div class="arrow"><svg viewBox="0 0 24 24"><path d="M12 4v16M5 13l7 7 7-7"/></svg></div>
<div class="out">${esc(m.prompt).replace(esc(c.s2.value), `<mark>${esc(c.s2.value)}</mark>`)}</div></div>`, 1400, 560);
}

function iconPage() {
  return `<!doctype html><html><head><style>html,body{margin:0;background:transparent}
svg{display:block;width:96px;height:96px;margin:16px}</style></head><body>${iconSvg}</body></html>`;
}

// ---------- tiny server for the stage pages (content scripts only run on http pages) ----------

function startServer(routes) {
  const server = http.createServer((req, res) => {
    const r = routes.get(new URL(req.url, 'http://x').pathname);
    if (!r) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': r.type });
    res.end(r.body);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((r) => { server.close(r); server.closeAllConnections(); }),
  })));
}

const html = (body) => ({ type: 'text/html; charset=utf-8', body });
const png = (body) => ({ type: 'image/png', body });

async function waitFor(fn, what, timeout = 8000) {
  const end = Date.now() + timeout;
  for (;;) {
    if (await fn()) return;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

// Ask the content script in the page's tab to reload its state; resolves once it answers.
async function contentReady(sw, url) {
  await waitFor(() => sw.evaluate(async (u) => {
    const tab = (await chrome.tabs.query({})).find((t) => t.url === u);
    if (!tab) return false;
    const r = await chrome.tabs.sendMessage(tab.id, { type: 'typebolt:refresh' }).catch(() => null);
    return !!(r && r.ok);
  }, url), 'content script');
}

async function caretToEnd(p, sel) {
  await p.locator(sel).click();
  await p.locator(sel).evaluate((el) => el.closest('[contenteditable]').focus());
  await p.evaluate((s) => {
    const el = document.querySelector(s);
    const r = document.createRange();
    r.setStart(el, 0);
    r.collapse(true);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }, sel);
}

async function renderLocale(loc, c, server, routes) {
  const out = path.join(outRoot, loc);
  mkdirSync(out, { recursive: true });
  const context = await chromium.launchPersistentContext('', {
    // 2x so the options/popup captures stay sharp when embedded; final images are saved at CSS size.
    channel: 'chromium', headless: true, locale: c.lang, deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, `--lang=${c.lang}`],
  });
  try {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    const extId = new URL(sw.url()).host;
    await waitFor(() => sw.evaluate(async () => !!(await chrome.storage.local.get('meta')).meta), 'install');
    for (const p of context.pages()) await p.close();

    // Illustrative usage numbers so the stats rows are not empty.
    await sw.evaluate(async () => {
      const { snippets } = await chrome.storage.local.get('snippets');
      const uses = [96, 71, 44, 38, 22, 17, 12, 9, 6, 3];
      const bySnippet = {};
      let total = 0; let chars = 0;
      snippets.forEach((s, i) => {
        const u = uses[i] || 1; const n = u * Math.max(8, s.content.length - s.shortcut.length);
        bySnippet[s.id] = { uses: u, charsSaved: n, lastUsedAt: Date.now() - i * 3600e3 };
        total += u; chars += n;
      });
      await chrome.storage.local.set({ stats: { total: { uses: total, charsSaved: chars }, bySnippet } });
    });

    const viewport = { width: 1280, height: 800 };
    const save = (p, name) => p.screenshot({ path: path.join(out, name), scale: 'css' });

    // 1. Expansion in a mail composer.
    {
      routes.set(`/${loc}/s1.html`, html(mailPage(c.s1)));
      const p = await context.newPage();
      await p.setViewportSize(viewport);
      const url = `${server.origin}/${loc}/s1.html`;
      await p.goto(url);
      await contentReady(sw, url);
      await caretToEnd(p, '#line');
      await p.keyboard.type(c.s1.shortcut, { delay: 60 });
      await waitFor(() => p.locator('#body').evaluate((el, t) => el.textContent.includes(t), c.s1.after), 'expansion');
      // Annotate the expanded sentence (presentation only; the text itself was inserted by TypeBolt).
      await p.evaluate(({ after, shortcut }) => {
        const body = document.getElementById('body');
        const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const i = n.data.indexOf(after);
          if (i < 0) continue;
          const r = document.createRange();
          r.setStart(n, i); r.setEnd(n, i + after.length);
          const mark = document.createElement('mark');
          r.surroundContents(mark);
          const tag = document.createElement('span');
          tag.className = 'tag';
          tag.contentEditable = 'false';
          tag.innerHTML = '<b>⌨</b> ';
          tag.append(shortcut);
          mark.append(tag);
          break;
        }
        body.blur();
      }, { after: c.s1.after, shortcut: c.s1.shortcut });
      await save(p, 'screenshot-1-expand.png');
      await p.close();
    }

    // 2. AI prompt with the fill-in overlay open.
    {
      routes.set(`/${loc}/s2.html`, html(chatPage(c.s2)));
      const p = await context.newPage();
      await p.setViewportSize(viewport);
      const url = `${server.origin}/${loc}/s2.html`;
      await p.goto(url);
      // Plain chat (no overlay) doubles as the popup screenshot's backdrop.
      const bg = await p.locator('.content').screenshot({ scale: 'css' });
      routes.set('/img/chat-bg.png', png(bg));
      await contentReady(sw, url);
      await caretToEnd(p, '#box');
      await p.keyboard.type(c.s2.shortcut, { delay: 60 });
      const field = p.getByLabel(c.s2.field);
      await field.waitFor();
      await field.fill(c.s2.value);
      await p.waitForTimeout(300); // let the overlay's entrance transition finish
      await save(p, 'screenshot-2-ai-prompt.png');
      await p.close();
    }

    // 3. Options page with an AI prompt selected.
    {
      const p = await context.newPage();
      await p.setViewportSize({ width: 1120, height: 578 });
      await p.goto(`chrome-extension://${extId}/src/options/options.html`);
      await p.locator('#list .item', { hasText: c.s3.pick }).first().click();
      await p.locator('#preview').waitFor();
      await p.locator('#f-content').evaluate((el) => el.blur());
      await p.evaluate(() => {
        const pane = document.querySelector('.editor-pane').getBoundingClientRect();
        const bar = document.querySelector('.topbar').getBoundingClientRect();
        window.scrollBy(0, pane.top - bar.bottom - 14);
      });
      routes.set(`/img/options-${loc}.png`, png(await p.screenshot()));
      await p.close();
      routes.set(`/${loc}/s3.html`, html(imagePage(c.s3, `/img/options-${loc}.png`, 'TypeBolt')));
      const s = await context.newPage();
      await s.setViewportSize(viewport);
      await s.goto(`${server.origin}/${loc}/s3.html`);
      await s.waitForLoadState('networkidle');
      await save(s, 'screenshot-3-manage.png');
      await s.close();
    }

    // 4. Popup over a page (tab lookup stubbed so the per-site switch shows a hostname).
    {
      const p = await context.newPage();
      await p.setViewportSize({ width: 380, height: 900 });
      await p.addInitScript((host) => { chrome.tabs.query = async () => [{ id: 1, url: `https://${host}/` }]; }, c.s4.host);
      await p.goto(`chrome-extension://${extId}/src/popup/popup.html`);
      await p.locator('#list .item').first().waitFor();
      await p.locator('#site-row').waitFor();
      const box = await p.locator('body').boundingBox();
      const img = await p.screenshot({ clip: { x: 0, y: 0, width: 380, height: Math.min(560, Math.ceil(box.height)) } });
      routes.set('/img/popup.png', png(img));
      await p.close();
      routes.set(`/${loc}/s4.html`, html(popupPage(c.s4)));
      const s = await context.newPage();
      await s.setViewportSize(viewport);
      await s.goto(`${server.origin}/${loc}/s4.html`);
      await s.waitForLoadState('networkidle');
      await save(s, 'screenshot-4-popup.png');
      await s.close();
    }

    // 5. Privacy / feature summary, then the promo tiles.
    for (const [name, body, size] of [
      ['screenshot-5-privacy.png', featuresPage(c.s5), viewport],
      ['promo-small-440x280.png', promoPage(c), { width: 440, height: 280 }],
      ['promo-marquee-1400x560.png', marqueePage(c), { width: 1400, height: 560 }],
    ]) {
      routes.set(`/${loc}/${name}.html`, html(body));
      const s = await context.newPage();
      await s.setViewportSize(size);
      await s.goto(`${server.origin}/${loc}/${name}.html`);
      await save(s, name);
      await s.close();
    }
  } finally {
    await context.close();
  }
}

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });
const routes = new Map();
const server = await startServer(routes);
try {
  for (const [loc, c] of Object.entries(COPY)) await renderLocale(loc, c, server, routes);
  const browser = await chromium.launch({ channel: 'chromium' });
  const p = await browser.newPage({ viewport: { width: 128, height: 128 } });
  await p.setContent(iconPage());
  await p.screenshot({ path: path.join(outRoot, 'store-icon-128.png'), omitBackground: true });
  await browser.close();
} finally {
  await server.close();
}
console.log(`store assets written to ${path.relative(root, outRoot)}/`);
