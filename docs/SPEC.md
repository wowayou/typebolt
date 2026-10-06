# TypeBolt — 实现方案与验收标准（SPEC）

> 状态：v0.1 MVP 规格。作者：方案/验收由 Opus 负责，实现交给 Sonnet。
> 本文件是本项目的单一事实来源（SoT）。实现若必须偏离，需在 `docs/DECISIONS.md` 记录原因。

## 1. 产品定位

**TypeBolt — Text Expander & Prompt Library（文本快捷短语 & AI 提示词库）**

在任意网页输入框里输入短码（如 `;thx`），自动展开成预设文本；支持日期/光标定位/填空表单等动态占位符。
同一套机制也是“AI 提示词库”：在 ChatGPT / Claude / Gemini / DeepSeek 等输入框里输入 `;tr` 即展开翻译提示词并弹出填空。

选择理由（简述）：
- 付费验证：Text Blaze、Magical 等同类产品以订阅制盈利，付费人群是客服/销售/招聘/运营等高频打字岗位。
- 留存与传播：高频日用工具；“提示词库 + 填空表单”在 AI 用户群中易分享；导入/导出 JSON 可分享“短语包”。
- 差异点：100% 本地、无账号、无网络请求、开源可审计；中文输入法（IME）友好。

商业化路线（本期**不实现**，仅在 README 简述）：免费版本地无限片段；Pro 规划为云同步、团队共享库、高级表单（下拉/日期运算）、使用统计导出。

## 2. 范围

### P0（本期必须）
1. 片段（snippet）的增删改查管理页（options page），含校验、实时预览、导入/导出 JSON、设置。
2. 页面内展开：`<input>`（text/search/url/tel/无 type）、`<textarea>`、`contenteditable`；含 iframe（`all_frames` + `match_about_blank`）与 open shadow root 内的 input/textarea。
3. 占位符：`{cursor}`、`{date}`/`{date:FORMAT}`、`{time}`/`{time:FORMAT}`、`{input:Label}`（填空表单浮层）。
4. Popup：搜索片段、点击复制（含填空）、全局开关、当前站点开关、累计节省统计、打开管理页。
5. 使用统计：每个片段使用次数、节省字符数；总计。
6. 首次安装：按浏览器语言写入示例片段包（仅当无片段时）；打开管理页欢迎区（含 “试一试” 输入框）；向已打开的 http(s) 标签页注入内容脚本。
7. i18n：`en`（默认）与 `zh_CN`。
8. 测试：Node 单元测试 + Playwright E2E（无头 Chromium 加载未打包扩展）；打包脚本生成上架用 zip。
9. 文档：README（中文为主）、PRIVACY.md、DECISIONS.md（若有偏离）。

### 明确不做（Out of scope）
`{clipboard}`、日期加减、下拉选择字段、片段嵌套、文件夹/标签、云同步、付费/License、Popup 直接插入页面、Google Docs（canvas 编辑器）专门适配、closed shadow root、`type=email/number` 输入框。

## 3. 技术方案

### 3.1 约束
- Manifest V3，**无构建步骤**，原生 JS（ES2022），不引入运行时依赖；不使用 `eval`/`new Function`/远程代码。
- 共享逻辑写成“全局命名空间 + CommonJS 兼容”文件：浏览器里挂到 `globalThis.TypeBoltEngine`，Node 里 `module.exports`，以便 `node --test` 直接测试。
- 任何用户内容渲染到 DOM 时使用 `textContent`/DOM API，禁止拼接 `innerHTML`。
- 代码注释用英文；用户可见文本全部走 `chrome.i18n`（示例片段数据除外）。

### 3.2 目录结构（建议，可微调）
```
typebolt/
  manifest.json
  _locales/{en,zh_CN}/messages.json
  icons/icon{16,32,48,128}.png  (+ icon.svg 源文件)
  src/
    shared/engine.js        # 纯逻辑：模板解析/渲染、匹配、校验、导入校验、站点规则
    shared/storage.js       # chrome.storage 读写封装（页面与 SW 共用）
    shared/starter-pack.js  # 示例片段（en / zh）
    shared/i18n.js          # data-i18n 属性填充
    background/service-worker.js
    content/content.js      # 监听、匹配、替换、统计上报、单例/失效处理
    content/form-overlay.js # {input:} 填空浮层（Shadow DOM）
    options/options.{html,css,js}
    popup/popup.{html,css,js}
  tests/
    unit/*.test.js          # node --test
    e2e/*.spec.js           # Playwright
    fixtures/*.html, server.js
  scripts/gen-icons.mjs, scripts/package.mjs
  docs/SPEC.md, docs/PRIVACY.md, docs/DECISIONS.md(按需)
  package.json, README.md, .gitignore
```

