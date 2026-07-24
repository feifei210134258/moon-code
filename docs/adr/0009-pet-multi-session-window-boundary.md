# ADR 0009：桌宠多 Session 状态与窗口权限边界

- 状态：Accepted
- 日期：2026-07-23

## 背景

主会话 `KimiSessionBridge` 只订阅当前 Session，用于完整 Transcript、Tool、Approval 和 Question。桌宠需要在主窗口关闭后继续观察多个活跃 Session，并且不能因为“方便跳转”而获得 Prompt、审批、文件或浏览器能力。

## 决策

### 独立状态服务

Main 中新增 `KimiPetService`：

- Kimi REST 每 3 秒发现活跃/新启动 Session，不从本地数据库恢复宠物。
- 对已追踪 Session 使用独立 WebSocket 连接和 cursor，状态事件直接驱动宠物，避免等待下一轮 REST 轮询。
- Runtime 停止、Server ID 变化或 WS 断线时保留已追踪引用，但状态统一进入 `Disconnected`；重连后重新以官方 Session 列表为准。
- 只追踪真实 Busy、Pending Interaction，以及这些 Session 完成后的短期 Review 状态。旧的历史 Completed Session 不会在启动时生成“幽灵宠物”。

`SessionPetStateReducer` 使用固定优先级：

```text
Disconnected > Waiting > Failed > Running > Completed transient > Review/Unread > Idle
```

Completed 动画默认持续 6 秒；未读 Session 保留为 Review。用户在主窗口真正加载该 Session 后才标记 Viewed。默认最多显示 5 个窗口，更多状态由最后一只宠物的 `+N` 折叠标记表示，并保留高优先级排序。

### 窗口与 IPC

每个可见 Session 对应一个透明、无边框、置顶、固定尺寸的 `BrowserWindow`。窗口使用独立 `pet.cjs` sandbox preload，只暴露：

- 获取当前绑定的最小 Pet 状态；
- 接收该状态的更新；
- 打开当前绑定 Session；
- 拖拽开始、移动和结束。

Pet Renderer 不暴露 `window.kimiAgent`，不能发送 Prompt、读取 Transcript/文件、访问浏览器数据，也不能批准 Approval 或回答 Question。Main 根据 `event.sender` 反查窗口与 Session 绑定；Renderer 不能通过传入另一个 Session ID 越权跳转。

点击宠物产生 `{serverId, workspaceId, sessionId, focus}` 意图。Main 显示或重建主窗口，主 Renderer 验证 Server ID、选择真实 Session，并在 snapshot 加载后定位 Interaction 或最新 Turn。敏感操作仍只在主窗口中完成。

### 拖拽与位置

拖拽坐标在 Main 中校验并限制到显示器 work area；释放后吸附最近的左右边缘。仅保存 `{displayId, edge, offsetY}`，不保存 Kimi Session 内容。显示器变化时回退到主显示器安全区域。

## 后果

- Pet 与主 Transcript 使用不同 WS 连接，职责和数据权限清晰，但需要额外处理重连与订阅集合。
- 桌宠在主窗口关闭后仍可更新；关闭应用时统一销毁窗口并停止状态服务。
- 首版以状态准确、点击打开/恢复 App、精确返回绑定 Session 为发布门槛。现有简单角色或占位视觉可以直接承担首版，不要求正式 sprite atlas、完整动作集或宠物包；后续若精修美术，再单独执行对应的生成与视觉验证流程。

## 验证

- Reducer 测试覆盖初始活跃集合、优先级、最多 5 个、完成转 Review、Viewed 和 Disconnected。
- Service 测试覆盖活跃 Session 订阅和 WS 事件无轮询延迟投影。
- Renderer 测试确认 Waiting 状态只提供“回主窗口”，不出现审批动作。
- `--smoke-pet` 在打包后的 Electron 应用中验证透明 Pet Renderer、sandbox preload、`window.kimiAgent` 不可见、状态投影和 Session 绑定点击意图。
