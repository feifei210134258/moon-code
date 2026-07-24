# 调研结论与竞品分析

## 调研决策

**要解决的问题：** Kimi Code CLI 和官方 Web 的信息架构、长会话体验、文件/预览联动、多 Session 感知及套餐用量可见性不足。

**目标用户：** 已经使用 Kimi Code 套餐、以本地代码仓库为工作中心、同时运行多个编码 Session 的个人开发者和小团队成员。

**产品类别：** Kimi Code 专用桌面工作台，而非多模型聊天客户端或通用 CLI Router。

**证据标准：** 官方源码与协议为高置信度；GitHub issue 是真实问题样本但不代表发生率，按中等置信度使用；README 和产品自述只作为能力线索。

## 一句话结论

值得做，但优势不应是“支持 Kimi”，而应是“完整理解 Kimi Code”。现有通用客户端通常要把多个 Agent 压进同一抽象层，容易丢失 Kimi 的 Session、审批、Question、Tasks、Skills、Swarm、BTW、Prompt Steering、Context、套餐用量等原生语义。这个项目的白区正是：**Kimi-first 深度、Codex 式桌面工作流、开发浏览器与画面反馈。**

## 官方 Kimi Code：可直接利用的基础

截至 2026-07-22，Kimi Code 最新 npm 版本为 `0.29.0`。官方 `kimi web` 已经提供：

- REST `/api/v1`、WebSocket `/api/v1/ws`、OpenAPI 和 AsyncAPI 描述。
- Workspace、Session、Snapshot、Transcript、Message、Prompt Queue、Steering、Abort。
- Approval、Question、Goal、Task、Skill、子 Session、BTW、Swarm 等 Agent 能力。
- 文件浏览、读取、搜索、grep、Git 状态、Diff、Terminal、上传和导出。
- Model、Provider、OAuth、Config 和服务器能力探测。
- 以 `event.session.work_changed` 表达 `busy`、`main_turn_active`、`pending_interaction`、`last_turn_reason`，足够驱动多 Session 状态和桌宠。

套餐用量并不需要抓取网页。官方服务端已有 `GET /api/v1/oauth/usage`，数据包含套餐汇总、各限制窗口、重置提示及 Extra Usage 钱包。当前官方 Web 客户端尚未暴露这一接口，因此这是低协议风险、高用户价值的增强点。

官方 Node SDK、Agent Core 和 Server 包目前标记为 private，不适合作为外部稳定依赖。官方 Web 的 `api/daemon/client.ts`、`ws.ts`、projector、mapper 和 reducer 则是仓库中可审计的自包含实现，适合作为带上游版本标记的 vendored adapter，并通过契约测试跟踪更新。

## 竞品地图

