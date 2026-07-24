# ADR-0001：使用 Kimi 官方 Server API 作为唯一 Agent 接入

## 状态

Accepted（待 Spike B 验证实现细节）

## 背景

客户端必须覆盖 Kimi Code Web 的全部功能，并保持 Kimi Session、Approval、Question、Task、Skill、Terminal、File、Provider 等原生语义。候选接入包括官方 `kimi web` REST/WS、旧 `kimi-agent-sdk` wire mode、CLI `stream-json`、ACP 和 PTY/TUI 解析。

Kimi Code `0.29.0` 已提供 `/api/v1`、`/api/v1/ws`、OpenAPI/AsyncAPI 和官方 Vue Web 客户端。旧 SDK/Node SDK 包目前 private 或面向旧 wire；`stream-json` 只覆盖 Prompt 输出的子集。

## 决策

- 启动 `kimi web --port 0 --no-open`，使用官方 REST + WebSocket。
- 同步官方 Web 的 wire/mapping/projector/reducer 代码到版本化 adapter。
- Kimi Server 的 Workspace/Session/Transcript 是事实源。
- 不使用 Codex 协议，也不构建 Codex 事件兼容层。
- 不用 ACP、`stream-json` 或 PTY 作为 Kimi 主通道。
- 对不兼容版本显式报错或切换托管版本，不静默降级。

## 结果

### 正面

- 能覆盖官方 Web 的完整语义和双向交互。
- Snapshot、cursor 和 resync 提供比 stdout 解析更可靠的恢复。
- 套餐 Usage、文件、Terminal、Provider 等无需自建私有协议。
- 官方 Web 本身可作为兼容参考实现。

### 负面

- REST/WS 尚未声明为独立稳定第三方 SDK，需要持续跟踪上游。
- Adapter 必须维护版本矩阵和契约测试。
- Bundled Kimi runtime 增加发行体积和更新工作。

### 中性

- 产品 UI 可完全重做，但 transport/projector 应尽量保持上游形状。
- 未来若官方发布稳定 SDK，可替换 adapter 而不改变产品领域模型。

## 备选方案

### `@moonshot-ai/kimi-agent-sdk` / wire mode

不采用。WeSight 已展示这种路径，但它依赖旧 wire 能力，无法自然覆盖当前 Web Server 的全部领域。

### `kimi -p --output-format stream-json`

不采用。适合一次性非交互运行，不足以承担 Workspace、Question、Task、Terminal、File、Provider 和多 Session 同步。

### ACP

不采用。Kimi 的 ACP adapter 不是本产品目标协议，通用化会损失原生能力。

### PTY/TUI 解析

不采用。屏幕文本不稳定、难恢复、难做结构化审批，并会把 Terminal 与 Agent 协议混为一谈。

## 参考

- [Kimi Web README](https://github.com/MoonshotAI/kimi-code/blob/main/apps/kimi-web/README.md)
- [Kimi Web API types](https://github.com/MoonshotAI/kimi-code/blob/main/apps/kimi-web/src/api/types.ts)
- [Kimi WS client](https://github.com/MoonshotAI/kimi-code/blob/main/apps/kimi-web/src/api/daemon/ws.ts)
