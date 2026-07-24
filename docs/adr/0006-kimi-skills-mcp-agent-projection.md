# ADR-0006：Skills、MCP 与 Agent roster 保持 Kimi 原生事实源

> 状态：Accepted
> 日期：2026-07-23
> 适用版本：Kimi Code `0.29.0`、kap-server v2

## 背景

Kimi Agent Desktop 需要覆盖官方 Web 的 Skills、Tools、MCP 和 Subagent 体验，但不能为了界面方便复制一套能力目录或 Agent 状态库。锁定版 v2 已提供正式 REST route、snapshot roster 和实时 lifecycle event；这些接口的作用域和恢复语义并不完全相同，必须明确客户端边界。

## 决策

### Skills

- Session 已存在时使用 `GET /api/v1/sessions/{session_id}/skills`。
- 新 Session 尚未创建时使用 `GET /api/v1/workspaces/{workspace_id}/skills`。
- Composer 的 `/` 菜单只展示 Kimi 返回的 Skill；提交已知 `/<skill> [args]` 时调用 `POST /api/v1/sessions/{session_id}/skills/{name}:activate`，不把它伪装成普通 Prompt。
- 激活后的 Turn、Transcript 和运行状态继续由 Kimi snapshot/WS 驱动。
- Renderer 只得到 `name/description/source/type/userInvocableOnly`，不需要暴露本地 Skill 文件路径。
- Kimi 持久化的 Skill 展开正文和 `skillPath/dir` 不进入 Renderer：用户 Slash 激活只投影为安全的 `/<skill> [args]`，model-tool、nested-skill 和 injection 等内部 USER-role record 不显示。
- Skill activation 响应没有 Prompt ID；客户端只建立临时的 running View State，随后由 `turn.*` / `event.session.work_changed` 收敛。停止时没有权威 Prompt ID 就调用 `POST /sessions/{id}:abort`。

### Tools 与 MCP

- 当前 Session 的有效工具集使用带 `session_id` 的 `GET /api/v1/tools`；`active` 是 Kimi 综合 profile、全局工具配置和 Session denylist 后的权威结果。
- 锁定版 v2 按 v1 wire parity 返回 `input_schema: null`，客户端不据此生成工具调用表单。
- MCP 状态使用 `GET /api/v1/mcp/servers`，重连使用 `POST /api/v1/mcp/servers/{id}:restart`；客户端不直接管理 MCP 子进程。
- v2 的 MCP route 没有 `session_id` 参数，服务端按最近 Session 的 main Agent 解析有效 MCP service。客户端照实呈现，不建立全局假状态来掩盖该上游作用域。

### Agents / Subagents

- 初始恢复使用 Session snapshot 的 `subagents` roster。
- roster 生命周期只消费 `subagent.spawned/started/suspended/completed/failed`、detach 的 `task.started` 和 main `turn.started/ended`，与锁定版 `SubagentRosterTracker` 对齐。
- 非 main Agent 的 volatile delta/tool progress、child `turn.*` 和 `agent.status.updated` 不进入 roster；输出摘要只使用可由 snapshot/lifecycle 恢复的 `resultSummary/error`。
- main Transcript projector 继续过滤非 main Agent 的 turn、delta 和 tool frame，避免 Subagent 输出混入主对话。
- roster 只保存可从 snapshot/event 重建的内存 View State；输出摘要与 usage 来自 Kimi lifecycle event。
- 前台 Subagent 通过 snapshot roster 恢复；后台 Subagent 仍属于后续 `/tasks` 适配，不用 roster 伪装，以免与 background task ID 重复。

### Session work 与 Workspace selection

- `event.session.work_changed` 是 `busy/main_turn_active` 的权威实时事实；main Turn 结束但后台任务仍运行时允许 `mainTurnActive=false`、`busy=true`。
- Workspace selection 独立于 Session selection。选中没有 Session 的 Workspace 时清空 active Session，使 Workspace Skills 路由真实可达，而不是回退到旧 Session。

## 依据

对 Kimi Code `@moonshot-ai/kimi-code@0.29.0` tag（commit `8bf5bacba9e524c38fb808c0122070037ead25a8`）的 OpenAPI、AsyncAPI、kap-server route、snapshot reader、`SubagentRosterTracker` 和官方 Web projector 进行了对照：

- Skills route 会在 Session 冷态时 resume Session，并通过 `IAgentSkillService.activate` 开始 Turn。
- Tools route 可显式按 Session 解析 Agent；MCP route 使用服务端最近 Session fallback。
- snapshot roster 补回不可重放的 `subagent.spawned` 身份字段。
- 完成事件提供 `resultSummary`、token usage 与 context tokens；后续 lifecycle event 仅携带 `subagentId`，客户端必须在同一 projector 中保留 spawn metadata。

真实托管 Runtime 集成已验证 Session/Workspace Skills、Tools、MCP list 和带 Subagent schema 的 snapshot 解析。

## 后果

- 客户端重启、Renderer reload 和 WS resync 后，能力目录与 Subagent roster 都能回到 Kimi 权威状态。
- Composer Skill 与普通 Prompt 的语义不会混淆。
- MCP 的当前作用域限制会被如实保留；未来上游增加 session-scoped MCP route 后再扩展。
- `/tasks`、BTW side channel、Goal/Todo 等其余官方功能仍需独立切片，不从本 ADR 的 roster 推断。
