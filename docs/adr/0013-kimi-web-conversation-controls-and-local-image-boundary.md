# ADR 0013：Conversation Controls 与 Markdown 本地图片边界

- 状态：Accepted
- 日期：2026-07-24

## 背景

固定的 Kimi Code `0.29.0` OpenAPI 契约列出了 Transcript item 的 `marker`、`taskref`、Turn `origin` 和 Session FS 读取能力，但没有把 Compact、Undo 两个 Session action 写入 `paths`。同期官方 Kimi Web 代码仍会调用：

```text
POST /api/v1/sessions/{sessionId}:compact
POST /api/v1/sessions/{sessionId}:undo
```

Compact 支持可选 `instruction`，Undo 使用 `{ count }`。客户端需要覆盖官方可见控制，但不能把这两个 Web 行为误包装成自创 Kimi 协议，也不能为了 Markdown 图片让 Renderer 任意读取本机路径。

## 决策

### Compact 与 Undo

- Adapter 保留两个明确的方法，并在代码和审计中标注“官方 Web 代码证据 / 当前 OpenAPI 路由缺口”。
- Compact 发送 `{}` 或 `{ instruction }`；Undo 发送 `{ count }`，UI 首版固定为撤销上一轮。
- Main 只允许当前已打开 Session 调用；输入在 IPC 边界做长度和范围验证。
- 上游 action 成功后立即重新读取 authoritative snapshot/transcript，而不是本地删改消息。
- Undo 在调用前仅提取最近一条普通用户消息的文本和 Kimi file ID，用于把可重发 Draft 装回 Composer；上游结果始终是 Session 历史的唯一事实源。

### Transcript 与 Cron

- `/transcript` 的官方 marker 原样投影为轻量会话分隔标记。
- 用户消息的 `metadata.origin.kind === "cron"` 保留为可见 notice，保留 `taskId` 与 Turn 自身时间；不把 Cron 伪装为普通人工 Prompt。
- 未识别 marker 保留上游 marker 文本，不根据推测生成业务状态。

### Markdown 本地图片

- Renderer 只把非 `http(s):`、`data:`、`blob:` 的 Markdown 图片源交给受限 IPC。
- Main 仅允许相对路径，或位于当前 Session `metadata.cwd` 内的绝对路径；父目录跳转和跨 Workspace 绝对路径返回空结果。
- 使用官方 Session FS `readFile`，最大读取 10 MiB；只有 `is_binary === true`、`encoding === "base64"`、`truncated === false` 且 MIME 为 `image/*` 时才构造 data URL。
- 模型输出的远程图片 URL 默认不自动请求，避免在没有用户意图时向第三方发出网络请求。

## 后果

- 当前版本能覆盖官方 Web 的主操作语义，但需要在每次 Kimi Web 或 Server 版本升级时重新验证这两个 OpenAPI 外 action。
- Compact marker 的 token 前后统计只有在实测 payload 已稳定后才展示；首版不根据字段名猜测数值。
- Renderer 无法直接越权读取本机文件，代价是本地图片预览必须异步经 Main 读取。

## 验证

- `KimiRestClient.test.ts` 覆盖 action 路径和 body。
- `kimiSessionBridge.test.ts` 覆盖 action 后 resync、Undo Draft 和受限图片读取。
- `SessionSyncController.test.ts`、`TranscriptProjector.test.ts` 覆盖 marker 和 Cron origin。
- `conversationControls.test.ts`、`markdownBlock.test.ts` 覆盖 UI 操作和 Renderer 边界。
- `KIMI_RUNTIME_CONVERSATION_INTEGRATION=1` 会创建并归档一个测试 Session，真实验证 Workspace Markdown 图片读取、Compact 和 Undo；该测试仅在显式开启时运行。
