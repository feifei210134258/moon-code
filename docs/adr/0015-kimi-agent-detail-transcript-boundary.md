# ADR-0015：Moon Code Agent 详情与独立 Transcript 边界

状态：Accepted
日期：2026-07-24

## 背景

Kimi Code `0.29.0` 的 Session snapshot 与 WebSocket subagent 事件提供 Agent roster、状态、摘要和用量；同版本 OpenAPI 还声明了按 `agent_id` 查询的 Session Transcript：

```text
GET /api/v1/sessions/{session_id}/transcript?agent_id={agent_id}&page_size=100
```

主会话 Transcript 不能用来代替 Agent 独立输出，否则会把不同 Agent 的内容混在一起，也会让 Renderer 获得构造任意 `agent_id` 查询的能力。

## 决策

- Roster 继续由 Kimi snapshot 与 subagent 生命周期事件投影，客户端不建立第二套 Agent 数据库。
- 用户点击 roster 中的 subagent 后，由 Main 查询该 Agent 的独立 Transcript；Renderer 不接触 Kimi Bearer。
- Main 只接受当前活跃 Session roster 中由 Kimi 返回的 subagent ID。伪造 ID 在 REST 调用前拒绝，并校验响应 `agent_id` 与请求一致。
- 独立 Transcript 与主 Transcript 使用不同的只读 View；打开、关闭或切换 Agent 不修改主对话。
- Renderer 以请求代次隔离快速切换：较早请求晚到时不得覆盖当前 Agent。
- 首屏最多读取 100 个 Turn；文本与 Tool preview 有长度上限，分页状态通过 `has_more` 明示。

## 结果

Agent Detail Panel 可以显示生命周期状态、类型、Swarm 序号、输入/输出/缓存/Context 用量及独立输出，同时保持 Kimi Code 为唯一事实源。后续如增加分页或实时 Agent detail streaming，应继续沿用相同的 Session/Agent 身份校验与主 Transcript 隔离边界。
