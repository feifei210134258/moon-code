# ADR-0007：开发浏览器使用 WebContentsView 与能力化 Workspace Preview

> 状态：Accepted
> 日期：2026-07-23
> 适用范围：Browser / HTML 路由首个垂直切片

## 背景

客户端需要在不改变 Kimi Agent 协议的前提下提供内置开发浏览器：HTML 文件一键预览、localhost 导航、常用视口、Console、Network 和截图。HTML 与外部页面都是不可信内容，不能与主 Renderer、Kimi token 或本地文件能力共享执行上下文。

## 决策

### Guest 隔离

- 页面由 Main 管理的 Electron `WebContentsView` 承载，不启用 `<webview>`。
- Guest 使用按 Workspace ID 哈希得到的持久 partition；`sandbox=true`、`contextIsolation=true`、`nodeIntegration=false`、`webSecurity=true`。
- Guest 不配置 preload，permission request/check 全部默认拒绝；popup、download、webview attach、主框架/子框架非 HTTP(S) 导航默认阻止。
- Renderer 只发送具名 Browser intent 和显示区域 bounds，不获得 Guest `webContents`、Cookie、CDP 对象或 Preview capability。
- 右栏折叠、切换标签和打开 Settings 只 detach View，不销毁页面；返回 Browser 后恢复同一页面。
- 当前 Workspace 由独立 typed intent 投影给 Main；切换 Workspace 会销毁旧 Guest 并使用对应 partition 重建，初始手动导航也不跨 Workspace 共享 Cookie/Storage。关闭主窗口会销毁 Guest，避免不可见页面继续运行；只有面板级折叠允许后台保留。

### Workspace Preview

- HTML 不使用 `file://`。Main 在 `127.0.0.1:0` 启动进程内 Preview Server。
- 每次进程生成 192-bit capability，但 capability 不进入页面 URL；页面只访问 `<发布目录 hash>.localhost`，使 `/assets/...` 等绝对静态资源保持同源，同时页面 JavaScript 无法从 `location` 读取秘密。
- Main 在 Guest session 的 `webRequest` 层只为已注册 Preview URL 注入 capability header；HTTP 请求必须来自 loopback，并同时命中 header capability、监听端口和已注册发布 root。页面设置同名伪造 header 时会被 Main 覆盖，切换/销毁 Guest 时移除精确 handler。
- Renderer 地址栏只看到 `preview://<workspace-id>/...`；统一 Preview URL sanitizer 仍覆盖标题、Console 文本/来源、Network URL/header/body、MIME、错误和 Promise rejection，capability header 在 Network DTO 中固定显示为 `[redacted]`。
- Preview 只发布 HTML 所在目录，或最近的 `dist/build/out/public/site/www` 构建根；不会把整个 Workspace 自动暴露为静态站点。发布目录内仍使用静态 Web 扩展名 allowlist，并拒绝 dotfile、密钥扩展名和 credential/secret 类路径。
- 请求路径先进行相对路径验证，再对发布 root 和目标执行 `realpath`；文件以 `O_NOFOLLOW` 打开并在 open 后校验 file descriptor 与 canonical path 的设备/inode 一致性，再从该 descriptor 流式读取。symlink escape、并发换链不一致、traversal、NUL、目录列表和非 GET/HEAD 请求均被拒绝。

### Diagnostics 与截图

- Main 通过 `webContents.debugger` 使用 CDP `Network`、`Page` 与 `Emulation`；诊断状态先投影为有界 DTO，再通过 typed IPC 给 Renderer。
- Console 与 Network 各保留最多 300 条；单段文本最多 4,000 字符。
- URL query、Authorization、Cookie、API key、token 和常见 secret 形式在 Main 中脱敏。
- Response body 仅对小于 256 KiB 的文本类型按需读取；二进制、base64 和大正文不进入 Renderer。
- 截图限制为 20M effective pixels / 20 MiB base64；视口和整页截图都在捕获前读取 layout metrics，并将 device scale factor 的平方计入预算后拒绝超限页面。

### Localhost

- 地址栏允许用户手动输入 HTTP(S) URL。
- 自动发现只探测固定的常见开发端口和 `127.0.0.1`，单端口超时 600 ms；不接受 Renderer 指定任意扫描目标。
- 首版 Browser 是用户操作工具，不允许 Kimi Agent 无提示点击、输入或复用登录态。

## 后果

- Browser Cookie/Storage 与主 Renderer、Kimi Runtime 隔离，且可按 Workspace 延续开发登录态。
- 折叠右栏不会丢失页面状态，但关闭主窗口或切换 Workspace partition 会重建 Guest。
- Console/Network 是安全预览，不是完整 DevTools 数据镜像；超限正文明确降级。
- HTML 精确 DOM 批注仍属于后续 Annotation 切片；本 ADR 已保留隔离 world 与截图基础，但不提前赋予 Agent Browser 权限。

## 验证

- 单元测试覆盖 URL/bounds/viewport/request-id 输入、Preview traversal/symlink/capability、localhost discovery、HTML 路由和 Renderer Browser intent。
- packaged Browser smoke 验证：Guest 无 Node globals、popup 被拒绝、静态绝对资源、Console/Network、secret 脱敏、页面主动回显 `location.href`/hostname 仍看不到 capability、Main 注入的 capability header 在详情中保持 `[redacted]`、小正文预览、视口模拟、截图以及 `file://` 拒绝。
