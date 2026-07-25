# Main Workspace Design QA

- Source visual truth: `docs/assets/main-workspace-visual-baseline.png`
- Implementation: `http://127.0.0.1:4173/` (Vite renderer preview)
- Browser-rendered screenshot: `artifacts/design-qa/main-workspace-final.png`
- State: light theme, Changes tab active, right panel expanded, Composer settings closed, empty Composer
- Viewport: `1487 × 1058` CSS px, DPR 1
- Source pixels: `1487 × 1058`
- Implementation pixels: `1487 × 1058`
- Density normalization: none required; source and implementation have identical pixel dimensions and the browser capture used DPR 1

## Findings

No actionable P0, P1, or P2 mismatch remains in the current main-workspace slice.

The implementation preserves the selected direction and the written visual baseline:

- Full-width global top navigation, with project, branch, runtime, Context, and plan usage.
- Project-grouped task tree with quiet shortcut rows and a neutral active-task surface.
- Dominant continuous transcript with compact Thinking/Tool rows, blue file links, and a changed-files summary.
- Compact Composer with attachment, mention, command, model summary, one-click settings popover, and send action.
- Resizable/collapsible right extension panel with Changes, 项目文件, 浏览器, Diff, and plan progress.

## Required Fidelity Surfaces

- Fonts and typography: system sans and Chinese fallbacks match the intended macOS tool character. The implementation uses slightly tighter small-text sizing than the generated reference, but hierarchy, line height, truncation, and optical weights remain readable and intentional.
- Spacing and layout rhythm: the implementation follows the documented 280 px left rail, flexible center, and 382 px right rail rather than copying the generated image's inconsistent raw proportions. Main regions, compact Composer, dividers, radii, and vertical rhythm remain faithful to the approved baseline.
- Colors and visual tokens: pearl white, mist gray-blue, restrained cobalt, mint success, and coral diff tokens map to `docs/06-visual-baseline.md`. The implementation is intentionally flatter than the generated image so glass remains functional rather than decorative.
- Image quality and asset fidelity: the source contains no required product imagery or illustration. Phosphor icons are used consistently; no custom inline SVG or placeholder raster asset replaces a required source asset. Native macOS traffic lights are absent only in the browser preview and are supplied by Electron's `hiddenInset` title bar in the desktop shell.
- Copy and content: static navigation labels follow the visual baseline. Transcript, filenames, diff, plan, time, and usage values are realistic development data and are designed to be replaced by Kimi state.
- Accessibility: semantic buttons/tabs, named Composer controls, focus rings, reduced-motion handling, higher-contrast token overrides, and no color-only project grouping are present.

## Primary Interactions Tested

- Collapsed the right extension panel and restored it through the visible “展开扩展栏” control.
- Switched from Changes to 项目文件 and verified the file tree.
- Switched to 浏览器 and verified the browser empty/launch state.
- Opened the Composer settings popover and verified Permission is available without exposing all controls by default.
- Entered and submitted a task through the Composer; the submitted turn appeared with an “已排队” state.
- Browser console checked after interaction: 0 warnings, 0 errors.

## Approval / Question State QA

- Electron dev fixture: `?interaction-fixture=1`; fixture code is development-only and does not replace Kimi snapshot/event state in production.
- Viewport: `1470 × 923` CSS px; one Approval card and one Question card rendered between Transcript and Composer.
- Approval actions remain visible without expanding the Composer: 拒绝、本会话允许、允许一次。
- Question state shows a recommended single-select option, descriptions, an Other input and submit/dismiss navigation using the same quiet glass vocabulary as the baseline.
- Measured interaction dock: `757 × 424.6` px; Composer: `757 × 95` px; document horizontal overflow: `false`.
- Component tests cover the exact Approval response shapes, duplicate-submit blocking, recommended Question defaults, multi-with-other answer construction and dismiss behavior.

## Tool / Thinking State QA

