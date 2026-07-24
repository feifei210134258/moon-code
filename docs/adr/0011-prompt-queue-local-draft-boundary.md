# ADR-0011：Prompt Queue 的本地草稿与 Kimi 已接收队列边界

## 状态

Accepted — 2026-07-24

## 背景

Kimi Code `0.29.0` 官方 Web 的队列交互并不等同于 REST `/prompts` 返回的队列：

- 用户在 active turn 期间继续发送时，官方 Web 先把 `text + attachments + local id` 放进 `queuedBySession` 内存队列。
- 编辑实际是从本地队列取回 Composer；移除和重排也只改变该内存数组。
- 前一个 Turn 结束后，Web 按 FIFO 逐条调用普通 Prompt 提交。
- REST `/prompts` 的 active/queued 表示 Kimi Server 已经接收的 Prompt；固定版本没有编辑或重排这些 Prompt 的接口。

如果把服务端 queued Prompt 伪装成可编辑对象，就只能用 abort + 重提模拟，既会改变 Prompt ID 和顺序，也可能与 Kimi 正在调度的状态竞争。

## 决策

客户端明确呈现两种状态：

1. **Draft：** Renderer 内存中的待发送 Prompt，可编辑、移除和上下重排。
2. **Kimi：** `/prompts` 返回的已接收队列，可 Steer 或 Abort，但不伪造编辑/重排。

本地 Draft 按 Session 隔离，只在当前 App 进程内存在；Runtime 停止时清空。它不是 Transcript 或 Session 的第二事实源，也不会被描述为 Kimi 已经接收。

发送规则与官方 Web 对齐：

- active turn 存在时，新 Prompt 进入本地 Draft 队列。
- Turn 结束后只取一条提交，等待该 Prompt 的运行周期结束再取下一条。
- 提交失败时把 Draft 恢复到队首。
- Model、Thinking、Permission、Plan、Swarm 在真正提交时读取当前 Session Controls；Goal 意图作为该 Draft 的显式用户意图保留。

## 结果

- Queue 编辑与重排不需要新增或猜测 Kimi 协议。
- 其他 Kimi 客户端产生的 Server Queue 仍通过 `/prompts` 可见。
- App 崩溃或 Runtime 停止会丢失尚未提交的 Draft；首版不将它们写入项目或独立聊天数据库。
- 后续附件切片应把附件引用纳入同一个 Draft DTO，但仍不得持久化 bearer token 或文件内容副本。