### 3.3 manifest 要点
- `permissions`: `storage`, `scripting`（不需要 `activeTab`：`<all_urls>` 主机权限已能读取标签页 URL，见 DECISIONS“上架准备”）；`host_permissions`: `<all_urls>`（与 content script 覆盖面一致，不新增警告）。**不要** `tabs`、`clipboardRead`、`offscreen`。
- `content_scripts`: `matches: ["<all_urls>"]`，`all_frames: true`，`match_about_blank: true`，`run_at: "document_idle"`，按顺序加载 engine.js → form-overlay.js → content.js。
- `commands._execute_action.suggested_key`: `Ctrl+Shift+Period` / mac `Command+Shift+Period`。
- `options_ui`: `{ page, open_in_tab: true }`；`action.default_popup`。

### 3.4 存储模型（`chrome.storage.local`，键名固定，测试会直接写入）
```js
snippets: Array<{ id: string, name: string, shortcut: string, content: string, createdAt: number, updatedAt: number }>
settings: { enabled: boolean, disabledSites: string[] }          // 默认 { enabled: true, disabledSites: [] }
stats:    { total: { uses: number, charsSaved: number },
            bySnippet: Record<id, { uses: number, charsSaved: number, lastUsedAt: number }> }
meta:     { schemaVersion: 1, installedAt: number }
```
- 删除片段时可删除其 `bySnippet` 项，但 `total` 保留。
- 导出格式：`{ "format": "typebolt", "version": 1, "exportedAt": ISO字符串, "snippets": [{ name, shortcut, content }] }`。

### 3.5 模板语法（engine.js）
- 只识别以下占位符，其余花括号文本**原样保留**（保证代码片段如 `function() { }` 无需转义）：
  - `{cursor}`：展开后光标位置；仅第一个生效，其余移除。
  - `{date}` = `{date:YYYY-MM-DD}`；`{time}` = `{time:HH:mm}`；格式 token：`YYYY YY MM M DD D HH H mm ss dddd`（`dddd` = 用 `Intl.DateTimeFormat(locale,{weekday:'long'})` 的星期名）；非 token 字符原样输出（如 `YYYY年MM月DD日`）。最长 token 优先匹配。
  - `{input:Label}`：填空字段；同名 Label 多次出现共享同一值；字段按首次出现顺序。
- 识别正则建议：`/\{(cursor|date(?::[^{}]*)?|time(?::[^{}]*)?|input:[^{}]+)\}/g`。
- API（建议，可微调但需单测覆盖）：
  - `parseTemplate(content) -> Token[]`
  - `getInputFields(content) -> string[]`
  - `renderTemplate(content, { now: Date, locale: string, inputs: Record<string,string> }) -> { text: string, cursorOffset: number | null }`（`cursorOffset` 以 UTF-16 下标计）
  - `formatDate(date, format, locale) -> string`
  - `buildIndex(snippets) -> { map: Map<shortcut, snippet>, maxLen, minLen }`
  - `findMatch(textBeforeCaret, index) -> { snippet, shortcut } | null`
  - `validateSnippet(draft, allSnippets) -> errorCode[]`（错误码给 i18n 用）
  - `validateImport(json, existingSnippets) -> { toAdd: [], skipped: [{ item, reason }], error?: code }`
  - `normalizeSite(input) -> hostname | null`；`isSiteDisabled(hostname, disabledSites) -> boolean`

### 3.6 匹配规则
- 短码：2–32 个码点，不含空白；大小写敏感；不可重复；**任一短码不得是另一短码的前缀**（否则较长者永远无法触发）→ 校验报错 `prefix_conflict`。
- 内容不能为空。
- 匹配：取光标前最多 `maxLen + 1` 个字符，从长到短查 `map`，**最长匹配优先**。
- 边界：短码前一个字符若为 ASCII 单词字符 `[A-Za-z0-9_]` 则**不展开**（避免 `abc;thx`、URL 路径误触发）；行首、空白、标点、中文字符后均可展开（中文不加空格的书写习惯）。
- 推荐前缀 `;`（示例包统一使用；`/` 会与 Slack/Notion/Discord 的斜杠命令冲突）。

