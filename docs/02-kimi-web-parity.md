# Kimi Code Web 功能对照表

## 1. 对等原则

“Kimi Web 全功能”定义为：Kimi Code `0.29.x` 官方 Web 中用户可见的操作和状态，在桌面客户端中均有等价入口与反馈。内部调试路由或浏览器移动端布局不视为独立业务功能，但不能因此丢失业务操作。

采用三层对等：

1. **可见功能对等：** 官方 Web 有入口的功能，客户端必须有入口。
2. **状态语义对等：** 即使重做 UI，也不能把 Permission、Plan、Approval、Question、Task 等压成模糊文本。
3. **契约对等：** 官方客户端识别的 WS 事件、snapshot/resync 和 REST 失败语义必须保留。

P0 开发时，本表每一行应补充自动化测试 ID 和实现位置；在此之前状态统一记为“计划”。

## 2. 系统、认证与连接

| 能力                 | 官方 REST/WS 或 UI                 | 首版要求 | 说明                                      |
| -------------------- | ---------------------------------- | -------- | ----------------------------------------- |
| Health / Meta        | `/health`、`/meta`                 | P0       | 显示 Kimi Server 版本、能力和连接状态     |
| Bearer auth          | REST header、WS subprotocol        | P0       | token 内存保存；禁止日志输出              |
| Server auth gate     | `ServerAuthDialog`                 | P0       | 支持连接系统 Kimi 或受保护实例            |
| OAuth 登录/轮询/取消 | `/oauth/login`                     | P0       | 保持官方 device-code 流程                 |
| OAuth 登出           | `/oauth/logout`                    | P0       | 由 Kimi Server 清理凭据                   |
| Auth readiness       | `/auth`                            | P0       | 未登录、无 Provider、默认模型缺失分别提示 |
| 断线重连             | WS reconnect                       | P0       | 退避、网络恢复立即重连                    |
| Snapshot/resync      | `/sessions/{id}/snapshot`          | P0       | gap/epoch 变化后原子重建                  |
| 多客户端同步         | 全局 session/workspace/config 事件 | P0       | 其他 Kimi 客户端产生的变化可见            |
| Graceful shutdown    | `/shutdown`                        | P0 内部  | 只用于客户端自己托管的 loopback Server    |

## 3. Workspace 与 Session

| 能力                           | 官方入口/接口                   | 首版要求 | 桌面 UI                                    |
| ------------------------------ | ------------------------------- | -------- | ------------------------------------------ |
| Workspace 列表与派生 Workspace | `/workspaces`                   | P0       | 左侧分组                                   |
| 文件夹选择                     | `/fs:browse`、`/fs:home`        | P0       | 原生文件夹选择优先，服务端选择器兜底       |
| 添加、重命名、移除 Workspace   | POST/PATCH/DELETE `/workspaces` | P0       | 移除只取消注册，不删除磁盘内容             |
| Session 列表与分页             | `/sessions`                     | P0       | Workspace 下虚拟化列表                     |
| 搜索 Session                   | `SearchSessionsDialog`          | P0       | 全局快捷入口                               |
| 创建 Session                   | POST `/sessions`                | P0       | 必须绑定已注册 Workspace                   |
| 历史 Session 继续对话          | persisted session               | P0       | 无 activate/import 步骤                    |
| Session 标题和 Profile         | `/profile`                      | P0       | 支持自动标题和手动改名                     |
| Archive / Restore              | Session actions                 | P0       | Archive 不等于删除                         |
| Fork                           | Session action                  | P0       | 新 Session 保留父子关系                    |
| Child Session                  | `/children`                     | P0       | 用于 Agent/Session 层级呈现                |
| Export                         | `/export`                       | P0       | 保存官方 zip，附带可选 Web 日志            |
| Session warnings               | `/warnings`                     | P0       | 如超大 AGENTS.md 等警告                    |
| Runtime status                 | `/status`                       | P0       | Model、Thinking、Permission、Plan、Context |
| Current goal                   | `/goal`                         | P0       | 顶部 Goal Strip                            |

## 4. Prompt、对话和消息

