# ADR-0008：套餐 Usage 采用 Kimi 权威接口与 Main 单飞轮询

> 状态：Accepted
> 日期：2026-07-23
> 适用范围：套餐、Extra Usage、Session token 与 Context 用量

## 背景

客户端需要持续显示 Kimi 套餐余量，但不能抓取网页、读取 OAuth 文件或把套餐、Session token、Context window 混成一个百分比。官方 Kimi Code `0.29.0` 已提供 `GET /api/v1/oauth/usage`，Session snapshot 与 `agent.status.updated` 则提供会话 token 和 Context 事实。

## 决策

### 事实源分离

- 套餐 summary、限制窗口与 Extra Usage 只读取本地 Kimi Server 的 `/api/v1/oauth/usage`。
- Session input/output/cache/cost/turn 与初始 Context 从 snapshot 恢复；实时 Context 和 token total 由 `agent.status.updated` 更新。
- 两类数据在 typed DTO 和 UI 中保持独立，不相加、不互相估算，也不建立客户端账本。

### 调度与失败状态

- Usage Service 位于 Main；前台每 30 秒、后台每 60 秒轮询。
- Prompt 从 active 变为结束、应用重新获得焦点、网络恢复和 OAuth 登录完成时立即刷新。
- 同一时刻最多一个请求；并发刷新复用同一 Promise，不产生请求队列。
- 请求 10 秒超时；普通失败按 `5s → 15s → 30s → 60s` 退避，429 同时尊重有界 `Retry-After`。
- 最近成功结果按 `serverId + provider(default)` 只缓存在内存。失败后保留最近成功值并进入 `stale`；从未成功则进入 `unavailable`，绝不把错误显示成 0%。
- 401 触发一次权威 Auth snapshot 刷新；Usage 错误信息在进入 Renderer 前有界并去敏。

### 阈值与通知

- 进度比例只在 `limit > 0` 时计算，并夹在 `0..1`；负数、空窗口和零上限不会产生 NaN 或负进度。
- 默认轻提示/警告/严重阈值为 50%/80%/95%；设置页允许按严格递增顺序调整，并可关闭系统通知。警告与严重阈值按 `窗口 key + reset hint + threshold` 在当前进程去重；使用率降回阈值以下或 reset 周期改变后才可再次通知。
- 仅这四项客户端偏好写入 userData 下权限为 `0600` 的 JSON；套餐值、Extra Usage、更新时间和通知历史均不落盘，文件损坏或字段越界时安全回到默认值。

### UI

- 顶部只显示最紧张套餐窗口与当前 Context 百分比。
- 点击或 `⌘⇧U` 打开轻量玻璃弹层，分区展示套餐窗口、Extra Usage、Session token、Context、更新时间和数据源。
- 明确标注“套餐数据为准实时轮询”；`stale/unavailable` 显示最后更新时间与错误，不伪装成服务端推送。

## 权衡

- 轮询比推送最多滞后 30/60 秒，但它使用官方现有接口、协议风险低，并能明确呈现更新时间。
- 内存缓存意味着重启后会重新加载，而不是立即显示旧值；仅阈值偏好持久化，账号用量仍不会形成第二事实源。
- Main 统一调度使窗口隐藏和未来桌宠场景仍可工作，但必须显式清理 timer、runtime listener 与 single-flight 状态。

## 验证

- wire/client 测试覆盖 success、error kind、空窗口、负值、401、429 `Retry-After` 与 timeout；偏好 Store 测试覆盖持久化、顺序/范围校验和损坏回退。
- Service 测试覆盖 30/60 秒调度、single-flight、失败保留、阈值去重、Runtime 停止和 8 小时无请求堆积。
- Session projector 测试覆盖 snapshot token/Context seed 与 `agent.status.updated` 实时更新。
- opt-in 真实 Runtime 集成测试直接调用锁定版 `/oauth/usage`，允许已登录 `ok` 或权威 `error` 结果。
- `1280 × 720` 与 `1024 × 720` 视觉检查均无页面溢出；弹层固定 390 px 宽、内容超高时内部滚动，位于顶部导航之下并高于右栏原生内容。
