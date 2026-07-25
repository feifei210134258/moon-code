# ADR-0018：复用单一 Kimi Web Runtime

状态：Accepted
日期：2026-07-25

## 背景

Moon Code 此前在启动时以 `kimi web --port 0` 创建独立的 Kimi Server。用户在浏览器中打开的 Kimi Web 则使用默认的 `127.0.0.1:58627`。两者拥有不同的 WebSocket 事件中心，因此用户在 Kimi Web 中进行的流式回答、思考过程和工具事件不会实时传给 Moon Code。

需求与约束：

- Moon Code 与用户的 Kimi Web 必须订阅同一个 Kimi Server，且不需要用户选择连接方式。
- Bearer token 只允许在 Main 进程读取和使用；不得进入 Renderer、IPC 公共状态或日志。
- 退出 Moon Code 时不得关闭用户已经运行的 Kimi Web Runtime。
- 未运行 Kimi Web 时，Moon Code 仍可通过已发现的系统 Kimi Code CLI 自动启动服务。

## 决策

- Main 启动时先读取仅限本机的 `~/.kimi-code/server.token`，以 `GET /api/v1/healthz` 和受 Bearer 保护的 `/api/v1/meta` 验证默认 Runtime `http://127.0.0.1:58627`。
- 验证成功后，以公开状态 `mode: "shared"` 连接该 Runtime。公开状态只包含版本、server ID 与 origin，不包含 token。
- 没有健康的共享 Runtime 时，使用已发现的系统 CLI 以固定端口 `58627` 启动 `kimi web`，而不是使用随机端口。之后在同一用户目录启动的 Kimi Web 会复用这一个 Runtime。
- 健康检查成功但 token 或 metadata 校验失败时，启动失败且不再尝试创建第二个进程；这避免在端口被占用或 token 轮换时产生误导性分叉。
- `stop()` 对共享 Runtime 只释放 Moon Code 的连接和本地状态；只有 Moon Code 自己 spawn 的子进程才会收到 shutdown/终止信号。

## 后果

### 正面

- Kimi Web 与 Moon Code 的同一会话使用同一条 WebSocket 事件流，回答、Thinking 和工具状态可实时同步。
- 用户无需复制 token、手动配置地址或选择连接模式。
- 共享 Runtime 的连接不产生额外 CLI 启动延迟，也不会在退出桌面端时影响浏览器中的 Kimi Web。
- token 的读取、验证和 REST/WebSocket 使用全部保留在 Main 进程。

### 代价

- 默认端口与 Kimi Code CLI 的约定形成显式耦合；CLI 修改默认端口时需要同步更新此策略。
- token 刚被轮换、文件尚未写入时，Moon Code 会显示受控的连接失败信息，直到用户重试。
- 端口在健康检查后被其他进程抢占的极小竞态会导致启动失败；用户重试后会重新探测共享 Runtime。

## 备选方案

- 继续使用随机端口：拒绝，因为每个客户端都有独立事件中心，无法获得 Kimi Web 的实时 Thinking 和流式输出。
- Renderer 直接连 Kimi WebSocket：拒绝，因为会把 Bearer token 暴露给不可信的渲染层并绕开 IPC 信任边界。
- 对外部 Kimi Web 会话周期性拉取 snapshot：拒绝作为主方案，因为轮询无法完整还原细粒度 Thinking delta，且会引入延迟与不必要 I/O。
- 要求用户手工粘贴 Runtime 地址和 token：拒绝，因为 CLI 已维护本机默认 Runtime 与 token 文件，手工步骤会增加错误率。

## 验证

- Runtime 测试覆盖健康共享 Runtime 不 spawn、公共状态不含 token、共享 Runtime 的 stop 不调用 shutdown，以及无共享 Runtime 时的固定端口启动参数。
- `pnpm test` 与 `pnpm build` 覆盖类型、Main IPC 与 Renderer 集成。
