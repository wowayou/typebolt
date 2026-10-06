# TypeBolt 隐私政策 / Privacy Policy

最后更新 / Last updated: 2026-10-06

## 中文

**TypeBolt 不收集、不传输、不出售任何用户数据。** 下面列出的所有处理都只在你的浏览器本地完成。

### 本地保存的数据

TypeBolt 只在你的浏览器本地（`chrome.storage.local`）保存以下内容，它们从不离开你的设备：

- 你创建的文本片段（名称、短码、内容）；
- 设置（全局开关、禁用站点列表）；
- 使用统计（每个片段的使用次数、节省字符数、总计）；
- 安装时间与数据版本号。

### 在本地处理、但不保存的数据

- **网页输入框中的文字**：你在网页的可编辑区域（`<input>`、`<textarea>`、`contenteditable`）输入时，内容脚本会监听键盘与输入事件，并读取光标前的少量文字（最多为最长短码的长度加 2 个字符），只用于判断它是否以你的某个短码结尾。这些文字不会被保存、记录或发送；不匹配的输入会被直接丢弃。
- **当前网页的主机名**：内容脚本用它判断该站点是否在你的禁用站点列表中；弹窗用当前标签页的主机名显示“在此站点启用”开关。只有当你主动禁用某个站点时，它的主机名才会被保存到禁用列表。
- **填空表单中填写的值**：只用于本次插入，不会被保存。

### 我们不做什么

- 不向任何服务器发送网络请求；扩展不包含任何分析、统计、广告或追踪代码。
- 不出售或转让用户数据给第三方；不把数据用于文本展开以外的任何目的；不用于判断信用或贷款资格。
- 不展开或读取密码输入框（`type=password`）。
- 不加载或执行远程代码。

### 权限说明

| 权限 | 用途 |
| --- | --- |
| `storage` | 在本地保存片段、设置与统计 |
| `scripting` | 安装或更新扩展后，把内容脚本注入到已经打开的标签页，使其无需刷新即可使用 |
| 主机权限 `<all_urls>` | 内容脚本需要在你输入文字的任意网页中运行，才能识别短码并展开（与内容脚本的匹配范围一致）；同一权限也让弹窗能读取当前标签页的主机名，用于“在此站点启用/禁用”开关 |

### 导出与分享

“导出 JSON”会把你的片段写入你选择的本地文件。如何分享该文件由你决定，TypeBolt 不会上传它。

### 删除数据

你可以随时在管理页删除片段。卸载扩展时，Chrome 会删除 TypeBolt 保存在本地的全部数据。

### 联系方式

如有疑问，请在项目仓库提交 Issue：<https://github.com/wowayou/typebolt/issues>

## English

**TypeBolt does not collect, transmit or sell any user data.** All of the handling described below happens locally in your browser.

### What is stored locally

Everything is kept in your browser's local storage (`chrome.storage.local`) and never leaves your device: the snippets you create (name, shortcut, content), settings (global switch, disabled sites), usage statistics (per-snippet use counts and characters saved, plus totals), and the install time and data schema version.

### What is processed locally but not stored

- **Text in editable fields on web pages**: while you type in an editable area (`<input>`, `<textarea>`, `contenteditable`), the content script listens for keyboard and input events and reads a few characters before the caret (at most the length of your longest shortcut plus 2) solely to check whether they end with one of your shortcuts. This text is never stored, logged or sent anywhere; non-matching input is discarded.
- **The current page's hostname**: the content script checks it against your disabled-sites list, and the popup shows it for the per-site switch. A hostname is only saved if you choose to disable that site.
- **Values typed into the fill-in form**: used for that one insertion only and never stored.

### What TypeBolt does not do

- It makes no network requests. There is no analytics, advertising or tracking code.
- It does not sell or transfer user data to third parties, use it for any purpose other than text expansion, or use it to determine creditworthiness or for lending purposes.
- It never expands or reads password fields.
- It does not load or execute remote code.

### Permissions

- `storage`: save snippets, settings and statistics locally.
- `scripting`: after install or update, inject the content script into tabs that are already open so they work without a reload.
- Host permission `<all_urls>`: the content script must run on any page where you type in order to recognise shortcuts (this matches the content script's match pattern); the same permission lets the popup read the current tab's hostname for the per-site switch.

### Export and sharing

"Export JSON" writes your snippets to a local file you choose. Whether and how you share it is up to you; TypeBolt never uploads it.

### Deleting your data

You can delete snippets at any time on the options page. Uninstalling the extension makes Chrome delete all data TypeBolt stored locally.

### Contact

Please open an issue in the project repository: <https://github.com/wowayou/typebolt/issues>