| 产品                                                   | 定位/接入方式                                                                                   | 值得借鉴                                           | 不应照搬                                                                          |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------- |
| [WeSight](https://github.com/freestylefly/wesight)     | Electron 通用桌面 Agent；Kimi 优先走旧 `kimi-agent-sdk` wire mode，失败后退到 CLI `stream-json` | 一键运行时安装、多 Agent 的产品包装、托盘/桌面形态 | 自建会话库、通用抽象削弱 Kimi 原生能力、默认 Auto 权限、修改全局 CLI 配置         |
| [AionUi](https://github.com/iOfficeAI/AionUi)          | Electron + React，面向大量 CLI/ACP Agent                                                        | 完整设置体系、附件与工具生态、跨平台发行经验       | 功能面过宽、复杂状态层、长会话滚动和 Context 告警曾出现问题                       |
| [CloudCLI](https://github.com/siteboon/claudecodeui)   | Web/远程 Claude Code UI，逐步支持更多 CLI                                                       | Remote/Web 可访问、Git 面板、移动端思路            | 流式消息全量重渲染、Diff 预加载、大文件边界不足                                   |
| [Vibe Kanban](https://github.com/BloopAI/vibe-kanban)  | Rust 服务 + Web/Tauri，多 Agent 任务和 Worktree 编排                                            | 任务化工作区、Diff Review、并行 Worktree           | 首版引入 Worktree 生命周期会放大删除和恢复风险，UI 也更接近项目管理而非对话工作台 |
| [Opcode](https://github.com/winfunc/opcode)            | Claude Code GUI 和后台 Agent 工具                                                               | 自定义 Agent、后台任务、会话可视化                 | Claude-specific 设计不能直接映射 Kimi，不能作为协议基础                           |
| [Crystal/Nimbalyst](https://github.com/stravu/crystal) | Electron，多 Codex/Claude Session + Worktree                                                    | 并行方案比较、每任务隔离、任务恢复                 | Worktree 是核心数据模型，偏离 Kimi Session 是唯一事实源的目标                     |
| [AgentAPI](https://github.com/coder/agentapi)          | 将多种 CLI 包装成统一 HTTP API                                                                  | API 化 CLI 的边界设计、无 UI 服务层                | Kimi 已有更丰富的官方 REST/WS，额外代理层只会丢语义                               |

## WeSight 的专项结论

WeSight 是最接近“给多个 Coding Agent 做桌面壳”的参考，但不适合成为 Kimi-first 客户端的技术底座。

源码显示其 Kimi 路径会：

1. 动态加载 `@moonshot-ai/kimi-agent-sdk`。
2. 探测 CLI 是否支持旧式 `--wire`。
3. 不支持时退化成 `kimi ... -p ... --output-format stream-json`。
4. 把本地 Kimi Session ID 映射进自己的 Cowork Session，并由自己的 Store 保存消息。

这套方式无法自然获得当前 `kimi web` 的完整 Workspace/Session/Task/Question/Terminal/File/Provider 能力，还形成第二事实源。

两个公开 issue 很有警示价值：

- [WeSight #31](https://github.com/freestylefly/wesight/issues/31)：曾以覆写或整块替换方式修改外部 CLI 配置，并让凭据离开自身管控范围。结论是客户端不得直接改写 `~/.kimi-code/config.toml`、credentials 或 Session 文件。
- [WeSight #61](https://github.com/freestylefly/wesight/issues/61)：Team/非默认 Agent 下 Kimi 模型显示“未知模型”。这说明统一运行时抽象很容易让实际模型和 UI 状态分叉。

另一个明显问题是 WeSight 将 Kimi 的 `auto` 同样映射为 `yoloMode: true`，并默认使用 Auto。我们的客户端必须保持 Kimi 原生三态：`manual`、`auto`、`yolo`，并让 `plan_mode` 独立存在，默认 `manual`。

## 从公开问题中提取的工程约束

### 长会话不能依赖“普通聊天列表”

[CloudCLI #1050](https://github.com/siteboon/claudecodeui/issues/1050) 描述了流式更新时重建全部消息对象、重复 Markdown/代码高亮和同步滚动监听造成的卡顿。[AionUi #436](https://github.com/iOfficeAI/AionUi/issues/436) 则出现长对话下滚动逻辑无限更新导致白屏。

因此需要：

- 以 Turn 为单位虚拟化，而不是让全部消息常驻 DOM。
- 只有当前流式 Turn 响应 token；历史 Turn 保持稳定引用。
- 流式事件按 animation frame 合并。
- Markdown、Mermaid、KaTeX、代码高亮分层降级，并在 worker 中执行重任务。
- 维护“跟随底部”和“用户正在阅读历史”两种明确滚动状态。

### Diff 必须延迟、限量并识别二进制

[CloudCLI #1025](https://github.com/siteboon/claudecodeui/issues/1025) 展示了 Git 面板预取所有 Diff、把大二进制当 UTF-8、并发复制大字符串最终导致约 4 GB heap OOM 的路径。

因此需要：

- 先展示 Git status 元数据，展开文件时才取 Diff。
- 客户端和服务端均设置字节数、行数、文件数量和并发上限。
- 对二进制、大文件和生成物只显示元数据；不允许“为了预览”整文件读入内存。
- Diff Viewer 使用分块/虚拟化，不让一个文件阻塞整个会话。

### Context 必须提前可见

[AionUi #1110](https://github.com/iOfficeAI/AionUi/issues/1110) 说明通用客户端若没有拿到原生 Context 状态，只能等 “Prompt is too long” 后补救。Kimi 官方 Session status 已提供 `context_tokens`、`max_context_tokens`、`context_usage`；客户端应持续显示，在 70%/85%/95% 时分别提示、警告和强调 `/compact`。

### Worktree 能力后置

Vibe Kanban 和 Crystal 的 Worktree 设计适合并行实验，但 Worktree 清理本身就是产品问题，例如 [Vibe Kanban #765](https://github.com/BloopAI/vibe-kanban/issues/765) 请求可配置保留期和可追溯清理。首版不引入自动创建/删除 Worktree；后续若增加，必须有独立 ADR、恢复策略和明确确认。

## 推荐产品位置

```text
                         通用 Agent
                             ↑
              WeSight / AionUi / AgentAPI
                             │
  任务/看板 ← Vibe Kanban ───┼─── Kimi Agent Desktop → 对话/工作台
                             │            ★
                  Crystal / Opcode        │
                             ↓            │
                         Kimi-first ──────┘
```

核心差异不在模型数量，而在原生能力完整度：

1. **Kimi 原生语义不丢失。** UI 直接表达 Kimi 的 Permission、Plan、Question、Approval、Goal、Tasks、Swarm、BTW 和 Session。
2. **跨窗口仍可感知工作。** 桌宠将运行、等待输入、完成和失败投射到桌面，点击精确返回 Session。
3. **从代码到页面形成闭环。** HTML 点击即预览，页面可调试；画面批注可变成带截图和 DOM 上下文的 Kimi Prompt。
4. **套餐和上下文都透明。** 区分套餐限额、当前 Session token、Context window 和 Extra Usage，不混成一个百分比。

## 风险与结论可信度

| 结论                         | 证据                                              | 置信度 | 可能推翻它的条件                                            |
| ---------------------------- | ------------------------------------------------- | -----: | ----------------------------------------------------------- |
| 官方 REST/WS 是最佳主接入    | Kimi 0.29.0 源码、README、路由和官方 Web 实现     |     高 | Moonshot 移除或封闭本地 Server API                          |
| 套餐监控可不抓网页实现       | 官方 OAuth usage 路由及 parser                    |     高 | 上游删除路由或套餐服务停止返回数据                          |
| Electron 更适合开发浏览器    | Chromium、WebContentsView、Debugger/CDP、截图 API |     高 | 浏览器能力被降级为简单预览，或 Tauri 获得等价跨平台调试接口 |
| Kimi-first 有产品白区        | 竞品源码和功能映射                                |     中 | 主流通用客户端增加完整 Kimi Server 协议适配                 |
| 长会话和大 Diff 必须前置治理 | 多个真实 issue + 官方 Web 的流式批处理改动        |   中高 | 不会出现长会话/大仓库的目标用户假设被证明错误               |

## 主要来源

- [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code)，调研 commit `64f053cf46c6d8a50d529d15bc3f2f4fc88cea8f`
- [Kimi Web README](https://github.com/MoonshotAI/kimi-code/blob/main/apps/kimi-web/README.md)
- [Kimi Web API interface](https://github.com/MoonshotAI/kimi-code/blob/main/apps/kimi-web/src/api/types.ts)
- [Kimi Web WebSocket client](https://github.com/MoonshotAI/kimi-code/blob/main/apps/kimi-web/src/api/daemon/ws.ts)
- [Kimi Agent event projector](https://github.com/MoonshotAI/kimi-code/blob/main/apps/kimi-web/src/api/daemon/agentEventProjector.ts)
- [Kimi OAuth usage route](https://github.com/MoonshotAI/kimi-code/blob/main/packages/kap-server/src/routes/oauth.ts)
- [Kimi managed usage parser](https://github.com/MoonshotAI/kimi-code/blob/main/packages/oauth/src/managed-usage.ts)
- [Electron WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view)
- [Electron Debugger/CDP](https://www.electronjs.org/docs/latest/api/debugger)
- [Electron Security Checklist](https://www.electronjs.org/docs/latest/tutorial/security)

## 建议

证据支持继续推进。下一步不是先画整套高保真 UI，而是用五个可丢弃 Spike 验证最危险的边界：托管 Kimi 运行时、版本契约、多 Session 桌宠、开发浏览器/批注、套餐用量。验证通过后再实现完整功能对照表，可显著减少做到一半才发现协议或 WebView 能力不足的返工。
