# DECISIONS — 与 SPEC 的差异与实现取舍

SPEC（`docs/SPEC.md`）是单一事实来源。以下记录实现中**偏离或补充**规格的地方及原因；没有列出的部分均按规格实现。

## 偏离 / 补充

1. **内容脚本新增 `typebolt:refresh` 消息**（规格未提）。收到后重新读取存储并应答。原因：E2E 需要确定性地等待“内容脚本已拿到最新数据”，而不是固定 sleep。`chrome.storage.onChanged` 路径仍是生产路径，并由 AC13/AC14 的测试用轮询（不发送 refresh）直接覆盖。
2. **内容脚本首次加载未完成时，输入事件会等待加载后再检查**（规格未提）。避免页面刚加载时快速输入的第一批按键被丢弃。
3. **取光标前文本使用 `maxLen + 2` 个字符**（规格写 `maxLen + 1`）。多取 1 个以便在短码前仍能读到“边界字符”，复杂度仍是 O(maxLen)。
4. **`compositionend` 后用 `setTimeout(0)` 再检查**。保证浏览器已把组合文本写入 DOM，并避免在 compositionend 派发过程中改写 DOM。已用 CDP `Input.imeSetComposition` + `Input.insertText` 在 input / textarea / contenteditable 上验证（AC8）。
5. **填空浮层的 Shadow Root 使用 `open` 模式**。规格只要求 Shadow DOM；使用 open 是为了让 E2E 能断言浮层内部样式与内容。页面脚本理论上因此能读取浮层 DOM，但页面本来就无法看到你在浮层里按下的键（宿主上已阻止冒泡），风险相当于页面能读取自己的 DOM。
6. **浮层额外行为**：点击浮层外部（mousedown）等同于取消；Tab 在“字段 → 取消 → 插入”间循环；视口缩放/滚动时重新定位。均未在规格中，目的是避免遗留孤立浮层。
7. **管理页“删除”使用页内二次确认条**，而不是 `window.confirm()`：可被键盘与自动化稳定操作，且不会被浏览器拦截。仍满足“需确认”。
8. **“复制”按钮的含义**：解释为“复制为新片段”（预填名称“… (copy)”与内容、短码留空，保存时走正常校验），而不是复制到剪贴板（剪贴板复制在 Popup 中提供）。
9. **校验错误码命名**：规格只固定了 `prefix_conflict`，其余为 `shortcut_empty`、`shortcut_too_short`、`shortcut_too_long`、`shortcut_whitespace`、`shortcut_duplicate`、`content_empty`；导入另有 `invalid_item`、`invalid_json`、`invalid_format`。i18n 键为 `err_<code>`，由单测保证每个错误码都有文案。
10. **片段名称可为空**，保存时回落为短码（规格未要求名称必填）。
11. **导入的跳过原因只报告第一个错误码**，一条记录只显示一个原因。
12. **Popup 站点开关**：重新“启用”时会移除所有覆盖当前主机的规则（包括父域规则，如 `example.com` 覆盖 `mail.example.com`），因为仅添加不能覆盖父域规则。
13. **Service Worker 使用 `importScripts`**（经典 worker，而非 ES module），以便与“全局命名空间 + CommonJS”共享文件一致。
14. **`{input:}`（空标签）按原样保留为文本；`{date:}` / `{time:}`（空格式）使用默认格式。** 规格未规定这两种边界。
15. **`minimum_chrome_version` 设为 110**。这是人为选择的保守下限（用到 `Intl.Segmenter`、`adoptedStyleSheets`、MV3 service worker、`selection.modify`）；仅在 Chromium 151 上实测，低版本未验证。
16. **规格未列出的内部文件**：`src/shared/ui.css`（弹窗/管理页共用样式）。

## 验收第 1 轮后的修订（真实编辑器框架）

以下改动扩展了上面第 4 条，并取代 SPEC §3.7 中“在 input 事件里同步展开”的做法。根因已经用独立的真实框架夹具复现并逐一验证。

