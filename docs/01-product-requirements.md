# Moon Code 产品需求文档

## 1. 产品定义

Moon Code 是 Kimi Code 的本地桌面工作台。它保留 Kimi Code Web 的全部用户能力，在此基础上提供更高密度的 Codex 风格桌面 UI、开发浏览器、HTML 画面反馈、桌宠多 Session 状态以及套餐用量监控。

“Codex 风格”只描述视觉布局和交互模型：Workspace/Session 导航、Turn 式对话、Changes 面板、任务状态和桌宠。运行内核、Session、Prompt、审批、工具及协议均来自 Kimi Code。

## 2. 已确认约束

- 首发 macOS，技术栈为 Electron + Vue 3。
- 默认使用客户端托管并验证过的 Kimi Code 版本；设置中可切换到系统 `kimi`。
- 通过 `kimi web --port 0 --no-open` 启动官方本地服务，使用 REST + WebSocket。
- 不使用 Codex 协议、ACP 或 PTY 文本解析作为 Kimi 主通道。
- 不直接修改 `~/.kimi-code/config.toml`、OAuth 凭据或 Session 文件。
- 不在应用数据库中复制 Kimi 消息和 Session。
- 默认 Permission 为 `manual`；`permission_mode` 与 `plan_mode` 是两个独立控制。

## 3. 用户要完成的核心工作

1. 打开代码目录，在一个或多个 Kimi Session 中持续工作。
2. 在不丢失上下文的情况下切换 Session，并知道哪些仍在运行或等待自己。
3. 阅读 Thinking、工具调用、Diff、文件和终端结果，完成审批和问题回答。
4. 点击对话里的文件路径立即查看文件；点击 HTML 或 localhost 链接立即查看页面。
5. 在内置页面中调试 Console/Network，并把视觉问题准确反馈给 Kimi。
6. 离开主窗口后，通过桌宠继续感知任务进度，点击回到准确 Session。
7. 随时看到 Kimi 套餐、Extra Usage、当前 Session token 和 Context window。

## 4. 首版范围

### P0：没有就不能发布

#### KAD-CORE-001 Kimi Web 全功能对等

- 以 Kimi Code `0.29.x` 官方 Web 的可见功能为最低基线。
- 每次 Kimi 运行时升级都运行功能对照和契约测试。
- 任何未实现的上游功能必须在开发期显式失败，不能静默丢弃事件或控件。
- 详细清单见 [Kimi Web 功能对照表](./02-kimi-web-parity.md)。

#### KAD-CORE-002 原生 Session 和 Workspace

- Workspace 和 Session 列表直接来自 Kimi Server。
- 支持新建、选择、搜索、重命名、归档、恢复、Fork、导出和警告展示。
- 选择历史 Session 后可直接继续 Prompt，无额外“导入到客户端”步骤。
- Session 在其他 Kimi 客户端或同一 Server 连接中变化时，UI 自动同步。

#### KAD-CORE-003 完整对话和交互

- 流式文本、Thinking、工具调用、工具进度、结果、错误和警告完整渲染。
- 支持 Prompt Queue、Steer、Abort、Compact、Undo。
- 支持 Approval、Question 和超时/失效状态。
- 支持附件、图片、视频、文件和本地图片安全加载。
- 支持 Model、Thinking、Permission、Plan、Swarm、Goal 等原生控制。

#### KAD-CORE-004 文件、Diff、Git 与 Terminal

- 文件树、读取、搜索、grep、Git 状态和单文件 Diff。
- 文件可在客户端预览，也可在 Finder/IDE 中打开或定位。
- Terminal 与 Session 绑定，支持创建、恢复、调整尺寸和关闭。
- 大文件、二进制和大 Diff 必须有硬上限与清晰降级。

#### KAD-BROWSER-001 内置开发浏览器