### 3.7 内容脚本行为（content.js）
**触发时机**
- `document` 捕获阶段监听 `input`：仅当 `!e.isComposing` 且 `inputType` 为 `insertText`（或缺省）时检查。粘贴（`insertFromPaste`/`insertFromDrop`）不展开。
- 监听 `compositionend`：输入法上屏后检查一次（Chrome 中最后一个 `input` 事件带 `isComposing: true`）。
- 兜底：对 `keydown` 可打印单字符，在 `keyup` 时若本次按键后未收到 `input` 事件（部分编辑器在 `beforeinput` 中 `preventDefault` 自行改 DOM），再检查一次。
- 使用 `e.composedPath()[0]` 获取真实目标（穿透 open shadow root）。
- **禁止链式展开**：一次展开后，直到下一次真实按键前不再检查。

**可编辑目标判定**
- `textarea`；`input` 且 type ∈ {text, search, url, tel, 空}；非 `readOnly`/`disabled`。
- `isContentEditable` 的元素（取 editing host）。
- 排除：`type=password`、元素或祖先带 `data-typebolt-ignore` 属性。
- 全局 `settings.enabled=false` 或当前 `location.hostname` 命中 `disabledSites`（精确或子域，如 `example.com` 覆盖 `mail.example.com`）则不工作。设置/片段变更通过 `chrome.storage.onChanged` 即时生效，无需刷新页面。

**光标前文本获取**
- input/textarea：`value.slice(0, selectionStart)`，仅在无选区（`selectionStart === selectionEnd`）时。
- contenteditable：仅向前收集至多 `maxLen + 1` 个字符，遇到 `<br>` 或块级元素边界停止；**禁止**序列化整个编辑器（性能：每次按键 O(maxLen)）。

**替换**
1. 选中短码：input/textarea 用 `setSelectionRange`；contenteditable 用 `selection.modify('extend','backward','character')`，次数按字形簇（`Intl.Segmenter`）计。
2. `document.execCommand('insertText', false, text)`（走原生编辑管线：触发 `beforeinput`/`input`、兼容 React 等框架、支持 Ctrl+Z 撤销）。
3. 若返回 false 或内容未变：input/textarea 回退 `setRangeText` + 派发 `InputEvent('input', {bubbles:true, inputType:'insertText', data})`；contenteditable 回退 Range 插入 + 派发 `input`。
4. 多行文本在 contenteditable 中必须呈现为换行（`innerText` 含换行）；若 `insertText` 对 `\n` 表现不符，需逐行插入并用 `insertLineBreak`/`insertParagraph`，由 E2E 验证。
5. `{cursor}`：插入后把光标移到 `cursorOffset`（input 用 `setSelectionRange`；contenteditable 用 `selection.modify('move','backward',…)`）。
6. 成功后 `chrome.runtime.sendMessage({ type: 'typebolt:used', id, charsSaved })`，`charsSaved = max(0, 渲染文本长度 - 短码长度)`。

**单例与失效**
- 初始化时在 `document` 上派发自定义事件 `typebolt:init`（带实例 id）；旧实例收到后解除所有监听（扩展更新/重新注入时防重复展开）。
- 每次展开前检查 `chrome.runtime?.id`；为空（扩展上下文失效）则解除监听并静默退出，不抛错到控制台。

### 3.8 填空浮层（form-overlay.js）
- 片段含 `{input:…}` 时，先保存上下文（目标元素 + 短码选区：input 记录 start/end；contenteditable 记录 `Range` 克隆），再弹出浮层。
- 浮层：挂在 `document.documentElement` 下的宿主元素 + **Shadow DOM**；样式用 `adoptedStyleSheets`（`CSSStyleSheet.replaceSync`），不依赖页面 CSS，在严格 CSP 页面也能正确显示；支持暗色（`prefers-color-scheme`）。
- 内容：片段名、每个唯一 Label 一个单行输入框（首个自动聚焦）、“插入 (Enter)” / “取消 (Esc)”；Tab 切换字段；Enter 提交；Esc 取消。
- 位置：目标元素附近（下方，空间不足则上方），始终限制在视口内。
- 隔离：在宿主上对 `keydown/keyup/keypress/input/beforeinput` `stopPropagation`，防止触发页面冒泡阶段的快捷键（如 Gmail）。
- 提交：移除浮层 → 聚焦原元素 → 恢复短码选区 → 按 3.7 插入渲染结果。取消：移除浮层、保留已输入的短码、焦点回到原元素且光标在短码之后。
- 同一时刻只存在一个浮层；目标元素被移出 DOM 时取消。