1. **检测改为延迟 + 合并**：`input` / `keyup` / `compositionend` 都只调度一次 `setTimeout(0)` 检查（合并重复调度），让页面编辑器先处理完自己的按键。原先在捕获阶段 `input` 里同步改 DOM，会让 Slate / Lexical 看到“外来”的 DOM 和选区变化（Slate 报 `Got unexpected null or undefined`）。展开本身变成异步，`busy` 标志防止重入；展开期间的按键不会触发新的检测。
2. **Chrome 的 `execCommand('insertText')` 只触发 `input`，不触发 `beforeinput` / `textInput`（已在 Chrome 151 上验证）**，而 Slate、Lexical 只从 `beforeinput` 得知文本变化。因此对 contenteditable，先在编辑宿主上派发一个 `cancelable` 的合成 `beforeinput`（`insertText`）：若页面 `preventDefault()`，说明编辑器接管了插入，**绝不再走 DOM 回退**，只等待它提交；否则才执行原生 `execCommand('insertText')`，仅当它返回 false 且 DOM 未变化时才使用 DOM 节点回退。（原先“内容未变”判断把编辑器异步提交误判成失败，从而用 DOM 回退破坏了编辑器状态。）
3. **多行文本进入 contenteditable 时先发合成 `paste` 事件**（携带 `text/plain` 的 `DataTransfer`）：若被 `preventDefault()` 则由编辑器处理（Draft.js 会弄坏 insertText 里的 `\n`）；否则（普通 contenteditable）再走第 2 条。副作用已写入 README：站点自己的粘贴规则会生效。（第 2 轮已改：Slate 不再额外等待，见下。）我试过用 `beforeinput(insertFromPaste)` 触发 Slate 的 flush，但 Lexical 对 `InputEvent` 形式的 paste 会 `preventDefault` 却不读取 `dataTransfer`，导致文本丢失，因此放弃。
4. **选择短码后等待 `selectionchange`（最多 40 ms）**，让编辑器把 DOM 选区同步到自己的模型，再插入；`{cursor}` 的 `selection.modify` 也在编辑器提交之后（约 16 ms）才执行，并再等一次 `selectionchange`。
5. **填空表单的选区恢复改为“按文本重新定位”**：提交 / 取消时先聚焦，检查光标前文本是否以短码结尾；不是则依次尝试已保存 Range 的末尾、再按文本在 DOM 中搜索最后一个短码，并在编辑器稳定后复查（最多 3 次）。Draft.js 的“填空值泄漏进编辑器”源于旧实现在 `input` 内同步打开浮层，随后 Draft 的 React 重渲染把焦点抢了回去；延迟检测后不再复现。
6. **起始语言 bug 的根因**：安装时 `chrome.i18n.getUILanguage()` 与 `@@ui_locale` 仍报告浏览器默认语言（`en-US` / `en_US`），而 `chrome.i18n.getMessage()` 已按 `--lang=zh-CN` 解析出中文目录——两者在安装那一刻不一致。现在用 message 目录里的 `starterPackLang`（英文目录为 `en`，zh_CN 目录为 `zh`）选择示例包，保证与用户看到的界面语言一致；`getUILanguage()` 仅作缺省回退。
7. **安装处理器在写入前重新读取存储**：缩小“先读后写”窗口，避免把测试或其他上下文刚写入的片段覆盖掉（验收脚本发现过一次竞态）。仍不是原子操作（`chrome.storage` 不提供事务）。
8. **测试策略变化**：展开变成异步后，E2E 里“不应展开”的断言先 `flush()`（等 150 ms，让延迟检测有机会执行），“光标位置”断言先轮询光标前文本；这是对被测行为变化的适配，没有放宽任何断言。`real-editors.spec.js` 对 7 种真实编辑器检查编辑器自己的模型。
9. **已接受的框架行为**：ProseMirror、Quill、Slate 会把“短码 + 展开”合并成一个撤销步骤（一次 Ctrl+Z 两者一起消失），按要求仅文档化，不做绕过；textarea 的撤销（AC11）仍通过。
10. 许可证：所有者确定为 **AGPL-3.0-or-later**（`LICENSE` 为 GNU 官方全文，`package.json` 同步），打包 zip 附带 `LICENSE`。

## 验收第 2 轮：快速输入不得丢字

