# ADR 0014：Kimi Web BTW Side Chat 边界

- 状态：Accepted
- 日期：2026-07-24

## 背景

固定的 Kimi Code `0.29.0` OpenAPI 已声明 Prompt 的 `agent_id` 字段和 Agent-scoped Transcript 查询，但未在 `paths` 中列出 BTW 创建 action。同期官方 Kimi Web bundle 的 `startBtw(sessionId)` 明确调用：

```text
POST /api/v1/sessions/{sessionId}:btw
```

其返回 `{ agent_id }`。随后 Web 向同一父 Session 的 `/prompts` 提交 text content，同时携带该 `agent_id` 以及当前 model/thinking/permission/plan/swarm 控制。BTW 消息不进入主 Transcript。

## 决策

- Adapter 将 `:btw` 明确标为“官方 Web 证据 / 当前 OpenAPI 路由缺口”，并只接受响应中的非空 `agent_id`。
- Main 在创建后注册唯一的当前 Session Side Chat projector；Renderer 不能直接持有 Bearer 或自行提交 `agent_id`。
- Side Chat Prompt 只允许文本与现有 Kimi Prompt controls。附件、Goal objective 和主对话本地队列均不复用，避免把 Side Chat 误当主 Turn。
- 仅由匹配 Side Chat `agent_id` 或已知消息/Tool ID 的 WebSocket 帧更新 Side Chat；它们不会改变主 Transcript、主 Turn 或主 Prompt Queue。
- Close 只关闭本地面板，与官方 Web 一样不推测或伪造取消 agent 的上游 action。重开创建一个新的 BTW agent。

## 后果

- Side Chat 可实时呈现 agent-scoped User/Assistant 流，并保留主对话隔离。
- 若 Side Chat 单独出现无法恢复的流式缺口，客户端显示需重开的错误，而不是将 Side Chat 历史混入主 Session snapshot。
- Kimi Server/Web 版本升级时必须重新验证 `:btw`，直到官方 OpenAPI 正式收录该路由。

## 验证

- `KimiRestClient.test.ts` 覆盖官方 Web `:btw` route 与 body。
- `SessionSyncController.test.ts` 覆盖 agent-scoped prompt、stream 和主 Transcript 隔离。
- `kimiSessionBridge.test.ts` 与 `promptInputs.test.ts` 覆盖 Main bridge、agent ID 与 text-only IPC 边界。
- `sideChatPanel.test.ts`、`conversationControls.test.ts` 覆盖入口、发送和关闭。