- 地址栏、前进、后退、刷新、停止、外部打开。
- 一键打开 Workspace 内 `.html` 文件；对静态文件自动通过安全本地预览服务器访问，不使用 `file://`。
- 自动发现或手动添加 `localhost` 开发服务。
- 桌面/平板/手机常用视口尺寸和自定义尺寸。
- Console：日志级别、时间、来源、清空、搜索。
- Network：请求状态、方法、耗时、类型、大小、Header 及正文的安全预览。
- 页面截图，包括当前视口和完整页面（若 Chromium 能安全完成）。
- 浏览器与 Kimi Agent 的权限边界明确；首版不允许 Agent 无提示操作登录态页面。

#### KAD-PET-001 桌面宠物

- 首版定位为“桌面上的 Session 状态入口”，不把角色美术、复杂动画或玩法作为核心交付。
- 透明、无边框、置顶；支持基本拖拽即可，吸附等窗口体验不阻塞首版发布。
- 至少能清楚区分运行中、等待处理、完成/失败和断线；可以使用颜色、文字或简单动画，不要求完整动作集。
- 每个可见宠物绑定一个真实 Kimi Session ID，而不是客户端复制会话。
- 单击宠物：打开并聚焦主窗口，进入绑定的 Workspace/Session，定位到最新待处理卡片或最后一轮。
- 应用未打开或主窗口已关闭时，单击仍能启动/恢复 App 并完成同一条精确跳转链路。
- 多个活跃 Session 可以组成桌面“宠物群”；展示数量和折叠样式属于体验优化，不能影响 Session 绑定准确性。
- Waiting（Approval/Question）和 Failed 的优先级高于普通 Running。
- 敏感审批不能直接在桌面宠物上一键同意；点击后回主窗口处理。

首版验收优先级固定为：正确 Session 绑定与跳转 > 状态准确 > 窗口可用性 > 视觉表现与附加玩法。

#### KAD-USAGE-001 套餐与 Context 监控

- 套餐：显示 summary、各限制窗口、已用/上限、reset hint。
- Extra Usage：余额、本月已用、月度上限和币种。
- Session：输入、输出、缓存读取、缓存创建、估算成本（上游有数据时）。
- Context：当前 token、最大 token、百分比和 Compact 引导。
- 套餐数据活动窗口每 30 秒刷新，后台每 60 秒刷新；Prompt 完成、应用获得焦点和网络恢复后立即刷新一次。
- 50%、80%、95% 阈值可配置；默认只在 80% 和 95% 发通知，避免噪声。
- 明确标注“套餐数据为准实时轮询”，不能伪装为服务端推送。

#### KAD-PERF-001 长会话稳定性

- 以 Turn 为单位虚拟化历史；仅流式 Turn 参与高频响应更新。
- 快速 token 事件每 animation frame 合并一次。
- 1000 个 Turn 的基准 Session 可打开、滚动、搜索和继续对话。
- 用户向上阅读时，新 token 不抢夺滚动位置；回到底部后恢复跟随。
- Mermaid、KaTeX 和高亮不得阻塞主 UI；重内容应 worker 化或按预算降级。

#### KAD-SEC-001 默认安全

- Electron Renderer 开启 context isolation 和 sandbox，关闭 Node integration。
- 浏览页面在独立 `WebContents` 和独立 session partition 中运行。
- Kimi Server bearer token 只保存在内存；若必须持久化则使用 macOS Keychain。
- 本地预览服务器仅绑定 loopback，使用随机 token 和严格路径根。
- 外部 URL、下载、权限、弹窗、新窗口、协议跳转均由主进程策略控制。
- 默认 Permission 为 Manual；首次切换 Yolo 必须有明确说明。

### P1：首版尽量包含的差异化能力

#### KAD-ANNOTATE-001 HTML 画面批注

- 开启“批注模式”后，鼠标经过页面元素时显示边界高亮。
- 用户可选择 DOM 元素或拖拽矩形区域，填写文字反馈。
- 每条批注至少包含：页面 URL、视口、截图或裁剪图、文字、元素标签/可访问名称、稳定选择器候选、屏幕坐标。
- 发送前显示完整预览，用户可删除敏感字段或截图。
- 发送时转成普通 Kimi Prompt 内容：结构化文本 + Kimi 官方图片/文件附件，不需要新协议。
- 页面导航或 DOM 变化后若定位失效，仍保留截图和文字，不阻塞发送。
- 跨域 iframe 首版只允许批注 iframe 外框，不能承诺访问其内部 DOM。