| 能力                      | 官方语义                           | 首版要求 | 注意事项                                         |
| ------------------------- | ---------------------------------- | -------- | ------------------------------------------------ |
| 提交 Prompt               | `/prompts`                         | P0       | 每次携带 model/thinking/permission/plan 等当前值 |
| Prompt Queue              | active + queued                    | P0       | 明确显示 Running/Queued                          |
| Steering                  | `/prompts::steer`                  | P0       | 不等同于发送新 Turn                              |
| Abort Prompt/Session      | Prompt actions / Session abort     | P0       | 区分停止当前 Prompt 与全部活动                   |
| 流式 Assistant            | `assistant.delta`                  | P0       | rAF 合并，只有当前 Turn 更新                     |
| Thinking                  | `thinking.delta` / `ThinkingBlock` | P0       | 可折叠、可流式、历史稳定                         |
| Tool call/result/progress | tool events                        | P0       | 分组、状态、耗时和错误                           |
| Turn 边界与耗时           | `turn.started/ended`               | P0       | 对话按 Turn 呈现                                 |
| Approval                  | approval events + REST resolve     | P0       | Pending/Resolved/Expired                         |
| Question                  | question events + answer/dismiss   | P0       | 单选、多选、自由文本按协议呈现                   |
| Attachment                | `/files` + Prompt content          | P0       | 图片、视频、普通文件                             |
| Media 预览                | `AuthMedia`                        | P0       | 带 bearer 下载成 Blob URL                        |
| Markdown                  | GFM、代码、KaTeX、Mermaid          | P0       | 保留官方渲染并做性能预算                         |
| 文件路径链接              | 官方 `Markdown.vue` 已识别         | P0       | 保持蓝色；HTML 路由到内置浏览器                  |
| 本地图片引用              | 官方先解析再改写源文本             | P0       | 避免先 404 后替换的竞态                          |
| Conversation TOC          | `ConversationToc`                  | P0       | 长会话快速定位                                   |
| Compact                   | Session action / command           | P0       | 显示压缩标记和前后 token                         |
| Undo                      | Session action                     | P0       | 明确回退数量和结果                               |
| Cron notice               | `CronNotice`                       | P0       | 保留触发来源和时间                               |
| 声音与系统通知            | Web composables                    | P0       | 可单独关闭；桌宠状态同步                         |

实现状态：Attachment 已按固定 `0.29.0` 契约接入 `/files` 上传和 file-source/file-content Prompt；历史文件与媒体由 Main 添加 Bearer 后以 Blob 预览。Assistant 文本已支持 GFM、代码高亮、KaTeX、Mermaid 和 Workspace 文件路径点击，边界见 [ADR 0012](./adr/0012-attachment-media-and-markdown-boundary.md)。本地图片使用 Main 的 Session FS 受限读取（cwd 内、10 MiB、base64 二进制、未截断），远程 Markdown 图片默认不自动请求。Conversation TOC、Compact、Undo、Cron notice 与 transcript marker 已接入，边界见 [ADR 0013](./adr/0013-kimi-web-conversation-controls-and-local-image-boundary.md)；其中 Compact 的真实会话回归和 token 统计展示仍待补齐。

## 5. Agent、任务和运行模式

| 能力                  | 官方语义                         | 首版要求 | 说明                                             |
| --------------------- | -------------------------------- | -------- | ------------------------------------------------ |
| Model picker          | `/models`                        | P0       | 永远显示真实 alias/model，不能“未知模型”静默替代 |
| Thinking effort       | Model catalog efforts            | P0       | `off/on/low/high/max...` 按模型能力动态显示      |
| Permission mode       | `manual/auto/yolo`               | P0       | 默认 Manual                                      |
| Plan mode             | 独立 boolean                     | P0       | 不塞进 Permission 下拉框                         |
| Swarm mode            | Session profile / prompt         | P0       | 显示开启状态与成员活动                           |
| Goal                  | Goal Strip + control             | P0       | 创建、暂停、恢复、取消按上游能力                 |
| Todo                  | Tool/result projection           | P0       | 与 Task 分开展示                                 |
| Subagent/Swarm roster | subagent events                  | P0       | Detail Panel 可查看状态、输出、用量              |
| BTW side chat         | `startBtw` + agent-scoped prompt | P0       | 独立 Side Chat，不污染主 Turn                    |
| Background tasks      | `/tasks` + task events           | P0       | Running/Completed/Failed/Cancelled，支持取消     |
| Skills 列表与激活     | Session/Workspace skills         | P0       | Slash 菜单和设置入口                             |
| Slash commands        | `SlashMenu`                      | P0       | 与普通文本输入区分                               |
| Mention menu          | `MentionMenu`                    | P0       | 文件和能力 mention                               |
| MCP 状态              | `/mcp/servers`                   | P0       | 列表、状态、重启                                 |
| Tools 列表            | `/tools`                         | P0       | 用于诊断和能力展示                               |

