# TypeBolt 闪打 — 文本快捷短语与 AI 提示词库

在任意网页的输入框里输入短码（如 `;thx`），立刻展开成预设文本；同一套机制也是 **AI 提示词库**：在 ChatGPT / Claude / Gemini / DeepSeek 等输入框里输入 `;tr`，即展开翻译提示词并弹出填空表单。

- 100% 本地：数据只存在浏览器的 `chrome.storage.local`，无账号、无网络请求、无远程代码。
- 中文输入法友好：输入法组合过程中不会误触发，上屏后再检查。
- 开源可审计（AGPL-3.0-or-later）：无构建步骤、无压缩，原生 JavaScript，无运行时依赖。

## 功能

- 片段管理页：新建 / 编辑 / 删除 / 复制、实时预览、校验提示、搜索、导入 / 导出 JSON、全局开关、禁用站点列表。
- 页面内展开：`<input>`（text / search / url / tel）、`<textarea>`、`contenteditable`；支持同源 iframe、`srcdoc` iframe 与 open shadow root 内的输入框。
- 占位符：`{cursor}`、`{date}` / `{date:FORMAT}`、`{time}` / `{time:FORMAT}`、`{input:Label}`（填空表单浮层）。
- 弹窗（Popup）：搜索片段、点击或回车复制（含填空）、全局开关、当前站点开关、使用统计。快捷键 `Ctrl+Shift+.`（macOS：`Command+Shift+.`）。
- 使用统计：每个片段的使用次数与节省字符数，以及总计与估算节省时间。
- 首次安装自动写入示例片段包（按浏览器语言选择中文或英文，含日常回复、日期时间与 AI 提示词模板），并打开带“试一试”输入框的欢迎页。
- 界面语言：English、简体中文。

## 安装（加载未打包扩展）

1. 打开 `chrome://extensions`，开启右上角“开发者模式”。
2. 点击“加载已解压的扩展程序”，选择本目录（含 `manifest.json` 的 `typebolt/`）。
3. 安装后会自动打开欢迎页；在“试一试”输入框里输入 `;thx` 即可看到展开效果。

