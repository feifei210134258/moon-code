# Moon Code

Moon Code 是一个以 Kimi Code 为唯一 Agent 内核的本地桌面客户端。

“Codex 风格”只描述 UI、任务工作台和桌宠交互；项目不使用 Codex 协议。主接入计划使用 Kimi Code 官方 `kimi web` REST/WebSocket，并保持 Kimi Workspace、Session 和 Transcript 为唯一事实源。

## 当前状态

P0 功能已基本完成：主工作台、Electron + Vue 工程、托管 Kimi 运行时、typed IPC，以及 Kimi Code `0.29.0` REST/WebSocket 契约适配层均已落地。当前可作为未签名的 macOS 本地工具使用；正式公开分发前仍需签名、公证及耐久性验证。

已确认的首版方向：

- macOS 首发，Electron + Vue 3。
- 完整覆盖 Kimi Code Web 的用户功能。
- 内置开发浏览器，并验证 HTML 画面批注能力。
- 类 Codex 桌面宠物，用于多 Session 状态和跳转。
- 使用官方接口监控 Kimi 套餐及 Extra Usage。

当前可运行能力：

- 从真实 Electron UI 启停托管 `Kimi Code 0.29.0`。
- 从官方数据源读取 Workspace/Session 并按项目显示在左栏。
- 选择 Session 后执行 `snapshot → seed projector → WebSocket subscribe`，中栏显示官方 Transcript；切换 Session 会回到对应会话。
- 契约快照、REST envelope、WebSocket hello/ack、cursor gap/epoch、volatile delta offset 与 snapshot resync 已有自动化测试。
- Prompt/Steer/Abort 的 REST、IPC 与 Composer 链路已实现；用户消息只在 Kimi 接受后进入 Transcript，queued 状态保持官方语义。
- Approval/Question 可从 snapshot 和实时事件恢复，并通过中栏卡片完成一次授权、会话授权、拒绝、单选、多选、其他答案与放弃；输入边界和 wire shape 已有自动化测试。
- Thinking、Tool call、raw/durable progress、Tool result、step retry 与历史 Tool 合并已进入同一顺序化 Turn 视图；详情可以展开查看，流式进度不会打乱 `text → tool → text` 顺序。
- Files/Changes/Diff 已接入官方 Session FS action：目录浏览、文本预览、Git 状态与单文件按需 Diff 均通过 typed IPC，二进制和大文件在 Renderer 前安全降级。
- Session Terminal 已提供 xterm、多标签、创建/关闭、ANSI 输入输出、Resize、replay、Session 切换 Detach、`⌘J` 与 Composer 入口。Kimi 0.29.0 v2 的上游 Terminal WS 缺口由 [ADR 0004](./docs/adr/0004-kimi-v2-terminal-compatibility.md) 的限域兼容层处理，PTY 不参与 Agent 协议。
- 设置页已使用真实 Kimi Model/Provider/Auth/Config：支持默认模型、目录刷新、Provider 添加、Kimi device-code 登录/登出及常用全局设置。锁定版 v2 缺少安全 Provider 删除路由，当前明确提示而不绕过 Kimi 改配置文件，详见 [ADR 0005](./docs/adr/0005-kimi-v2-provider-mutation-boundary.md)。
- Skills 已接入 Session/Workspace 目录和 Composer `/` 激活；设置页展示 Kimi 的有效 Tools、MCP Server 状态并通过官方 route 重连。Subagent roster 从 snapshot 与 lifecycle event 恢复状态、输出和 token usage，不混入 main Transcript，详见 [ADR 0006](./docs/adr/0006-kimi-skills-mcp-agent-projection.md)。
- Browser 已接入 Main 管理的隔离 WebContentsView：HTML 文件通过受限发布根的 loopback Workspace Preview 打开，192-bit capability 只由 Main 注入请求头、不会进入页面 URL；同时支持地址栏、前进后退、刷新停止、localhost discovery、常用/自定义视口、Console、Network 安全预览和视口/整页截图，详见 [ADR 0007](./docs/adr/0007-browser-webcontentsview-preview-boundary.md)。
- Usage 已使用官方 `/oauth/usage` 实现 Main single-flight 准实时轮询：顶部与 `⌘⇧U` 弹层分区展示套餐窗口、Extra Usage、Session token 和 Context；支持 30/60 秒调度、焦点/网络/Prompt 结束即时刷新、失败保留与退避，设置页可调整 50%/80%/95% 阈值和系统通知，详见 [ADR 0008](./docs/adr/0008-usage-authority-polling-boundary.md)。
- Pet 已接入独立多 Session REST/WS 状态服务、透明置顶窗口、Waiting/Failed 优先级、完成与未读转换、最多 5 个及 `+N` 折叠提示、拖拽吸边和点击回到准确 Session。Pet 使用独立最小 preload，不能直接审批或调用主窗口能力，详见 [ADR 0009](./docs/adr/0009-pet-multi-session-window-boundary.md)。当前角色仍是 Spike 占位美术，正式动画 atlas 尚待接入。
- 当前有 293 个可运行的单元/组件用例与两项 opt-in 真实 Kimi Runtime 集成测试覆盖主链路；生产构建以及 arm64 `.app` 内的 native PTY/Browser/Pet smoke 均纳入门禁。未签名的 DMG/ZIP 已可构建；签名、公证与发布安装包仍属于公开 Beta 发布阶段。

## 最小运行与未签名分发

源码运行、打包命令、首次打开未签名应用以及验证步骤见 [最小运行与分发说明](./docs/08-minimum-run-and-distribution.md)。

## 文档

完整调研、产品需求、功能对照、UX、技术架构和 Spike 计划见 [docs/README.md](./docs/README.md)。

## 仓库约定

- `main` 保存可复现的基线。
- 功能和技术验证使用短生命周期分支，例如 `spike/runtime`、`spike/kimi-adapter`、`spike/browser`、`feat/pet`。
- 不提交 `.kimi/`、bearer token、OAuth credentials、`.env` 或本地应用状态。
- 不直接修改或复制用户的 Kimi 配置、凭据与 Session 数据。

## License

项目自身的发行 License 尚未决定。未来如分发 Kimi Code 运行时或同步其源码，需要保留对应的 MIT License 和 NOTICE。
