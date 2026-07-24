# ADR 0004：Kimi 0.29 v2 Terminal 兼容层

- 状态：Accepted（临时兼容）
- 日期：2026-07-23
- 影响范围：托管 `@moonshot-ai/kimi-code@0.29.0` 的 Session Terminal

## 背景

Kimi Code `0.29.0` 的 OpenAPI、AsyncAPI、官方 Web 客户端和服务端 schema 都声明了 Terminal REST 与 `terminal_attach/input/resize/detach/close` WebSocket 帧。真实 Runtime 验证发现：v2 `WsConnectionV1.onMessage` 实际只分发 `client_hello`、`subscribe`、`unsubscribe` 和文件监听帧，Terminal 帧被 default 分支静默丢弃。因此 REST 可以创建 PTY，但官方 Web 与第三方客户端都无法 Attach、输入或接收输出。

这不是客户端 wire shape 问题：使用官方 `c_N` request ID、bearer subprotocol、已订阅 Session 和契约中的精确 payload 仍没有 ack 或输出；上游 v2 服务端源码也直接证明缺少对应分支。

## 决策

- `packages/kimi-adapter` 继续保留官方 Terminal REST/WS 契约，供上游修复后的版本使用。
- 当 `/meta.backend === "v2"` 且版本处于当前锁定范围时，Electron Main 使用 `node-pty` 提供 Session Terminal 兼容层。
- 兼容层的 cwd 必须来自当前 Kimi Session snapshot 的 `metadata.cwd`；Renderer 不能提交 shell 或 cwd。
- PTY 仅处理终端 I/O。Prompt、Tool、Approval、Question、Session 状态和 Transcript 仍全部走 Kimi Server；禁止把 PTY 输出解析成 Agent 协议。
- 输出采用独立递增 seq 和有界 replay buffer；Session 切换 Detach，Runtime 停止时回收全部 PTY。
- 重复 Attach 是幂等 replay 请求，不是 no-op；Renderer 重载后可从本地最后 seq（没有缓存时从 0）恢复输出。Detach 后的迟到 native WS 帧必须丢弃。
- 兼容层最多允许每个 Session 8 个、全局 24 个 Terminal，避免失控的 PTY 资源占用。
- UI 使用 xterm 处理 ANSI、光标、键盘和 resize，不用 `<pre>` 模拟终端。

## 安全边界

- Main 校验 Session/Terminal ID、输入块字节数及 cols/rows；终端原始控制字节允许通过。
- shell 只取本机默认 shell，cwd 先 `realpath`；两者都不从 Renderer 输入。
- 单次输入最多 64 KiB；Main 与 Renderer 均使用有界输出缓存。
- PTY Close/Runtime shutdown 先发送正常终止信号并等待有界宽限期；未退出则升级为 `SIGKILL`，直到收到真实 exit 才释放 native handle。
- 生产 `.app` 由 electron-builder 使用项目内锁定版本的 Electron distribution 打包，避免门禁重复依赖远程下载；`node-pty` 整包从 asar 解包，afterPack 针对目标架构修复 `spawn-helper` 可执行位。打包门禁会启动产物并执行真实 PTY marker smoke。

## 后果与退出条件

兼容层让锁定版 Runtime 的 Terminal 可用，但它不是 Kimi Server 内存中的 Terminal resource；App 退出时终端也随之退出。每次升级 Kimi patch 都必须运行真实 Terminal smoke test。只有当上游 v2 能完成 Attach → Input → Output → Resize → Close 后，才切回原生路径并删除此兼容层。