### P2：后续能力

- 桌宠个性化：原创角色精修、完整动作集、安静模式、尺寸、显示屏幕、停留时长、最大宠物数和可扩展宠物包。
- Windows/Linux 正式发行。
- Agent 在浏览器中点击、输入、检查页面的受控操作模式。
- Worktree 创建、隔离、对比和生命周期管理。
- 手机/远程 Web 访问主桌面实例。
- 团队共享、云同步和跨设备 Session 跳转。

## 5. 明确不做

- 不做通用 Claude/Codex/Gemini/OpenCode 聚合器。
- 不支持 Codex 协议，也不把 Kimi 事件转译成 Codex 事件。
- 不用 PTY 屏幕文本判断 Agent 状态。
- 不复制 Kimi 的聊天记录到 SQLite。
- 不为“方便”读取或覆写 Kimi OAuth token、credentials 或全局配置。
- 首版不自动创建、删除 Git Worktree。
- 不复制 Codex 宠物图像、名称或品牌资源。

## 6. 关键交互验收

### 场景 A：从文件到页面

1. Kimi 回复中出现 `dist/index.html`。
2. 路径以蓝色文件链接显示。
3. 单击后在右侧开发浏览器打开，而不是调用系统浏览器。
4. Console 和 Network 可展开；Session 和对话不丢失。
5. 用户添加两条画面批注并发送，Kimi 收到两张裁剪图及结构化说明。

### 场景 B：多个后台 Session

1. 用户启动三个 Session，随后关闭主窗口。
2. 桌面出现三个对应宠物，两个 Running、一个 Waiting。
3. Waiting 宠物有明显但不闪烁的提示。
4. 单击 Waiting 宠物，应用进入正确 Session 并聚焦 Approval/Question 卡片。
5. 完成的宠物播放一次完成动作，按设置停留后收起。

### 场景 C：套餐接近上限

1. 套餐接口返回某窗口使用率 82%，含 reset hint。
2. 应用顶部和用量弹层显示准确百分比、重置时间和数据更新时间。
3. 系统只产生一次 80% 阈值通知；后续轮询不重复轰炸。
4. Extra Usage 与套餐限额分开展示。

### 场景 D：客户端或 Server 重启

1. 某 Session 正在运行时客户端崩溃或退出。
2. 重启后客户端从 Kimi Snapshot 与 cursor 恢复，而不是读取本地消息副本。
3. 对 WS gap、epoch 变化或 resync 要求执行 snapshot → seed → subscribe。
4. 桌宠重新绑定到真实忙碌 Session，不产生幽灵 Session。

## 7. 成功指标

首版 Beta 以可观察体验和可靠性为主：

- 官方 Web 对照表 P0 项覆盖率 100%。
- 运行中 Session 的状态变化到桌宠反馈，局域机 p95 小于 500 ms。
- 从宠物点击到正确 Session 可交互，p95 小于 1.5 s。
- 套餐数据刷新成功率大于 99%（不含上游接口不可用），错误有最后更新时间和重试状态。
- 1000 Turn 测试 Session 不崩溃，滚动过程无持续主线程长任务。
- 200 MB 二进制出现在 Git 状态中时，不读取成文本 Diff、不导致内存随文件体积线性增长。
- 版本不兼容时阻止危险操作并给出可理解的升级/切换方案，不能静默降级到 `stream-json`。

## 8. 尚不阻塞设计的问题

- 正式产品名和原创宠物形象。
- 商业发行时的自动更新、签名账号和隐私政策。
- 自定义宠物包是否公开为第三方格式。
- 套餐提醒默认阈值是否根据真实用户反馈调整。