- Electron dev fixture: `?activity-fixture=1`; production builds remove the fixture data.
- Viewport: `1470 × 923` CSS px; Thinking and Tool rows render in the same ordered content stream as surrounding assistant text.
- Collapsed state keeps both rows at 45 px minimum height; running Tool progress is visible as a 2 px low-interference line.
- Expanded Tool state exposes bounded input and output panels with stream labeling while keeping the Composer and right extension panel stable.
- Measured state: two Activity blocks, one expanded block, two detail sections, `64%` progress and no document horizontal overflow.
- Component and projector tests cover Thinking expansion, progressbar semantics, stderr presentation, every pinned Tool display variant, authoritative result-message reconciliation, monotonic terminal state, raw/durable stream overlap, subagent isolation, bounded/redacted previews and both repeated-start/direct-delta retry recovery.

## Responsive Evidence

- `1024 × 800`: no horizontal overflow (`scrollWidth = 1024`); left project rail remains visible and the right extension panel becomes an overlay.
- `900 × 760`: no horizontal overflow (`scrollWidth = 900`); left project rail collapses and the right extension panel remains an overlay.

## Files / Changes / Diff State QA

- The right panel now consumes authoritative Kimi Session `fs:list`, `fs:read`, `fs:git_status`, and `fs:diff` results instead of local Changed Files and file-tree fixtures.
- Directory and Session switches use generation guards, so late Files/Git responses cannot overwrite the newly selected Session.
- Text preview is capped at 400 rendered lines; Diff is capped at 600 rendered lines and fetched only after file selection. Binary content is stripped in Main before it reaches Renderer.
- Path validation rejects absolute paths, traversal, NUL, drive paths, UNC paths, and oversized input before invoking Kimi.
- Component tests cover Git/Diff rendering, typed directory/file routing and binary degradation. Real managed-runtime integration covers list/read plus the official non-Git `40908` boundary.

## Session Terminal State QA

- Terminal 使用中栏底部抽屉，不新增右栏一级标签；`⌘J` 与 Composer Terminal 图标可打开，收起后不影响三栏状态。
- `1488 × 1040` 浏览器布局测量：Conversation `821 × 982`、Transcript `821 × 519.4`、Terminal `821 × 353.6`、Composer `821 × 109`，所有区域均在工作台高度内；控制台 0 warning / 0 error。
- xterm 提供真实 ANSI、光标、键盘与 resize；多标签输出按 Terminal ID 分流，重复 seq 不重放，Session 切换 Detach 旧流。
- 组件测试覆盖 list/attach/output dedupe/exit/create/close/Session switch；真实 Runtime smoke test执行固定 `printf`，验证 PTY 输入和 marker 输出后关闭。
- Kimi `0.29.0` v2 上游 WS Terminal 帧缺少服务端分发，兼容方案与退出条件记录于 ADR 0004；Agent 协议仍只使用 Kimi REST/WS。

## Browser / HTML Route QA

- Browser 仍位于右栏第三个一级标签，不改变已确认的三栏信息架构；HTML 文件链接进入 Browser，其他文件继续进入项目文件预览。
- `1280 × 720` 浏览器 fixture 实测：Browser panel `381 × 576`、Preview surface `361 × 150`、Diagnostics `361 × 124`；panel `scrollHeight === clientHeight`，文档无水平溢出。更高的桌面窗口会把新增高度优先分配给 Preview surface。
- 地址栏、Back/Forward、Reload/Stop、普通 HTTP(S) 页面外部打开、桌面/平板/手机/自定义视口、视口/整页截图在一行半的紧凑工具区内保持可操作；能力化 Workspace Preview 固定留在内置 Browser，避免把 capability 交给系统浏览器。手机预设实测收敛为 `390 × 844`。
- Console 和 Network 使用同一底部 Diagnostics 区；Network 行与安全详情可在不覆盖 Preview surface 的情况下展开。fixture 实测 2 条 Console、2 条 Network 和 request/response/body 详情，无布局溢出。
- Browser guest 使用 Main 管理的 WebContentsView；Renderer DOM 中不存在 `<webview>`。Settings 打开、右栏折叠或切换标签时 detach 原生 View，避免覆盖 Renderer 弹层，返回后保留页面。
- packaged Browser smoke 验证 Node globals 不可用、popup 拒绝、HTML/绝对静态资源、Console/Network、URL/Header secret 脱敏、页面回显 location/hostname 时看不到 capability、Main 注入 capability header 在详情中固定为 `[redacted]`、小正文、视口模拟、截图和 `file://` 拒绝。
- Preview Server 单元测试覆盖 loopback capability、受限构建发布根、dotfile/credential 拒绝、绝对静态资源、traversal、错误 Host 和 symlink escape；Browser IPC 输入测试覆盖 URL、credentials、bounds、viewport、Workspace scope 与 request ID，截图预算测试覆盖 device scale factor。

