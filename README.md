# Moon Code

Moon Code 是 **Kimi Code CLI 的桌面 GUI 版本**——以 Kimi Code CLI 为唯一 Agent 内核的本地桌面客户端。

Moon Code 直接启动你本机已安装的 `kimi` CLI，通过官方接口工作；没有安装时也可以使用内置的兼容运行时，开箱即用。你的 Workspace、Session 和对话记录始终由 Kimi 官方数据源管理，Moon Code 不另建聊天数据库。

## 核心卖点

- **项目文件树可视。** 目录浏览、文本预览、Git 状态和单文件按需 Diff 都内嵌在同一窗口，Agent 改了哪些文件、改成什么样一眼可查，不用在终端、编辑器和文件管理器之间来回切换。
- **内置开发浏览器，批注即改。** 隔离浏览器支持 localhost 预览、Console/Network、多视口和整页截图；可以直接框选页面元素或区域写批注，作为 Prompt 附件发回 Agent，形成"看页面 → 批注 → 改代码"的闭环。
- **子 Agent 跑第三方便宜模型。** 主会话保持 Kimi 官方模型的质量，高 token 消耗的子 Agent 任务可绑定内置供应商目录中的任意 OpenAI 兼容模型（如 DeepSeek V4 Flash），极大降低整体 token 成本。
- **套餐用量可视化。** 套餐窗口、Extra Usage、Session token 和 Context 使用率准实时展示，支持 50%/80%/95% 阈值与系统通知，额度消耗不再靠猜。
- **桌面宠物盯梢多 Session。** 桌宠置顶聚合运行中、待处理、完成、失败状态并提示未读，点击直接跳回对应会话，多任务并行不再靠记忆。
- **多 Session 编码工作台。** 左侧按 Workspace 组织真实 Session，Prompt Queue、Steer/Abort 实时干预与内嵌 xterm 多标签 Terminal 同屏完成，长任务不阻塞。
- **断线自动恢复。** 网络波动、断线或重启后自动续传，流式输出、工具调用和结果保持顺序、不丢失。
- **高级能力显式化。** Skills、MCP、Tools 与子 Agent 列表等高级能力都有专门的可视界面，不用去翻日志。

## 为什么选择 Kimi Code CLI 内核

Moon Code 不重新实现一个 Agent，也不把对话复制进另一套本地数据库，而是把 Kimi Code CLI 的官方能力带进更适合桌面开发的工作台：

- **与官方完全一致。** 对话、审批、工具调用、Skills、Session 等都直接使用 Kimi 官方接口，能力跟随官方版本持续演进。
- **开箱即用。** 默认连接本机已有的 Kimi Code CLI；没有安装时可切换到内置运行时，不需要另起一套 Agent 服务。
- **不另存你的数据。** Workspace、Session、消息和运行状态都来自 Kimi 官方数据源，Moon Code 只负责界面与交互，不会修改你的 Kimi 配置、凭据或会话文件。
- **本地安全边界。** 登录凭据只保留在本地主进程，浏览器预览、文件操作和终端都有独立的权限隔离。

## 文档

完整调研、产品需求、功能对照、UX 与技术架构文档见 [docs/README.md](./docs/README.md)。

## License

项目自身采用 [MIT License](./LICENSE)。`@moonshot-ai/kimi-code` 及其他依赖的许可证和归属信息见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。项目不代表 Moonshot AI，也不包含用户的 Kimi 凭据、Session 数据或本地应用状态。
