# ADR-0003：Kimi 数据是会话与消息的唯一事实源

## 状态

Accepted

## 背景

通用 Agent 客户端常建立自己的 SQLite Session/Message 模型，再把外部 CLI Session ID 映射进去。这方便统一多个 Agent，却会引入双写、恢复冲突、模型显示分叉、外部客户端变化不可见和导出不一致。

本产品只服务 Kimi Code。Kimi Server 已能列出和恢复 Workspace、Session、Snapshot、Transcript、Prompt、Task 和交互状态，没有必要再建立同等数据库。

## 决策

- Kimi Workspace、Session、Message、Transcript、Prompt Queue、Approval、Question、Task、Provider、OAuth、Config 均以 Kimi Server 为事实源。
- 客户端只持有可重建的内存 View State、WS cursor 和 UI 映射。
- 本地持久化仅用于窗口、面板、主题、宠物位置、Browser partition、未发送草稿等客户端自身数据。
- 客户端不直接读取或写入 Kimi Session 文件、config.toml 和 credentials。
- 恢复流程总是从 Kimi list/snapshot/transcript 开始，不从客户端消息 cache 开始。

## 结果

### 正面

- CLI、官方 Web 和本客户端看到同一套 Session。
- 避免双写和“客户端显示完成但 Kimi 实际仍运行”。
- Kimi 升级 Session 格式时，客户端依赖公开 Server 映射而非磁盘细节。
- 导出、归档、Fork 和恢复语义保持官方一致。

### 负面

- Kimi Server 不运行时，客户端不能靠自己的数据库继续修改会话。
- 本地全文搜索能力受官方 API 限制。
- 超大历史的读取性能需要通过分页、snapshot 和虚拟化解决，不能简单复制到本地 DB。

### 中性

- 可以保存短期、可丢弃的视图 cache，但必须标记 server ID、session ID、cursor/epoch，并随时可重建。
- 未来若加入全文索引，索引只能是派生数据，并需要新的 ADR。

## 备选方案

### 自建 SQLite 会话和消息

不采用。它适合多 Agent 统一产品，不适合 Kimi-first 客户端，并会重复 WeSight 一类双事实源风险。

### 直接解析 `.kimi` Session 文件

不采用。磁盘格式不是本产品应该耦合的外部契约，也会绕过 Server 的迁移和一致性逻辑。

### 只保存 CLI stdout

不采用。无法恢复结构化交互、任务和多 Agent 状态。

## 参考

- [Kimi Web Architecture](https://github.com/MoonshotAI/kimi-code/blob/main/apps/kimi-web/README.md)
- [Kimi Session routes](https://github.com/MoonshotAI/kimi-code/blob/main/packages/kap-server/src/routes/sessions.ts)
- [Kimi Snapshot route](https://github.com/MoonshotAI/kimi-code/blob/main/packages/kap-server/src/routes/snapshot.ts)