1. **待定展开守卫（pending-expansion guard）**：从“选中短码”到“真正插入”之间（含填空表单提交后的重新选中），在 `document` 捕获阶段监听用户的 `keydown`（忽略单独的修饰键）、`beforeinput`、`mousedown`、`compositionstart`。一旦出现，**在浏览器默认动作之前**把选区折叠回短码末尾并中止本次展开——结果是“字面短码 + 用户刚输入的内容”，绝不会让用户的按键替换掉被选中的短码。只响应 `isTrusted` 事件，所以我们自己派发的 `beforeinput` / `paste` 以及页面的合成事件都不会误触发。变异检查：禁用守卫后，Lexical 在 0/10 ms 每键的多行输入下会丢字。
2. **缩短窗口**：去掉了对所有编辑器的 120 ms 等待。现在只在选中短码后等 `selectionchange`（通常几毫秒，最多 40 ms），然后立即插入。Slate 的选区同步有 100 ms 节流且 `paste` 不会 flush，但它在处理 `beforeinput` 时会 flush；所以对 Slate（`[data-slate-editor]`）多行文本先派发 `beforeinput(insertFromPaste, dataTransfer)`，被接管则完成，否则回退到 `paste` 事件。这个办法不通用（Lexical 会 `preventDefault` 却不读 `dataTransfer`），因此只对 Slate 启用。
3. **统计只记录真实展开**：`insertRendered` 被中止时返回 `false`，不再调用 `report()`。
4. 已知限制（README 已更新）：每键间隔极短（约 ≤ 10 ms，超出人类输入速度）时展开可能被中止，此时保留字面短码和用户后续输入。

## 自动化未能完全覆盖的部分（如实记录）

- **AC28 站点开关**规格标为 [M]：自动化测试把 `chrome.tabs.query` 打桩后验证开关逻辑；真实 http 页面上的弹窗取当前标签仍需人工检查（Playwright 无法点击浏览器工具栏图标来打开真正的弹窗）。
- **AC29 “向已打开的标签页注入”**：全新安装时浏览器里没有预先存在的 http 标签页，无法端到端复现。测试通过监视 `chrome.scripting.executeScript` 验证 `update` 路径确实以 `allFrames: true` 和正确文件列表发起注入，且用户数据不变；注入后的单例行为由 AC30 验证。
- **AC33/AC34/AC35 [M]**：以静态检查（单测里的源码扫描：无 eval / new Function / innerHTML 赋值 / 网络 API / 远程资源）与代码审阅为准；AC34 由实现保证（contenteditable 向前最多收集 `maxLen+2` 个字符并在 `<br>` / 块边界停止，input/textarea 只截取尾部），未做性能基准。
- **真实站点兼容性**（Gmail、Notion、ChatGPT 等）未测试，仅用本地夹具页面。

## 更名

原名 Snipkey 与 Chrome 应用商店中已有的同类插件 “SnipKey — Text Expander & Snippets” 重名，所有者选定新名 **TypeBolt**（中文名“闪打”）。项目内的标识（全局命名空间、`data-typebolt-ignore` 属性、`typebolt:*` 消息、导出格式 `"format": "typebolt"`、zip 文件名）随之一并改名；因尚未发布，没有旧数据需要兼容。

## 上架准备（0.1.1）

1. **英文简介缩短到 127 字符**：Chrome 应用商店要求 manifest `description` 不超过 132 个字符，原英文简介为 137 个字符，会导致上传被拒。`tests/unit/i18n.test.js` 新增断言，所有语言的名称 ≤ 75、简介 ≤ 132 个字符。
2. **移除 `activeTab` 权限**（偏离 SPEC 原文，SPEC 已同步）：弹窗通过 `chrome.tabs.query` 读取当前标签页 URL，`<all_urls>` 主机权限已授予读取 http(s) 标签页 URL 的能力，代码中没有其他依赖 `activeTab` 的地方。商店政策要求只申请必需的最小权限，多余权限是常见的拒审原因。已在 Chromium 上实测：只保留 `storage`、`scripting` 时，扩展仍能读到 http 标签页的 URL。
3. **隐私政策改为如实描述本地处理**：原文写“不读取你在网页中输入的内容”，但内容脚本确实会在本地读取光标前最多 `maxLen + 2` 个字符。商店的用户数据 FAQ 要求即使只在本地处理也必须披露，因此隐私政策与后台“数据使用”勾选项（见 `docs/STORE.md`）改为一致的描述。
4. 版本号升为 0.1.1：GitHub 上的 v0.1.0 zip 含超长简介，不能直接提交商店。
