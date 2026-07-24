# Kimi Web P0 实现审计

更新时间：2026-07-24

本文件是 [Kimi Web 功能对照表](./02-kimi-web-parity.md) 的执行台账。状态只按当前代码和测试证据填写：

- **完成：** 已有真实 Kimi 接口、可见入口和自动化或打包态证据。
- **部分：** 主链路存在，但官方可见操作、完整状态或回归证据尚未齐全。
- **缺失：** 当前没有可用入口或仍是占位。
- **上游阻塞：** 固定 Kimi 版本没有安全接口，客户端不会伪造。

## 1. 已完成核心切片：Session Controls 与生命周期

| 能力 | 状态 | 实现位置 | 证据 |
| --- | --- | --- | --- |
| Session `/status` | 完成 | `KimiRestClient.getSessionStatus`、`KimiSessionBridge.getRuntimeStatus`、`useRuntimeBridge.loadSessionControls` | `KimiRestClient.test.ts`、`kimiSessionBridge.test.ts` |
| Model picker | 完成 | `ComposerBar.vue` 使用真实 `/models` 目录与当前 Session model | `composerSkills.test.ts` |
| Thinking effort | 完成 | 根据选中模型 `support_efforts/default_effort` 动态呈现 | `composerSkills.test.ts`、类型检查 |
| Permission mode | 完成 | `manual/auto/yolo` 独立选择，并在 Main 信任边界验证 | `promptInputs.test.ts` |
| Plan mode | 完成 | 独立 boolean 控制，不并入 Permission | `composerSkills.test.ts` |
| Swarm mode | 完成 | 独立 boolean 控制并随 Prompt 提交 | `composerSkills.test.ts`、`KimiRestClient.test.ts` |
| Prompt 参数映射 | 完成 | 普通文本和浏览器批注均提交 `model/thinking/permission_mode/plan_mode/swarm_mode` | `KimiRestClient.test.ts`、`kimiSessionBridge.test.ts`、`browserBridge.test.ts` |
| 运行中继续发送 | 完成 | Kimi Server active/queued 与可编辑、重排、逐条派发的官方式本地 Draft 队列分层呈现 | `runtimeBridge.test.ts`、`operationalPanels.test.ts`、ADR 0011 |
| Goal 创建与控制 | 完成 | 显式 Goal 模式先写入 Session profile `goal_objective`，再提交首个 Prompt；Strip 提供 pause/resume/cancel | `KimiRestClient.test.ts`、`kimiSessionBridge.test.ts`、`operationalPanels.test.ts` |

这里没有引入 Codex 协议；全部字段均来自 Kimi Code `0.29.0` 官方 Prompt 和 Session Status 契约。

## 2. 系统、认证与同步

| 能力 | 状态 | 当前证据或缺口 |
| --- | --- | --- |
| Health / Meta | 完成 | 托管 Runtime 启动、版本门禁、健康与 Meta 验证 |
| Bearer auth | 完成 | token 仅保留在 Main/adapter；REST 与 WS 测试覆盖 |
| Server auth gate | 部分 | Runtime 鉴权存在，独立受保护实例连接对话框未完成 |
| OAuth 登录/轮询/取消/登出 | 完成 | Settings Bridge、IPC 与设置页真实链路 |
| Auth readiness | 完成 | `/auth` 与 Provider/默认模型提示已接入 |
| WS 断线重连 | 完成 | `KimiWsClient` 与 `SessionSyncController` |
| Snapshot/resync | 完成 | cursor、epoch、gap 后 snapshot 原子重建测试 |
| 多客户端同步 | 部分 | 当前 Session 实时同步完成；Workspace/全局配置事件的 UI 刷新仍需补齐 |
| Graceful shutdown | 完成 | 仅托管 loopback Runtime 调用 shutdown |

## 3. Workspace 与 Session

| 能力 | 状态 | 当前证据或缺口 |
| --- | --- | --- |
| Workspace 列表与分组 | 完成 | 左栏按 Workspace 分组，Kimi 数据为事实源 |
| Session 列表、历史继续对话 | 完成 | 读取 Kimi Session 并直接打开 snapshot/transcript |
| 添加/重命名/移除 Workspace、文件夹选择 | 完成 | 原生文件夹选择、Kimi REST mutation 与左栏操作菜单已接入 |
| Session 搜索、分页、创建 | 完成 | 左栏跨 Workspace 搜索、创建与官方 `before_id` 增量分页 |
| 标题/Profile、Archive/Restore、Fork/Children/Export | 完成 | 重命名、归档/恢复、分叉、按需 Children 层级与官方 ZIP 导出 |
| Session warnings | 完成 | 打开 Session 后读取 `/warnings`，按上游 severity 呈现 |
| Runtime status | 完成 | 本轮真实 Session Controls 切片 |
| Current goal | 完成 | `/goal`、Goal Strip、显式 Goal 模式创建与 pause/resume/cancel 已接入 |

## 4. Prompt、消息与交互