### 3.9 Service Worker
- `onInstalled`：
  - `install`：若 `snippets` 为空则按 `chrome.i18n.getUILanguage()`（`zh*` → 中文包，否则英文包）写入示例片段；写入默认 `settings`、`stats`、`meta`；打开管理页 `?welcome=1`。
  - `install` 与 `update`：用 `chrome.scripting.executeScript` 向所有现存 `http(s)` 标签页（allFrames）注入内容脚本，逐个 try/catch 忽略失败。
  - `update`：不得覆盖或重置用户数据。
- 消息 `typebolt:used`：在 SW 内**串行**更新 `stats`（Promise 队列），连续快速多次展开不丢计数。

### 3.10 管理页（options）
- 左栏：搜索框 + 片段列表（名称、短码、内容预览、使用次数）；“新建”按钮。
- 右栏编辑器：名称、短码、内容（等宽 textarea）、占位符快捷插入按钮（`{cursor}` `{date}` `{time}` `{input:…}`）、实时预览（`{input:X}` 以 `[X]` 示意，日期用当前时间）、保存/删除（需确认）/复制。
- 校验错误内联显示（i18n 文案），不合法不保存。
- 设置区：全局开关；禁用站点列表（输入可接受完整 URL，规范化为 hostname）；导入 JSON（合并，跳过冲突并显示“新增 N、跳过 M（原因）”；非法文件报错且不改数据）；导出 JSON（下载 `typebolt-export-YYYYMMDD.json`）。
- 欢迎区（`?welcome=1` 时置顶显示，平时可折叠）：3 步上手说明 + “试一试”输入框（页面直接引入 engine/form-overlay/content 脚本，因为扩展页不会注入 content script）；管理表单根节点加 `data-typebolt-ignore`，避免在编辑内容时被展开。
- 统计概览：总展开次数、节省字符数、估算节省时间 `round(charsSaved / 200)` 分钟（按 40 词/分钟、5 字符/词）。

### 3.11 Popup
- 顶部：搜索框（自动聚焦，`data-typebolt-ignore`）；统计一行（“已展开 X 次 · 约节省 Y 分钟”）。
- 列表：名称 + 短码 + 预览；↑↓ 选择，Enter/点击 → 复制渲染文本到剪贴板（含 `{input}` 时在 popup 内显示内联填空后再复制；`{cursor}` 移除），显示“已复制”反馈。
- 底部：全局开关；“在 {hostname} 上启用” 开关（用 `chrome.tabs.query` 取当前标签 URL，由 `<all_urls>` 主机权限授权；非 http(s) 页面隐藏）；“管理片段” 链接。

### 3.12 UI 设计方向
冷静、实用、键盘优先（参考 Raycast / Linear 的克制感）；系统字体栈；一个强调色；支持亮/暗色；空状态与错误状态有设计；popup 宽约 380px。

## 4. 验收标准（AC）

标注：**[U]** 单元测试，**[E]** Playwright E2E，**[M]** 人工/截图检查。所有 [U]/[E] 必须由 `npm test` 实际跑通。

### 展开核心
- AC1 [E] `input[type=text]` 输入 `;thx` → 值被替换为片段内容，光标在末尾，元素上触发了 `input` 事件。
- AC2 [E] `textarea` 多行片段换行原样保留。
- AC3 [E] `contenteditable` 单行与多行片段均正确，多行呈现为换行。
- AC4 [E][U] `{cursor}` 在 input 与 contenteditable 中光标落在占位符位置，文本中不含 `{cursor}`。
- AC5 [U] 日期/时间格式（含 `YYYY年MM月DD日`、`dddd` 指定 locale、默认格式）在固定时间下输出正确；[E] 展开结果匹配日期模式。
- AC6 [U] 最长匹配优先；前缀冲突、重复、空白、长度越界、空内容均被校验拒绝并给出错误码。
- AC7 [E][U] `abc;thx` 不展开；`你好;thx`、`hi ;thx`、字段开头 `;thx` 展开。
- AC8 [E] 输入法组合进行中不展开（可用 CDP `Input.imeSetComposition` 或合成 composition 事件模拟）；组合结束后若光标前以短码结尾则展开。
- AC9 [E] 粘贴以短码结尾的文本不展开。
- AC10 [E] password 输入框不展开；`type=email` 输入框不展开且控制台无报错。
- AC11 [E] textarea 中展开后 Ctrl+Z 可恢复为已输入的短码。
- AC12 [E] 片段内容以另一短码结尾时不发生链式展开。
- AC13 [E] 全局关闭、或站点（含子域）在禁用列表中时不展开；修改设置后无需刷新即时生效。
- AC14 [E] 修改/新增片段后无需刷新页面即可用新短码展开。
- AC15 [E] 同源 iframe 与 `srcdoc` iframe 内可展开。
- AC16 [E] open shadow root 内的 input 可展开。
- AC17 [E] 带严格 CSP 响应头（`default-src 'self'; style-src 'self'; script-src 'self'`）的页面：展开正常，填空浮层样式正确（例如断言浮层输入框计算样式非浏览器默认/宿主尺寸合理）。