## Usage QA

- 顶部套餐指示读取最紧张的权威限制窗口，Context 只读取当前 Session；两者不相加。
- `⌘⇧U` 与顶部两个 Usage pill 都能开关同一弹层；弹层明确标注“准实时轮询”、更新时间与 `/oauth/usage` 数据源。
- `1280 × 720`：弹层宽 390 px，坐标 `x=871, y=54.5`；`1024 × 720`：`x=615, right=1005`。两种视口文档 `scrollWidth === innerWidth`、`scrollHeight === innerHeight`；新增 Cost/Turns 行受 `max-height` 和内部滚动约束，不会扩张页面。
- 层级检查中弹层中心命中 `.usage-detail-row`，不会再被右栏 Changes 覆盖；Console 0 warning / 0 error。
- 套餐、Extra Usage、Session Input/Output/Cache 与 Context 使用分区呈现；失效状态保留最后成功值，不渲染伪 0%。

## Comparison History

### Iteration 1

- Earlier finding: `[P2]` At widths between 921 and 1180 px, keeping both fixed side rails in the grid could compress the center transcript below a practical reading width.
- Fix: changed the responsive grid to keep the center fluid and move the right extension panel to an absolute overlay below 1180 px; below 920 px, the left project rail also collapses.
- Post-fix evidence: browser metrics at `1024 × 800` and `900 × 760` report no horizontal overflow, and the intended sidebar/overlay states are active.

## Focused Region Comparison

No additional crop was required: both source and implementation were opened together at identical `1487 × 1058` dimensions, and the left task tree, Composer, extension tabs, Diff, and plan list were legible in the full-view comparison. Interaction-only states were verified directly in the browser rather than inferred from the static screenshot.

## Follow-up Polish

- `[P3]` Revisit the final glass opacity after testing inside the real Electron vibrancy surface; browser rendering cannot reproduce macOS window material exactly.
- `[P3]` Tune small-label weight and icon optical alignment after the final app font and icon subset are frozen.
- `[P3]` Complete a visual pass for the real Files/Changes/Diff states after macOS is unlocked; automated layout/component verification is green, but the latest live Electron capture is still pending.
- `[P3]` macOS 解锁后补一张真实 Electron + xterm 输出截图；浏览器布局和真实 Runtime I/O 已分别验证。
- `[P3]` Replace the remaining Browser demo surface when its authoritative adapter lands; Transcript, interactions, Files, Changes and Diff are connected to Kimi state.

## Skills / MCP / Agents State QA

- 视口 `1280 × 720`；设置 Dialog `920 × 652`，内容区 `740 × 596`。Skills 与 MCP/Tools 页面均无横向或纵向内容溢出，左侧六项设置导航完整可见。
- Skills 页面显示 Session 作用域目录、source 和“仅用户调用”语义；Composer `/` 菜单在 `390 × 150` 的有界浮层内展示同一目录，选择 `/review` 后输入框得到 `/review `，提交路径由 typed Skill activation IPC 接管。
- MCP/Tools 页面显示 transport、连接状态、工具数量、错误与 Kimi 原生重连入口；Tool 明确区分 builtin/skill/mcp、所属 Server 和有效/禁用状态。
- Agent roster 位于 Conversation 下方、Composer 上方，不新增右栏标签。`1280 × 720` 展开态高度 `140.8 px`，Conversation、Transcript、roster 与 Composer 均保持在工作台内且无文档横向溢出。
- 展开 roster 可查看 Subagent 类型、swarm 序号、状态、输出摘要与 token usage；main Agent 不重复显示为 Subagent 行。
- 本轮内置浏览器交互后控制台 0 warning、0 error。