| 能力 | 状态 | 当前证据或缺口 |
| --- | --- | --- |
| Prompt 提交 | 完成 | 普通 Kimi Prompt；所有当前控制字段均透传并验证 |
| Prompt Queue | 完成 | 官方式 Session 本地 Draft 队列支持编辑、移除、重排与逐条派发；`/prompts` 已接收队列独立显示并支持 abort/Steer，见 ADR 0011 |
| Steering | 完成 | 队列面板可将指定 queued Prompt steer 到当前 Turn |
| Abort Prompt/Session | 完成 | 优先 abort active prompt，无 ID 时使用 Session abort |
| 流式 Assistant / Thinking / Tool / Turn | 完成 | WS projector、snapshot 恢复与 Activity UI |
| Approval / Question | 完成 | 独立结构化卡片、resolve/dismiss 与 pending 状态 |
| Attachment / Media | 完成 | 原生多选、Kimi `/files` multipart 上传、官方 image/video/file content 映射、Bearer Blob 预览与 Draft 保留；见 ADR 0012 |
| Markdown GFM / KaTeX / Mermaid | 完成 | raw HTML 禁用、DOMPurify、代码高亮、公式与 strict Mermaid SVG；文件路径内部路由 |
| 文件路径链接 / HTML 路由 | 完成 | 蓝色文件入口；HTML 打开内置浏览器 |
| 本地图片引用 | 部分 | Markdown 本地图片经 Main 的 Session FS 读取，限制为当前 cwd、10 MiB、未截断 base64 二进制；远程 URL 不自动请求。尚待真实 Kimi 0.29.0 会话验收 |
| Conversation TOC / Compact / Undo / Cron notice | 部分 | TOC、Compact/Undo 真实 IPC、Undo 草稿恢复、Cron origin notice 和 transcript marker 已接入；Compact marker 的 token 前后统计与真实会话回归仍待补齐，见 ADR 0013 |
| 声音与系统通知 | 缺失 | Usage 通知偏好不能替代 Turn 通知 |

## 5. Agent、任务与运行模式

| 能力 | 状态 | 当前证据或缺口 |
| --- | --- | --- |
| Model / Thinking / Permission / Plan / Swarm | 完成 | 本轮切片；真实状态、动态能力、独立控制与 Prompt 映射 |
| Goal | 完成 | 真实 Goal Strip、预算摘要、Composer Goal 模式创建与 pause/resume/cancel |
| Todo | 完成 | Transcript 的 authoritative `todos` 映射至右栏“计划”；同一 Session 的 `todo_list` tool display 实时更新，重同步会回到上游事实 |
| Subagent / Swarm roster | 部分 | Roster 与事件投影存在；详情、独立输出和用量仍不完整 |
| BTW side chat | 缺失 | 尚无独立 agent-scoped Side Chat |
| Background tasks | 完成 | `/tasks` 轮询、状态/输出预览和运行中任务取消已替换右栏占位 |
| Skills / Slash commands | 完成 | Session Skills、slash menu 与 activation |
| Mention menu | 缺失 | `@` 按钮无行为 |
| MCP / Tools | 完成 | 真实列表、状态与 MCP restart |

## 6. 文件、Git、Diff 与终端

| 能力 | 状态 | 当前证据或缺口 |
| --- | --- | --- |
| 文件树与读取/预览 | 完成 | Session FS list/read；二进制降级 |
| 文件搜索与 grep | 完成 | Kimi Session FS 的 search/grep；右栏按文件和匹配行呈现，目录结果进入目录 |
| Git status / 单文件 Diff / Changed Files | 完成 | 右栏真实状态、按需 Diff、独立滚动区 |
| Tool Diff | 部分 | Tool 输出存在，专用 Tool Diff 视图未完成 |
| 下载 / Open / Reveal / Open in IDE | 完成 | 下载仅由 Main 的原生保存对话框落盘；系统打开、Finder reveal、Cursor/VS Code 均使用 Kimi Server FS action |
| Terminal | 完成 | 多标签、输入、resize、replay、detach、关闭与打包 smoke |

## 7. Provider、设置与产品增强

| 能力 | 状态 | 当前证据或缺口 |
| --- | --- | --- |
| Provider/Model/Auth/Config | 完成 | 真实目录、添加、刷新、默认模型、OAuth 与白名单设置 |
| Provider 删除 | 上游阻塞 | 见 ADR 0005；Kimi `0.29.0` 无安全 REST mutation |
| Theme | P2（明确不做） | 当前产品范围不实现 Theme 切换 |
| Language / 通知声音 | 缺失 | 设置页尚未提供完整产品配置 |
| Archived Sessions | 完成 | 设置页读取 Kimi 归档列表并恢复至原 Workspace |
| Usage 实时监控 | 完成 | `/oauth/usage`、阈值、轮询、stale/backoff 与顶部 UI |
| 内置开发浏览器 / HTML 路由 | 完成 | `WebContentsView`、preview server、console/network、viewport |
| HTML 画面批注 | 完成 | 隔离 World、元素/区域、裁剪截图、发送前编辑与普通 Kimi Prompt |
| 多 Session 桌宠 | 完成（收敛范围） | 状态可见、点击打开 App 并返回准确 Session；美术精修不作 P0 门禁 |

## 8. 下一实现顺序

1. Conversation 控制的真实 Kimi 0.29.0 回归、Compact token marker 与打包验收。
2. BTW Side Chat、Mention menu 与完整 Agent 详情。
3. Workspace/Config 的完整多客户端全局同步。
4. Language 与通知声音；Theme 已按产品决策移出 P0。

每个切片完成后更新本表，并运行 `pnpm typecheck`、`pnpm test` 和相关 packaged smoke；公开 Beta 仍要求所有非“上游阻塞”的 P0 行完成。