### 填空表单
- AC18 [E] `{input:Name}` 出现两次 + `{input:Day}` → 浮层恰好 2 个字段且首个聚焦；Enter 后两处 Name 均替换，焦点回到原输入框，光标位置正确。
- AC19 [E] Esc 取消：浮层移除，短码保留，焦点回到原元素。
- AC20 [E] 浮层内按键不触发页面 `document` 冒泡阶段的 keydown 监听。
- AC21 [E] contenteditable 目标同样支持填空表单。

### 统计
- AC22 [E] 每次展开 `uses+1`、`charsSaved` 正确累加（含 total）；快速连续 5 次展开计数为 5。

### 管理页 / Popup / 安装
- AC23 [E] 管理页可新建、编辑、删除片段；非法输入显示内联错误且不保存。
- AC24 [E] 预览随输入实时更新。
- AC25 [E][U] 导出文件符合 3.4 格式；导入合法文件按规则合并并显示结果；非法 JSON / 格式不符时报错且数据不变。
- AC26 [E][U] 禁用站点输入 `https://www.Example.com/path` 规范化为 `www.example.com`；`example.com` 规则覆盖子域。
- AC27 [E] 欢迎页“试一试”输入框可展开示例短码；编辑器内容框输入短码不会被展开。
- AC28 [E] Popup 列表、搜索过滤（名称/短码/内容）、点击复制（含填空）到剪贴板、统计显示、全局开关可用；[M] 站点开关在真实 http 页面可用。
- AC29 [E] 首次安装写入示例片段（英文环境为英文包），并打开欢迎页；对已有数据不覆盖（可通过模拟 `update` 路径或单测 SW 中的纯函数验证）。
- AC30 [E] 对同一页面重复注入内容脚本后，一次输入只展开一次（单例机制）。

### 质量 / 上架
- AC31 [M] 所有用户可见文案来自 `_locales`（en、zh_CN 键集合一致——可加 [U] 校验两份 messages.json 键一致、HTML 中 `data-i18n` 引用的键都存在）。
- AC32 `npm test` 运行单元 + E2E 全部通过（无头）；`npm run package` 生成 `dist/typebolt-<version>.zip`，仅含 `manifest.json`、`_locales/`、`icons/`、`src/`、`LICENSE`；zip 内 manifest 可被 Chrome 加载。
- AC33 [M] 无网络请求、无 `eval`/`new Function`/远程脚本、无以用户内容拼接 `innerHTML`；权限仅 `storage`、`scripting` + `<all_urls>` host。
- AC34 [M] 内容脚本每次按键工作量与短码最大长度相关，不随文档大小增长。
- AC35 [M] README（中文）：功能、安装（加载未打包扩展）、语法、示例、已知限制（Google Docs、email 输入框、closed shadow root、页面捕获阶段快捷键）、隐私说明、测试与打包命令、商业化路线简述；`docs/PRIVACY.md` 可直接作为商店隐私政策。

## 5. 测试工具约定
- 单元：`node --test tests/unit/`。
- E2E：`@playwright/test` 固定 **1.62.1**（本机 `~/.cache/ms-playwright` 已缓存其 chromium 1234，避免下载）；`chromium.launchPersistentContext('', { channel: 'chromium', headless: true, args: ['--disable-extensions-except=…', '--load-extension=…'] })`；通过 `context.serviceWorkers()` / `waitForEvent('serviceworker')` 拿到扩展 id 与 SW，用 `sw.evaluate(() => chrome.storage.local.set(...))` 写入测试数据。
- 测试页面由 `tests/fixtures/server.js`（Node 内置 http，随机端口）提供；CSP 页面通过响应头设置，脚本外链。
- 图标：`scripts/gen-icons.mjs` 用 Playwright 把 `icons/icon.svg` 渲染为 16/32/48/128 PNG（生成结果入库）。
- 打包：`scripts/package.mjs` 调用系统 `zip`。
