# ADR-0002：使用 Electron + Vue 3 构建桌面客户端

## 状态

Accepted（待 Spike D 验证 Browser/CDP/批注）

## 背景

原始候选是 Tauri 2 + Vue 3，主要优势是体积和资源占用。需求确认后，首版还必须提供：

- 类 Codex 的透明置顶桌宠和多窗口 Session 跳转。
- 内置开发浏览器、Console、Network、设备视口和截图。
- 尽量支持在 HTML 画面上选元素/区域、批注并发送给 Kimi。
- 客户端托管 Kimi Node 运行时。

这些能力使浏览器内核、调试协议和多 WebContents 隔离成为决定性因素。

## 决策

- 使用 Electron + TypeScript 作为桌面壳。
- 使用 Vue 3 延续 Kimi 官方 Web 生态并降低 adapter/UI 迁移成本。
- 页面预览使用 `WebContentsView`；不使用 `<webview>` tag。
- Console/Network 使用 `webContents.debugger`/CDP，完整 DevTools 作为高级互斥入口。
- 桌宠使用透明 frameless `BrowserWindow`。
- Kimi 连接放在 Main 或 Utility Process，Renderer 不持有 bearer token。

## 结果

### 正面

- Chromium/CDP 提供开发浏览器所需的 Network、Runtime、Page 和截图能力。
- 多窗口、透明窗口、托盘、自动更新、签名发行生态成熟。
- Kimi 官方 Web 是 Vue，可复用类型、渲染逻辑和组件经验。
- Electron 自带 Node 生态，方便管理 Kimi sidecar 和本地预览服务。

### 负面

- 安装体积和基础内存高于 Tauri。
- Browser guest、Renderer、Main、Utility Process 的安全边界必须严格设计。
- macOS/Windows/Linux 打包仍有平台差异。
- CDP debugger 与完整 DevTools 可能存在占用冲突，需要产品上明确互斥。

### 中性

- 首发仍只承诺 macOS；Electron 只是为未来跨平台保留路径。
- Vue 是 UI 选择，不影响 Kimi 协议。

## 备选方案

### Tauri 2 + Vue 3

体积更小，普通 Kimi Web 壳完全可行。但 macOS 使用 WKWebView，开发浏览器的统一 Network/Console/CDP、页面注释和发布版 DevTools 会产生更多平台特化。若未来取消开发浏览器，可重新评估。

### Electron + React

竞品和生态很多，但 Kimi 官方 Web 已是 Vue 3，切 React 会增加重写成本而没有关键产品收益。

### 原生 SwiftUI + WKWebView

macOS 体验和资源占用优秀，但 Kimi Web 完整功能迁移、Markdown/Terminal/Diff 生态和未来跨平台成本过高。

## 参考

- [Electron WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view)
- [Electron Debugger](https://www.electronjs.org/docs/latest/api/debugger)
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Tauri Webview API](https://v2.tauri.app/reference/javascript/api/namespacewebview/)
