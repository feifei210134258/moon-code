# ADR-0016：Kimi Web 文件 Mention 边界

状态：Accepted
日期：2026-07-24

## 背景

Kimi Code `0.29.0` 官方 Web 的 `MentionMenu` 会识别光标前、以空白分隔的 `@token`，等待 200 ms 后调用当前 Session 的 `fs:search`，并最多显示 20 个 Workspace 结果。选择后，Web 用结果的 `path` 替换完整 `@token`；最终仍是普通 Kimi Prompt 文本，不存在 Codex mention 协议或额外的结构化 content part。

官方 Web 在只输入 `@` 时会以空查询打开菜单，因此 Session FS 的文件名搜索允许空 query；内容 grep 继续拒绝空 pattern。

## 决策

- Composer 的 `@` 按钮和手工输入 `@token` 走同一状态机。
- 搜索经 Preload/Main 调用 Kimi Session FS；Renderer 不接触 Bearer，也不扫描本地文件系统。
- query 保持 512 字符和 NUL 拒绝边界；空 query 仅对文件名搜索开放。
- 搜索按当前 Session 隔离；切换 Session 后，晚到结果返回空列表，不污染新会话。
- 菜单支持方向键、Enter、Tab、Escape 和鼠标选择，选中项替换为 Kimi 返回的 Workspace path。
- 菜单只展示 Kimi `fs:search` 返回的文件、目录和 symlink，不伪造客户端能力 mention。

## 结果

文件 Mention 与 Kimi Web 的 Prompt 语义保持一致，同时复用已有 Session FS 安全边界。未来如果 Kimi 增加结构化 mention content，应先固定上游契约，再升级当前普通文本路径行为。
