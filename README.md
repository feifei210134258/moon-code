# Moon Code

Moon Code 是 **Kimi Code CLI 的桌面 GUI 版本**——以 Kimi Code CLI 为唯一 Agent 内核的本地桌面客户端。

“Codex 风格”只描述 UI、任务工作台和桌宠交互；项目不使用 Codex 协议。Moon Code 启动用户已安装的 `kimi` CLI，通过官方 `kimi web` REST/WebSocket 使用 Agent 能力；在需要时也可以启动经过兼容验证的托管 Kimi Code 运行时。Kimi Workspace、Session 和 Transcript 始终是唯一事实源。

## 核心卖点

- **项目文件树可视。** 目录浏览、文本预览、Git 状态和单文件按需 Diff 都内嵌在同一窗口，Agent 改了哪些文件、改成什么样一眼可查，不用在终端、编辑器和文件管理器之间来回切换。
- **内置开发浏览器，批注即改。** 隔离浏览器支持 localhost 预览、Console/Network、多视口和整页截图；可以直接框选页面元素或区域写批注，作为 Prompt 附件发回 Agent，形成"看页面 → 批注 → 改代码"的闭环。
- **子 Agent 跑第三方便宜模型。** 主会话保持 Kimi 官方模型的质量，高 token 消耗的子 Agent 任务可绑定内置供应商目录中的任意 OpenAI 兼容模型（如 DeepSeek V4 Flash），极大降低整体 token 成本。
- **套餐用量可视化。** 套餐窗口、Extra Usage、Session token 和 Context 使用率准实时展示，支持 50%/80%/95% 阈值与系统通知，额度消耗不再靠猜。
- **桌面宠物盯梢多 Session。** 桌宠置顶聚合运行中、待处理、完成、失败状态并提示未读，点击直接跳回对应会话，多任务并行不再靠记忆。
- **多 Session 编码工作台。** 左侧按 Workspace 组织真实 Session，Prompt Queue、Steer/Abort 实时干预与内嵌 xterm 多标签 Terminal 同屏完成，长任务不阻塞。

## 为什么选择 Kimi Code CLI 内核

Moon Code 不重新实现一个 Agent，也不把对话复制进另一套本地数据库，而是把 Kimi Code CLI 的官方运行时能力带到更适合桌面开发的工作台中：

- **官方语义保持一致。** Prompt、Steer、Abort、Approval、Question、Tool、Session 和 Transcript 都直接走 Kimi 的官方接口，升级时可以用契约测试发现兼容性变化。
- **可渐进使用。** 默认优先连接本机已有的 Kimi Code CLI；没有合适的系统版本时，可切换到固定版本的托管运行时，不需要另起一套 Agent 服务。
- **更少的数据分叉。** Workspace、Session、消息和运行状态来自 Kimi 本身，Moon Code 只负责投影、缓存和交互，不会偷偷修改用户的 Kimi 配置、凭据或 Session 文件。
- **桌面级安全边界。** bearer token 只留在 Electron Main 进程，Renderer 通过 typed IPC 访问去敏状态；浏览器预览、文件操作和终端也有独立的权限边界。

## 针对 Kimi Web 的桌面化改造

Kimi Web 的 Agent 能力很强，但长时间开发、多 Session 并行和本地代码反馈仍然需要更紧凑的工作流。Moon Code 围绕这些使用痛点做了增量改造，同时保留 Kimi CLI 的官方内核：