实现状态：Session `/status`、真实 Model picker、模型能力相关 Thinking effort、Permission、Plan 与 Swarm 已接入；普通文本和浏览器批注 Prompt 均携带当前控制字段。Prompt Queue 已按官方边界区分可编辑/重排的本地 Draft 和 Kimi 已接收队列，见 [ADR 0011](./adr/0011-prompt-queue-local-draft-boundary.md)。`/tasks`、Goal 创建/读取/控制也已接入。Transcript 的 authoritative `todos` 会投影到 Changes 下半部的“计划”，并从已识别的 `todo_list` tool display 实时更新；后续 resync 以 Server 结果覆盖本地视图。BTW Side Chat 以官方 Web `:btw` 创建的 agent 为目标，通过同一 Session 的 `agent_id` Prompt 独立流式呈现，不污染主 Transcript，边界见 [ADR 0014](./adr/0014-kimi-web-btw-side-chat-boundary.md)。Agent roster 可打开只读 Detail Panel，按 Kimi `agent_id` Transcript 展示状态、独立输出和详细用量，且伪造 Agent ID 会在 Main 的 REST 调用前被拒绝，见 [ADR 0015](./adr/0015-kimi-agent-detail-transcript-boundary.md)。Workspace 添加/重命名/移除，以及 Session 搜索/分页/创建/改名/归档/恢复/Fork/Children/Export/warnings 已形成真实 Kimi 生命周期链路。逐项证据见 [P0 实现审计](./07-p0-implementation-audit.md)。

## 6. 文件、Git、Diff 与终端

| 能力                           | 官方接口/UI         | 首版要求 | 增强                           |
| ------------------------------ | ------------------- | -------- | ------------------------------ |
| 文件树                         | Session FS list     | P0       | 懒加载目录、Git 状态标记       |
| 文件读取/预览                  | Session FS read     | P0       | 文本、图片、二进制降级         |
| 文件模糊搜索                   | Session FS search   | P0       | 快速打开                       |
| 内容 grep                      | Session FS grep     | P0       | 结果按文件/行分组              |
| Git status                     | Session Git status  | P0       | branch、ahead/behind、增删统计 |
| 单文件 Diff                    | Session file diff   | P0       | 点击文件再加载，不批量预取     |
| Tool Diff                      | `ToolDiffPanel`     | P0       | 与 Workspace 当前 Diff 区分    |
| Changed Files                  | 右侧面板            | P0       | 独立滚动、宽度可调、支持键盘   |
| 文件下载                       | Session FS download | P0       | bearer 校验和路径边界          |
| Open / Reveal                  | Session FS actions  | P0       | IDE/Finder/内部预览路由        |
| Open in IDE                    | `OpenInMenu`        | P0       | 使用 Server 公布的 app 列表    |
| Terminal list/create/get/close | `/terminals`        | P0       | Session 绑定，多 Terminal      |
| Terminal stream/resize/input   | WS terminal frames  | P0       | PTY 只做终端，不作为 Kimi 协议 |

实现状态：文件区已使用 Kimi Session FS 的 `search`、`grep`、下载、`open`、`open-in` 和 `reveal`；搜索到的目录进入目录，HTML 文件仍统一路由到内置浏览器。下载内容只在 Main 通过原生保存对话框写入用户选择的位置，Renderer 不直接取得本机写入权限。Terminal 已提供中栏底部抽屉、多标签、创建/关闭、ANSI、输入、Resize、输出 replay、Session 切换 Detach 与 `⌘J`。Kimi `0.29.0` v2 服务端会静默丢弃已声明的 Terminal WS 帧，当前托管版本按 [ADR 0004](./adr/0004-kimi-v2-terminal-compatibility.md) 使用 Session cwd 约束的 Main PTY 兼容层；Agent 与 Transcript 路径没有降级。