也可以从 [GitHub Releases](https://github.com/wowayou/typebolt/releases) 下载 `typebolt-<version>.zip`，或使用 `npm run package` 自行生成 `dist/typebolt-<version>.zip`（解压后同样可作为已解压扩展加载，或上传到 Chrome 应用商店）。

## 模板语法

| 占位符 | 含义 |
| --- | --- |
| `{cursor}` | 展开后光标停留的位置；仅第一个生效，其余被移除 |
| `{date}` | 当前日期，等同于 `{date:YYYY-MM-DD}` |
| `{time}` | 当前时间，等同于 `{time:HH:mm}` |
| `{date:FORMAT}` / `{time:FORMAT}` | 自定义格式 |
| `{input:Label}` | 填空字段；相同 Label 共用同一个值，字段按首次出现顺序排列 |

其余花括号文本原样保留（例如代码片段 `function() { }` 无需转义）。

日期格式 token：`YYYY` `YY` `MM` `M` `DD` `D` `HH` `H` `mm` `ss` `dddd`（星期名，随浏览器语言）。其他字符原样输出，例如 `{date:YYYY年MM月DD日}`。

### 短码规则

- 2–32 个字符，不含空白，区分大小写，不可重复。
- 任何短码都不能是另一个短码的开头（否则较长的永远无法触发），保存时会提示。
- 短码前一个字符若是英文字母、数字或下划线则不展开（避免 `abc;thx`、URL 路径误触发）；行首、空白、标点、中文之后都可以展开。
- 推荐统一使用 `;` 作为前缀；不建议用 `/`，会与 Slack / Notion / Discord 的斜杠命令冲突。

### 示例

```text
;thx   -> Thanks so much! I really appreciate your help.
;today -> Tuesday, 2026-10-06            ({date:dddd, YYYY-MM-DD})
;tr    -> Translate the following text into {input:Target language}. ...{cursor}
```

输入 `;tr` 会弹出浮层，填写“Target language”后按 Enter，提示词被插入，光标停在 `{cursor}` 处。浮层中 Tab 切换字段，Enter 提交，Esc 取消（短码保留在输入框中）。

### 导入 / 导出格式

```json
{
  "format": "typebolt",
  "version": 1,
  "exportedAt": "2026-10-06T08:00:00.000Z",
  "snippets": [{ "name": "Thanks", "shortcut": ";thx", "content": "Thanks!" }]
}
```

导入时与现有片段合并：短码冲突、内容为空等条目被跳过并显示原因；非法文件整体拒绝，不会修改现有数据。可以直接分享这种 JSON 作为“短语包”。

## 已知限制

- **Google Docs / Sheets**（canvas 编辑器）不支持。
- `type=email` / `type=number` 输入框不展开（浏览器不允许读取其光标位置）；`type=password` 永不展开。
- **closed shadow root** 内的输入框不支持（只支持 open shadow root）。
- 页面若在**捕获阶段**拦截键盘事件并 `stopPropagation`，扩展可能收不到事件；框架编辑器在 `beforeinput` 里自行改 DOM 时依赖 `keyup` 兜底。
- 粘贴、拖放的文本不会触发展开。
- **富文本编辑器（Lexical / Slate / Draft.js / ProseMirror / Quill 等，如 WhatsApp Web、Discord、X、ChatGPT、Claude、Gemini）**：展开是在你按键之后异步完成的（先让页面编辑器处理完自己的按键，约几十毫秒），其间若你又按了键（或点击），本次展开会被放弃，保留字面短码和你输入的内容，不会丢字。**多行片段插入 contenteditable 时是以“粘贴事件”的形式交给编辑器的**，因此站点自己的粘贴规则会生效（例如某些 AI 聊天界面会把很长的粘贴内容转成附件）；单行片段通过 `beforeinput` / `execCommand` 插入。
- **撤销（Ctrl+Z）**：在 ProseMirror、Quill、Slate 编辑器里，输入的短码与展开结果会被框架合并成同一个历史步骤，一次 Ctrl+Z 会同时清除两者；这是框架自身的行为，TypeBolt 不做绕过。普通 `<textarea>` / `<input>`、Lexical、Draft.js 里一次 Ctrl+Z 可恢复为短码。
- 不会链式展开：片段内容结尾恰好是另一个短码时，展开结果不会再被展开。
- `contenteditable` 里仅检查光标所在行（遇到 `<br>` 或块级元素边界停止）。
- 弹窗里的“在此站点启用”开关只对 http(s) 页面显示。
- 自动化测试覆盖了绝大部分行为，但真实站点（Gmail、Notion、ChatGPT 等）的兼容性需要人工抽查。

## 隐私

不收集、不上传任何数据；所有片段、设置与统计只保存在本机 `chrome.storage.local`。完整说明见 [docs/PRIVACY.md](docs/PRIVACY.md)。

## 开发、测试与打包

```bash
npm install            # 仅开发依赖：@playwright/test 1.62.1，以及真实编辑器框架与 esbuild（见下）
npm run test:unit      # Node 单元测试（node --test）
npm run test:e2e       # Playwright 端到端（无头 Chromium，加载未打包扩展）
npm test               # 单元 + 端到端
npm run icons          # 用 Playwright 把 icons/icon.svg 渲染为 16/32/48/128 PNG
npm run package        # 生成 dist/typebolt-<version>.zip（manifest.json、_locales/、icons/、src/、LICENSE）
npm run store-assets   # 用真实扩展渲染商店截图、宣传图与商店图标到 dist/store/
```

上架 Chrome 应用商店所需的文案、权限理由与数据披露见 [docs/STORE.md](docs/STORE.md)。

`tests/e2e/real-editors.spec.js` 用真实的编辑器框架（ProseMirror、Lexical、Quill、Draft.js、Slate、React 受控 input / textarea）做回归，断言读取的是编辑器自己的数据模型而不只是 DOM。这些夹具的源码在 `tests/fixtures/editors-src/`，由 esbuild 在 E2E 启动前（`globalSetup`）打包到 `tests/fixtures/dist/`（已 gitignore）。Draft.js 要求 React ≤ 18，所以第二个页面用别名的 React 18；仓库里的 `.npmrc` 设置了 `legacy-peer-deps=true` 来容忍这些对等依赖冲突。

E2E 依赖 Playwright 的 Chromium 构建（1.62.1 对应 chromium 1234）；本机已缓存时无需额外下载，否则运行 `npx playwright install chromium`。

项目结构与验收标准见 [docs/SPEC.md](docs/SPEC.md)，与规格的差异见 [docs/DECISIONS.md](docs/DECISIONS.md)。

## 商业化路线（本期未实现）

免费版：本地无限片段。规划中的 Pro：云同步、团队共享库、高级表单（下拉 / 日期运算）、使用统计导出。

## 许可证

[GNU AGPL-3.0-or-later](LICENSE)。打包产物（`dist/typebolt-<version>.zip`）同样附带 `LICENSE`。