- **多 Session 不再藏在浏览器标签页里。** 左侧按 Workspace 组织真实 Session，桌面宠物聚合运行中、等待处理、完成和失败状态，点击即可回到准确会话。
- **从“聊天”扩展到完整编码工作台。** Files、Changes、按需 Diff、Session Terminal、Git 状态、Prompt Queue 和 Steer/Abort 都在同一窗口内，减少在终端、网页和文件管理器之间来回切换。
- **把网页调试反馈接回 Agent。** 内置隔离开发浏览器，支持 localhost 预览、Console/Network、视口和截图；可以直接对页面元素或区域批注，并作为普通 Prompt 附件发送给 Kimi。
- **长连接更可靠。** 通过 snapshot seed、cursor gap/epoch、增量 offset 和自动 resync 处理断线与乱序，流式文本、Thinking、Tool call 和 Tool result 会保持同一 Turn 的顺序。
- **把高级能力显式化。** Skills、MCP、Tools、Subagent roster、用量窗口、Context 使用率和阈值通知都成为可见的产品界面，而不是隐藏在日志或网页状态里。
- **子 Agent 可以跑在更便宜的第三方模型上。** 主会话保持 Kimi 官方模型的质量，把探索、整理这类高 token 消耗的子 Agent 任务绑定到内置供应商目录中的任意 OpenAI 兼容模型（例如 DeepSeek V4 Flash），能极大降低整体 token 成本；在设置页从模型目录直接选择即可，无需手写配置。

这些改造的核心取舍是：让 Moon Code 负责桌面交互、状态投影和安全边界，让 Kimi Code CLI 继续负责 Agent 推理、工具执行和会话事实。这样既能获得原生桌面体验，也能最大限度跟随 Kimi 官方能力演进。

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
- 设置页已使用真实 Kimi Model/Provider/Auth/Config：支持默认模型、目录刷新、Provider 添加/编辑/删除、Kimi device-code 登录/登出及常用全局设置。Provider 编辑和删除仅在当前 Runtime 的 OpenAPI 声明官方路由时开放；客户端仍不会绕过 Kimi 修改配置文件。子 Agent 模型可从任意已连接 Provider 的模型目录中选择。
- Skills 已接入 Session/Workspace 目录和 Composer `/` 激活；设置页展示 Kimi 的有效 Tools、MCP Server 状态并通过官方 route 重连。Subagent roster 从 snapshot 与 lifecycle event 恢复状态、输出和 token usage，不混入 main Transcript，详见 [ADR 0006](./docs/adr/0006-kimi-skills-mcp-agent-projection.md)。
- Browser 已接入 Main 管理的隔离 WebContentsView：HTML 文件通过受限发布根的 loopback Workspace Preview 打开，192-bit capability 只由 Main 注入请求头、不会进入页面 URL；同时支持地址栏、前进后退、刷新停止、localhost discovery、常用/自定义视口、Console、Network 安全预览和视口/整页截图，详见 [ADR 0007](./docs/adr/0007-browser-webcontentsview-preview-boundary.md)。
- Usage 已使用官方 `/oauth/usage` 实现 Main single-flight 准实时轮询：顶部与 `⌘⇧U` 弹层分区展示套餐窗口、Extra Usage、Session token 和 Context；支持 30/60 秒调度、焦点/网络/Prompt 结束即时刷新、失败保留与退避，设置页可调整 50%/80%/95% 阈值和系统通知，详见 [ADR 0008](./docs/adr/0008-usage-authority-polling-boundary.md)。
- Pet 已接入独立多 Session REST/WS 状态服务、透明置顶窗口、Waiting/Failed 优先级、完成与未读转换、最多 5 个及 `+N` 折叠提示、拖拽吸边和点击回到准确 Session。Pet 使用独立最小 preload，不能直接审批或调用主窗口能力，详见 [ADR 0009](./docs/adr/0009-pet-multi-session-window-boundary.md)。当前角色仍是 Spike 占位美术，正式动画 atlas 尚待接入。
- 当前有 293 个可运行的单元/组件用例与两项 opt-in 真实 Kimi Runtime 集成测试覆盖主链路；生产构建以及 arm64 `.app` 内的 native PTY/Browser/Pet smoke 均纳入门禁。未签名的 DMG 已可构建；签名、公证与公开下载仍属于公开 Beta 发布阶段。

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

项目自身采用 [MIT License](./LICENSE)。`@moonshot-ai/kimi-code` 及其他依赖的许可证和归属信息见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。项目不代表 Moonshot AI，也不包含用户的 Kimi 凭据、Session 数据或本地应用状态。
