# Spike B 记录：Kimi API 契约基线

> 日期：2026-07-23
> 状态：进行中，已建立 0.29.0 OpenAPI/AsyncAPI 快照、snapshot/Transcript/Prompt/Approval/Question 与 WS resync 垂直切片；尚未完成官方事件面的完整 projector/reducer 对等。

## 1. 已落地内容

- 从真实托管 `@moonshot-ai/kimi-code@0.29.0` 实例抓取受 bearer 保护的 `/openapi.json` 与 `/asyncapi.json`。
- 快照保存在 `packages/kimi-adapter/contracts/`，并生成 SHA-256 manifest。
- `packages/kimi-adapter/upstream.json` 记录上游仓库、npm 包、版本、License 和快照文件。
- `validateKimiContract` 对 Foundation 必需 REST route/method 和 WebSocket message 做明确门禁。
- 契约测试验证当前快照，并通过删除 snapshot route 的回归用例证明缺失核心路由会失败。
- REST transport 检查 HTTP 状态和 Kimi envelope `code`，并使用 Zod 校验 `/meta` 数据。
- WebSocket transport 已通过真实 0.29.0 实例完成 bearer subprotocol、server/client hello、ack 和关闭握手；单元测试覆盖 ping/pong、重复 event、sequence gap 与 epoch change。
- `sessionSnapshotSchema` 与 `getSessionSnapshot()` 覆盖 atomic state、message page、in-flight turn、tool roster 与 `{seq, epoch}` watermark；Transcript route 以 `agent_id=main` 读取 turn-granular 数据。
- `TranscriptProjector` 从 snapshot seed 历史和 in-flight turn，并投影 protocol message event 与 main-agent raw delta/tool/turn event；保留 `text → tool → text` 的流顺序。
- main-agent Tool/Thinking 已覆盖 durable assistant delta、raw/durable tool progress、tool result、step retry、known no-op 和 snapshot/durable 重叠去重；历史 `tool_use + tool_result` 按 `tool_call_id` 合并为一个可展开工具项。
- volatile assistant/thinking delta 按 step-relative `offset` 检测 duplicate/gap；gap、epoch change 或 `resync_required` 进入 `SessionSyncController` 的重新 snapshot 流程。
- Main 只向 Renderer 发送去敏、可序列化的 Session view；Renderer 选择左栏 Session 后读取真实 Transcript，不建立第二套聊天数据库。
- Prompt、Steer、Abort 已按固定契约接入 Main IPC；只有 Kimi REST 接受 Prompt 后才投影用户消息，queued 状态由官方响应决定。
- Approval/Question 从 snapshot 的 `pending_approvals` / `pending_questions` 恢复，并处理 live requested/resolved/expired/answered/dismissed 事件。
- Renderer 已提供授权一次、本会话授权、拒绝，以及单选、多选、其他答案和放弃问题卡；响应使用官方 REST wire shape，交互过程中防止重复提交。
- IPC 对 Approval/Question 的 ID、枚举、数组、文本长度和 discriminated answer 做精确 allowlist 校验；Main 成功响应后移除 pending card，随后仍以 Kimi 事件和 snapshot 为事实源。

## 2. 当前门禁范围

REST：

- Health、Meta、Auth。
- Workspace/Session 列表与创建。
- Snapshot、Transcript、Prompt、Steer。
- Approval、Question。
- 文件内容。
- OAuth Usage。
- Shutdown。

WebSocket：

- `kimiCodeWebSocket` channel。
- client/server send/receive operations。
- hello、subscribe、session_event、resync_required、ping/pong 和 error 消息。

## 3. 捕获方式

```text
pnpm capture:kimi-contracts
```

脚本启动固定 Kimi 0.29.0，bearer token 只存在于脚本进程内；捕获文件不包含 token、凭据或用户 Session 数据。完成后脚本调用官方 shutdown route。

## 4. 已发现的上游事实

- Kimi 0.29.0 的文件内容 route 是 `GET /api/v1/fs:content?path=...`，不是 POST。契约测试在初次运行时捕获了这一错误假设。
- OpenAPI 与 AsyncAPI 元文档本身受 bearer 保护。
- AsyncAPI 使用单一 `kimiCodeWebSocket` channel，核心消息通过 `components.messages` 定义。
- 真实旧 Workspace 数据可能包含空 `name`，与 OpenAPI 的 `minLength: 1` 不一致。Wire 层接受该历史值，Main 以 Workspace root 的 basename 生成展示名；契约快照仍保留原始约束以便后续上游反馈。

## 5. 尚未满足的 Spike B 条件

- [x] 稳定移植 WS transport、snapshot mapper、Transcript projector 与 cursor reducer 的当前垂直切片。
- [x] 用官方/捕获 fixture 展示 main-agent 流式 Turn、Thinking、Tool、Approval 和 Question；Tool/Thinking 覆盖顺序、进度、结果、重试与展开详情，Approval/Question 覆盖 snapshot、live lifecycle 和 Renderer 交互 fixture。
- [x] 人为制造 sequence gap、volatile delta gap 与 `resync_required`，验证 snapshot 恢复。
- [x] 验证 snapshot seed 后的 offset duplicate 不重复 token，offset gap 强制 resync；运行中工具从 snapshot 恢复。
- [x] Unknown event 计数并保证 projector 不崩溃。
- [ ] 将 OpenAPI/AsyncAPI diff 接入 CI，并对支持区间内 patch 更新生成可审查报告。

真实集成测试现已覆盖 `snapshot + transcript + cursor subscribe`，并只读验证 Session `fs:list`、`fs:read` 以及 `fs:git_status` 的成功/非 Git 错误边界；真实 Electron UI 也已验证 Session 切换、官方 Transcript 恢复、Approval/Question 以及 Tool/Thinking 视觉夹具。Spike B 仍不能标记完成：必须继续同步 subagent/side-channel 等完整官方 projector 事件面，并补齐 Prompt 完整生命周期与强制断线重连测试。
