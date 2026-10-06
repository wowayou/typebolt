# Chrome 应用商店上架资料

开发者后台（Developer Dashboard）各个标签页逐项要填的内容都在这里，可以直接复制粘贴。名称和简介（summary）取自 `_locales/*/messages.json`，在后台改不了，要改就改代码再重新打包。

## 1. 只能由你完成的准备

- 在 [开发者后台](https://chrome.google.com/webstore/devconsole) 注册开发者账号：一次性注册费 5 美元，Google 账号必须开启两步验证。账号创建后不能更换邮箱，官方建议使用专门用于发布的邮箱。
- **交易者 / 非交易者声明（Trader / Non-trader）**：欧盟法规要求所有开发者自行声明。出于经营目的发布（例如计划做付费版）属于交易者，此时需要验证并向欧盟用户公开联系方式；纯个人、非经营目的则是非交易者。这项声明由你决定并承担责任，详见 [官方说明](https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure)。
- 在账号设置里填写发布者显示名称（Publisher name）。

## 2. 上传包（Package）

```bash
npm run package        # → dist/typebolt-<version>.zip
```

上传 `dist/typebolt-<version>.zip`。打包脚本会检查 manifest 引用的文件都在包内；单元测试会检查各语言的名称不超过 75 个字符、简介不超过 132 个字符。

## 3. 商店信息（Store listing）

默认语言是 English（manifest 的 `default_locale` 为 `en`）。再添加“中文（简体）”，单独填写中文的描述和截图。

| 字段 | 内容 |
| --- | --- |
| 类别（Category） | Productivity → Workflow & Planning（备选：Tools） |
| 语言（Language） | English；另加 中文（简体） |
| 官方网址 / 主页（Homepage URL） | `https://github.com/wowayou/typebolt` |
| 支持网址（Support URL） | `https://github.com/wowayou/typebolt/issues` |
| 成人内容（Mature content） | 否 |

### 图片

运行 `npm run store-assets` 会在 `dist/store/` 下生成全部图片（需要已安装 Playwright 的 Chromium）。截图中的展开效果和填空浮层由扩展真实运行产生；统计数字是演示数据。

| 后台字段 | 文件 | 规格 |
| --- | --- | --- |
| 商店图标（Store icon） | `store-icon-128.png` | 128×128：96×96 图案加 16px 透明边距 |
| 截图（Screenshots，按语言分别上传） | `en/screenshot-1…5-*.png`、`zh_CN/screenshot-1…5-*.png` | 1280×800，24 位 PNG |
| 小宣传图（Small promo tile，必填） | `en/promo-small-440x280.png` 或 `zh_CN/…` 二选一 | 440×280 |
| 横幅宣传图（Marquee promo tile，可选） | `en/promo-marquee-1400x560.png` 或 `zh_CN/…` 二选一 | 1400×560 |

两张宣传图不支持按语言分别上传，每张只能传一份；默认语言是英文，所以建议用 `en/` 下的版本。

### 详细描述（English）

```text
TypeBolt turns short codes into full text in any text box on the web. Type ;thx and it becomes "Thanks so much! I really appreciate your help." The same mechanism doubles as an AI prompt library: type ;tr in an AI chat, fill in the target language, and the complete translation prompt is inserted.

WHAT YOU CAN DO
• Expand snippets in text inputs, textareas and rich-text (contenteditable) editors, including same-origin iframes and open shadow DOM.
• Use placeholders: {cursor} sets where the caret lands; {date} and {time} support custom formats such as {date:YYYY-MM-DD}; {input:Label} opens a small fill-in form before inserting.
• Manage snippets on a dedicated page with live preview, validation and search.
• Import and export snippets as JSON to back them up or share snippet packs.
• Search and copy snippets from the toolbar popup (Ctrl+Shift+. on Windows/Linux, Command+Shift+. on macOS).
• Turn TypeBolt off globally or for specific sites.
• See how many expansions you have done and how much typing you have saved.
• Get started with a sample pack of everyday replies, date/time snippets and AI prompt templates, in English or Chinese depending on your browser language.

PRIVATE BY DESIGN
• 100% local: snippets, settings and statistics are stored only in your browser.
• No account, no analytics, no network requests, no remote code.
• Password fields are never read or expanded.
• Open source under AGPL-3.0: https://github.com/wowayou/typebolt

IME-FRIENDLY
TypeBolt waits until input-method (IME) composition is committed before it looks for a shortcut, so typing Chinese, Japanese or Korean never triggers an expansion halfway through a word.

KNOWN LIMITATIONS
• Google Docs and Google Sheets are not supported.
• Email and number inputs, and fields inside closed shadow roots, are not supported.
• Pasted or dropped text does not trigger an expansion.
```

### 详细描述（中文）

```text
TypeBolt 闪打：在网页的任意输入框里输入短码，立刻展开成预设文本。输入 ;xiexie，就变成“非常感谢！谢谢你的帮助。”同一套机制也是 AI 提示词库：在 AI 聊天框输入 ;fy，填好目标语言，整段翻译提示词就自动插入。

主要功能
• 支持普通输入框、多行文本框和富文本（contenteditable）编辑器，也支持同源 iframe 与 open shadow DOM 中的输入框。
• 占位符：{cursor} 指定展开后光标的位置；{date}、{time} 支持自定义格式，如 {date:YYYY年MM月DD日}；{input:标签} 会先弹出填空表单再插入。
• 独立的管理页：实时预览、保存前校验、搜索。
• 以 JSON 导入 / 导出片段，方便备份或分享“短语包”。
• 工具栏弹窗中搜索并复制片段（Windows/Linux：Ctrl+Shift+.，macOS：Command+Shift+.）。
• 可以全局关闭，也可以只对某些网站关闭。
• 使用统计：展开次数、节省的字符数与估算节省的时间。
• 首次安装自动写入示例片段包（日常回复、日期时间、AI 提示词模板），按浏览器语言提供中文或英文。

隐私优先
• 完全本地：片段、设置与统计只保存在你的浏览器里。
• 无需账号，没有统计代码，不发送任何网络请求，不加载远程代码。
• 永不读取或展开密码输入框。
• 基于 AGPL-3.0 开源：https://github.com/wowayou/typebolt

中文输入法友好
输入法组合过程中不会误触发，文字上屏后才检查短码。

已知限制
• 不支持 Google 文档 / Google 表格。
• 不支持 email、number 类型的输入框，以及 closed shadow root 内的输入框。
• 粘贴或拖放的文字不会触发展开。
```

## 4. 隐私权（Privacy practices）

审核人员通常使用英文，以下字段建议填英文。

**单一用途（Single purpose）**

```text
TypeBolt expands short text shortcuts that the user defines (for example ";thx") into longer saved text, including AI prompt templates, inside editable fields on web pages.
```

**权限理由（Permission justification）**

`storage`

```text
Stores the user's snippets, settings (global on/off switch and disabled sites) and usage statistics locally in chrome.storage.local. Nothing is synced or sent anywhere.
```

`scripting`

```text
Used only right after the extension is installed or updated, to inject TypeBolt's own bundled content-script files into tabs that are already open, so shortcuts work there without reloading the page. No remote or dynamically generated code is injected.
```

主机权限（Host permission，`<all_urls>`）

```text
Text expansion must work in whatever text field the user is typing in, on any website, so the content script runs on all pages. It only reacts to keyboard and input events in editable fields and reads at most a few characters before the caret to detect a shortcut; that text is never stored or transmitted. The same permission is required for the install/update injection described above and lets the popup read the current tab's hostname for the per-site on/off switch. Users can turn TypeBolt off for any site.
```

**远程代码（Remote code）**：选择 “No, I am not using remote code”。所有 JavaScript 都打包在扩展内，没有 `eval` / `new Function`，也不加载远程脚本（单元测试中有源码扫描）。

**数据使用（Data usage）**：商店规定，即使数据只在本地处理、从不上传，也必须披露（[用户数据 FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) 第 3 条）。建议勾选：

| 类别 | 勾选 | 依据 |
| --- | --- | --- |
| Website content | ✅ | 读取可编辑区域中光标前最多“最长短码长度 + 2”个字符，用于识别短码，并插入片段文本 |
| User activity | ✅ | 在可编辑区域监听键盘与输入事件来识别短码；不记录按键 |
| Personally identifiable information | ❌ | 不处理 |
| Health information | ❌ | 不处理 |
| Financial and payment information | ❌ | 不处理 |
| Authentication information | ❌ | 密码框被排除，永不读取 |
| Personal communications | ❌（边界项，见下） | 不读取、不保存消息内容；只在光标前查看几个字符 |
| Location | ❌ | 不处理 |
| Web history | ❌ | 只把当前页面的主机名与禁用列表在本地比对，不记录浏览历史 |

> 边界项：在邮件或聊天输入框中，被检查的那几个字符在技术上属于通信内容的一部分。目前按“Website content”披露，并在隐私政策中写明。如果审核方要求，再加勾“Personal communications”即可，代码不用改。

三项声明全部勾选：不出售或转让给第三方；不用于与单一用途无关的目的；不用于评估信用或贷款资格。这三项与 `docs/PRIVACY.md` 的内容一致。

**隐私政策网址（Privacy policy URL）**

```text
https://github.com/wowayou/typebolt/blob/main/docs/PRIVACY.md
```

## 5. 分发（Distribution）

- 付款：免费。
- 公开范围：公开（Public）。如果想先小范围试用，可以选“不公开（Unlisted）”，只有拿到链接的人能安装。
- 地区：所有地区。

## 6. 审核注意事项

- `<all_urls>` 主机权限加上在所有网站运行的内容脚本，会触发更深入的人工审核，耗时可能比普通扩展长。权限理由要写清楚，这一点上面已经覆盖。
- 商店信息、隐私政策、权限理由、数据披露四处的说法必须一致。改其中任何一处时，都要同步检查另外三处。
- 每次提交新版本都要先提高 `manifest.json` 的 `version`（同时改 `package.json`），再运行 `npm run package`。
