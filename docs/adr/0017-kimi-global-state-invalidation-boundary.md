# ADR-0017：Kimi 多客户端全局状态失效边界

状态：Accepted
日期：2026-07-24

## 背景

Kimi Code `0.29.0` 的 WebSocket 不只发送当前会话的 Turn。服务端会把 `event.workspace.*`、`event.config.changed` 和结构性 `event.session.*` 广播给每一个已有 Session 订阅；其中 Workspace 与 Config 使用 `session_id: "__global__"`，而 Session 事件保留其真实 Session ID。

此前桌面客户端的 `SessionSyncController` 只接受当前活跃 Session 的帧。因此另一个 Kimi Web、CLI 或桌面客户端创建/改名 Workspace、改变 Session 状态或更新 Config 后，左栏和打开中的设置面板不会刷新。

需求与约束：

- Workspace/Session 导航与 Kimi Config 应跟随 Kimi Server 的权威状态，而不维护第二份可写状态。
- Renderer 不得收到 Config 原文、Provider 凭据或任何 Bearer token。
- 高频 Session 工作状态不能导致每一帧都重拉完整导航。
- WebSocket 重连或全局 cursor gap 后必须能收敛，而不是永久停留在旧视图。

## 决策

- `SessionSyncController` 从已连接的正常 Session 订阅中识别全局或跨 Session 的事件，并只发出 `{ scope, eventType }` 失效通知。
- Main 将该通知转成一个独立 IPC 通道；preload 只暴露强类型监听器。不会将 WS payload 或 Config 内容跨进程转发。
- Renderer 对导航通知做 240 ms 合并，再调用已有的 `getWorkspaceTreePage`；每次读取带 generation，较早响应不得覆盖更新后的树。
- Config 通知递增 revision；已打开的 SettingsPanel 通过已有 `getKimiSettings` 重取权威快照，当前活跃 Session 同时重读 controls 和 Skills。
- `__global__` 的 resync gap 与成功重连都会同时发出 navigation/config 失效通知，以 REST 重新收敛。
- 不伪造 `__global__` 的 WS subscribe：锁定版服务端只为真实 Session 建立普通订阅，但会将全局事件广播给这些订阅目标。

## 后果

正面：多客户端修改会在已有会话连接中及时同步；Renderer 始终经 Main 的受控 REST/IPC 路径读取权威结果；丢失的全局事件不会永久造成旧视图。

代价：导航更新最多延迟 240 ms，且一次通知会触发一次分页首页重读。没有任何已打开 Session 时没有 WS 订阅；但下次进入客户端或打开 Session 时，初始 REST 读取仍会得到最新状态。

上游限制：`event.model_catalog.changed` 在 Kimi `0.29.0` 的服务端实现中未列为全局广播事件。因此跨客户端 Provider 刷新在没有后续 Config/重连事件时无法保证即时推送；客户端不会通过轮询所有 Provider 或改写 Config 来伪造该行为。

## 备选方案

- 将完整 Config 作为 IPC payload 推给 Renderer：拒绝，因为即便服务端已遮盖部分字段，也会扩大敏感配置的暴露面。
- 让 Renderer 直接连接 Kimi WebSocket：拒绝，因为会使 Bearer token 进入 Renderer，并绕开 Main 的信任边界。
- 固定周期轮询 Workspace、Config 和 Provider：拒绝，因为正常的官方 WS 广播已经覆盖 Workspace/Config，轮询会制造不必要的 I/O；上游未广播的模型目录缺口单独保留。

## 验证

- `SessionSyncController.test.ts` 覆盖 Workspace、Session、Config 和全局 resync invalidation。
- `kimiSessionBridge.test.ts` 覆盖 Main 的 payload 隔离。
- `runtimeBridge.test.ts` 覆盖 Renderer 的导航合并与 Config revision。
- `settingsPanel.test.ts` 覆盖 SettingsPanel 的权威重读。