## 7. Provider、Config 和设置

| 能力                  | 官方接口/UI        | 首版要求 | 说明                                      |
| --------------------- | ------------------ | -------- | ----------------------------------------- |
| Provider 列表/详情    | `/providers`       | P0       | 不从配置文件自行猜测                      |
| 添加/删除 Provider    | Provider Manager   | P0       | API key 只提交给 Kimi Server              |
| 刷新单个/全部模型     | provider actions   | P0       | 显示 added/updated/unchanged/failed       |
| Managed Provider 刷新 | OAuth refresh      | P0       | 登录后即时更新模型                        |
| 默认模型              | `/models/:default` | P0       | 与 Session model 分层                     |
| Global Config         | `/config`          | P0       | 依赖官方 merge semantics，secret redacted |
| Theme                 | Light/Dark/System  | P2       | 按当前产品决策不进入 P0                    |
| Language              | zh/en              | P0       | 初始支持官方两种语言                      |
| Notification/Sound    | Settings           | P0       | 独立控制                                  |
| Telemetry 开关        | Settings           | P0       | 尊重 Kimi 官方设置，不增加默认追踪        |
| Archived sessions     | Settings           | P0       | 浏览和恢复                                |

实现状态：Model/Provider/Auth/Config 已接入真实 Runtime，覆盖目录读取、默认模型、单个/全部/OAuth 模型刷新、Provider 添加、device-code 登录/轮询/取消/登出，以及 telemetry、默认 Permission/Plan、Skill merge 白名单设置。Kimi `0.29.0` v2 没有 Provider 删除 REST 路由，客户端按 [ADR 0005](./adr/0005-kimi-v2-provider-mutation-boundary.md) 禁止用遮盖凭据后的 Config 全量回写模拟删除；该项等待上游补齐。

## 8. 在官方基线上的新增能力

| 能力                     | 来源                                 |                        优先级 |
| ------------------------ | ------------------------------------ | ----------------------------: |
| 套餐用量 UI              | 官方 `/oauth/usage`，当前 Web 未接入 |                            P0 |
| 开发浏览器               | 产品增强                             |                            P0 |
| HTML 文件点击进浏览器    | 文件链接路由增强                     |                            P0 |
| HTML 画面批注并发给 Kimi | 产品增强                             | P1，技术 Spike 通过后并入首版 |
| 桌面宠物和多 Session 群  | 产品增强                             |                            P0 |
| Context 分级提醒         | 官方 status 数据的 UX 增强           |                            P0 |
| Turn 虚拟化和性能预算    | 可靠性增强                           |                            P0 |

实现状态：Browser、HTML 路由、元素/区域批注、Usage 与多 Session Pet 均已有打包态垂直切片。批注通过普通 Kimi Prompt 的 text + image content 提交，不新增协议；严格的 DOM-to-source 映射仍不承诺。

## 9. 版本兼容策略

1. 客户端声明一个经过验证的 Kimi 版本区间，例如 `>=0.29.0 <0.30.0`，而不是假设所有版本兼容。
2. 托管运行时默认锁定到已通过测试的 patch 版本；新版本先进入兼容 CI，再进入客户端更新通道。
3. 启动时读取 `/meta` 的 server version、backend 和 capabilities。
4. 开发/CI 中读取 `/openapi.json` 和 `/asyncapi.json`，对所需 route、schema 与 event 做快照差异检查。
5. 运行时对未知字段前向兼容，对未知事件记录一次去敏诊断；不得把未知关键事件当成普通文本。
6. 如果缺少 P0 capability，显示“运行时不兼容”，提供切回托管版本或打开系统版本设置；不退化到 PTY/`stream-json`。
7. 每次升级同步审查官方 Web 的 `KimiWebApi`、client、wire、projector、mapper、reducer 和可见组件。

## 10. 发布门禁

- 本表所有 P0 行都有实现映射、至少一项自动或手动验收记录。
- 官方 Web 的操作回归脚本在托管 Kimi 版本上全部通过。
- Permission/Plan/Swarm/Thinking 不出现错误映射。
- Snapshot/resync、Approval/Question、多 Session 并发通过断线恢复测试。
- Usage、Browser、Pet 三项增强不改变 Kimi Session 的事实源。