final result: passed

---

# Design Color Re-alignment (feat/design-color-alignment)

- Source visual truth: `docs/assets/main-workspace-visual-baseline.png`（即需求中提供的设计图）.
- Implementation: `http://127.0.0.1:5173/` (Vite renderer preview), viewport `1487 × 1058`.
- 采集脚本： `node artifacts/design-qa/shots.mjs <prefix>`（Playwright 无头截取主界面与各 fixture 状态）。
- Before: `artifacts/design-qa/baseline-before.png`; After: `main-workspace-after.png` 及 `*-after.png` 状态图。

## 本轮改动范围

仅颜色/背景/聚焦态；三栏排版、栅格、字号与功能一律未动。

- 全局 token：窗口底色改为 `#f6f9fc` 珍珠白族；`--border/--border-strong` 由蓝灰 rgba 改为中性 `rgba(15, 23, 42, …)`；主蓝 `#2563eb → #3085fa`（对齐设计图发送按钮/进度条采样 `#3085fa`）；成功绿 `#16a36a → #43a047`（对齐设计图状态点 `#2fb031` 与计数 `#5ab159` 的色相）。
- 表面材质：侧栏/右栏/顶栏/设置等由半透明玻璃改为近实心珍珠面；会话区 `#f7fafd`；Thinking/Tool 卡 `#f2f7fb`；Changed Files、Diff、计划、Composer、Popover、交互卡统一白底 + 中性 1px 边。像素采样对齐：sidebar `(246,249,252)`、chat `(247,250,253)`、topbar `(248,250,253)` 与设计图完全一致。
- 选中态：项目/任务选中行由蓝灰改为珍珠蓝灰 `#eaf1f8/#e7eef7`；Hover 统一 `rgba(15, 23, 42, 0.045)`。
- 修复：补齐未定义即被引用的 `--ink/--ink-soft/--ink-faint/--mono` 变量（此前 `var(--ink)` 等声明在计算值阶段失效、仅靠继承兜底）。
- 输入框聚焦：新增统一 `--input-focus-border` 与 `--focus-ring`；Composer 容器 `:focus-within` 蓝色描边 + 光晕（并移除内部 textarea 的重复聚焦环）；会话搜索、树内联重命名、Runtime 连接、偏好设置数字/下拉、Provider 表单、Composer 设置浮层 select、Question Other 输入、浏览器批注输入、侧栏聊天输入等全部补齐/统一聚焦样式；新增全局 `::selection` 选区色。
- 侧栏 BTW 发送按钮由灰蓝 `#5378b7` 统一为主蓝。

## 保留项（刻意不动）

- 用户消息仍为右对齐浅蓝气泡（设计图为左对齐纯文本，但属排版结构差异，按要求保持现状）。
- Pet 桌宠与 xterm ANSI 配色不参与本轮对齐（视觉基线第 10 节明确桌宠不在主工作台验收范围）。
- Changed Files 行首仍用线性文件图标，未替换为设计图的彩色扩展名徽标（涉及模板结构，非颜色范畴）。

## 验证

- `vue-tsc -p tsconfig.web.json` 通过（渲染层零 TS 错误）。
- `pnpm test`：302 passed / 1 failed；唯一失败 `tests/runtime/externalRuntime.test.ts` 源自工作区并行改动的 `src/main/runtime/KimiRuntimeManager.ts`（`connectExternal` 引用未定义 `meta`），与本轮样式改动无关。
