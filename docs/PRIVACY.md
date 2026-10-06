# TypeBolt 隐私政策 / Privacy Policy

最后更新 / Last updated: 2026-10-06

## 中文

**TypeBolt 不收集、不传输、不出售任何用户数据。**

### 我们保存什么

TypeBolt 只在你的浏览器本地（`chrome.storage.local`）保存以下内容，它们从不离开你的设备：

- 你创建的文本片段（名称、短码、内容）；
- 设置（全局开关、禁用站点列表）；
- 使用统计（每个片段的使用次数、节省字符数、总计）；
- 安装时间与数据版本号。

### 我们不做什么

- 不向任何服务器发送网络请求；扩展不包含任何分析、统计、广告或追踪代码。
- 不读取、不记录、不上传你在网页中输入的内容。扩展只在你输入的内容恰好以某个短码结尾时，在本地完成替换；不匹配的输入不会被保存。
- 不展开或读取密码输入框（`type=password`）。
- 不加载或执行远程代码。

### 权限说明

| 权限 | 用途 |
| --- | --- |
| `storage` | 在本地保存片段、设置与统计 |
| `scripting` | 安装或更新扩展后，把内容脚本注入到已经打开的标签页，使其无需刷新即可使用 |
| `activeTab` | 在弹窗中读取当前标签页的网址主机名，用于“在此站点启用/禁用”开关 |
| 主机权限 `<all_urls>` | 内容脚本需要在你输入文字的任意网页中运行，才能识别短码并展开；它与内容脚本的匹配范围一致 |

### 导出与分享

“导出 JSON”会把你的片段写入你选择的本地文件。如何分享该文件由你决定，TypeBolt 不会上传它。

### 联系方式

如有疑问，请通过本扩展的商店页面或项目仓库的 Issue 联系我们。

## English

**TypeBolt does not collect, transmit or sell any user data.**

### What is stored

Everything is kept locally in your browser (`chrome.storage.local`) and never leaves your device: the snippets you create (name, shortcut, content), settings (global switch, disabled sites), usage statistics (per-snippet use counts and characters saved, plus totals), and the install time and data schema version.

### What TypeBolt does not do

- It makes no network requests. There is no analytics, advertising or tracking code.
- It does not read, log or upload what you type on web pages. Text is only replaced locally when it ends with one of your shortcuts; non-matching input is never stored.
- It never expands or reads password fields.
- It does not load or execute remote code.

### Permissions

- `storage`: save snippets, settings and statistics locally.
- `scripting`: after install or update, inject the content script into tabs that are already open so they work without a reload.
- `activeTab`: read the hostname of the current tab in the popup for the per-site switch.
- Host permission `<all_urls>`: the content script must run on any page where you type in order to recognise shortcuts; this matches the content script's match pattern.

### Export and sharing

"Export JSON" writes your snippets to a local file you choose. Whether and how you share it is up to you; TypeBolt never uploads it.

### Contact

Please reach out via the extension's store listing or the project repository's issue tracker.
