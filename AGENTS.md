# 项目约束

## GitHub 仓库

- 公开仓库：[feifei210134258/moon-code](https://github.com/feifei210134258/moon-code)。
- `origin` 指向上述仓库，默认分支为 `main`；常规更新完成验证后推送到 `origin main`。
- 项目采用 MIT License；项目自身的许可证见 `LICENSE`，Kimi Code 及其他依赖的归属信息见 `THIRD_PARTY_NOTICES.md`。
- 发布前先检查 `git status -sb`，不要提交 `.impeccable/`、`.kimi/`、bearer token、OAuth credentials、`.env` 或本地应用状态。
- 推送前运行 `pnpm check`（类型检查、测试和生产构建）；真实 Kimi Runtime 集成测试必须显式 opt-in。

## Agent 内核

- Moon Code 的唯一 Agent 内核是 Kimi Code CLI，通过官方 `kimi web` REST/WebSocket 使用 Workspace、Session 和 Transcript。
- 不要另建聊天数据库，不要绕过 Kimi 官方接口修改用户配置、凭据或 Session 文件。

## macOS 打包

- macOS 发布包只生成 DMG；不要生成 ZIP 或其他归档格式。
