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

---

# UI Polish Fixes (fix/ui-polish-issues)

- Base: `main` (`555762a`)；分支 `fix/ui-polish-issues`。
- 验证环境：`http://127.0.0.1:5173/`（Vite 预览），viewport `1440 × 900`；脚本 `artifacts/design-qa/shots-fixes.mjs` 等。

## 本轮修复

1. **侧栏"三个点"菜单飞到角落**：`:style="menuPosition"` 绑定的是裸数字，Vue 不会自动补 `px`，CSSOM 视为非法值整体丢弃 → 菜单回退到样式表 `right:0/top:29px` 固定在窗口角落。修复为显式 `px` 字符串，并将 `menuWidth` 与 CSS 实际宽度（146px）对齐。验证：触发按钮 rect `(237,237.5)`，菜单现锚定 `(116,269)`（紧贴按钮下方）。截图 `fix1-menu-after.png`。
2. **右栏不再默认展开 Diff**：移除 `useRuntimeBridge.refreshWorkspaceContext` 中"自动加载首个变更文件 Diff"的逻辑，Diff 面板只在用户点击 Changed Files 行时打开。
3. **Composer 自适应高度 + 顶边拖拽**：新增 `resizeTextareaToContent()`（input/loadDraft/选择引用/窗口 resize 时触发），高度随内容增长，上限 `max(96px, 50vh)`；删除右下角拖大手柄（模板 + CSS + `.composer-actions` 的让位 padding），改为顶部边条 `.composer-top-resize`（hover 显示抓手，向上拖拉高，支持 ArrowUp/Down 键盘微调）。验证：16 行 → `327px`，80 行 → `450px`（恰为 50vh 封顶）。截图 `fix3-composer-*.png`。
4. **套餐用量弹窗中文化**：新增 `resetHintLabel()` 将服务端英文提示（如 `resets in 5d 20h 5m`）转为 `5 天 20 小时 5 分钟后重置`（无法识别时原样透传，中文提示不受影响）；`usageWindowLabel()` 补 `Plan usage`→`套餐总量`、`daily/weekly/monthly`→`每日/每周/每月窗口`。新增测试锁定该行为（`topBarUsage.test.ts`）。截图 `fix4-usage-popover.png`。
5. **项目文件搜索框样式**：输入框与按钮改为统一外壳（form 持边框与 `:focus-within` 聚焦环，内部 input 无边框、禁用原生 search 取消按钮与重复 ring），提交按钮由文字改为内嵌图标（`PhMagnifyingGlass` / `PhTextT`，含 aria-label）。修复此前聚焦环被 `border-right:0` 截断、图标按钮外凸为独立方盒的问题。截图 `fix5-search-focus.png`。

## 验证

- `pnpm typecheck` 通过。
- `pnpm test`：304 passed / 2 skipped / 0 failed。
- 备注：fixture 状态下 Composer 为禁用态，自适应验证通过真实 `input` 事件驱动（与真实键入同路径）；`fill()` 在该状态下不会触发 Vue 重渲染，属测试环境差异。

---

# Follow-up: Usage Pill / Image Paste / Turn Aggregation (fix/ui-polish-issues)

## 本轮改动

1. **套餐用量展示策略调整**：顶栏胶囊按钮恢复显示服务端英文原文（如 `resets in 5d 20h 5m`）；弹窗内部保持全中文（`resetHintLabel` 翻译 + 窗口标签中文化）。测试 `topBarUsage.test.ts` 锁定"胶囊英文 / 弹窗中文"两种形态。
2. **会话框支持粘贴图片**：textarea 新增 `@paste` 处理——剪贴板含 `image/*` 项时优先作为附件上传（阻止文本粘贴回退），经新 IPC `attachments:paste` → 主进程 `validatePastedAttachment`（仅 image、≤10MB、字节校验）→ `KimiRestClient.uploadFile` 上传 Kimi。粘贴的图片显示在输入框**上方的附件 chips 行**（与文件选择器附件同一位置，图片附件用 PhImage 图标区分），命名 `粘贴截图-YYYYMMDD-HHmmss.png`，可单独移除、随消息一起发送。纯文本粘贴行为不变。测试 `composerPaste.test.ts`。
3. **同一轮 Kimi 多段输出聚合**：CLI 在一轮回答里会拆出多条 assistant 消息（Thinking/工具卡分散在多个 "Kimi" 气泡）。`workbench.hydrateTranscript` 改用 `groupTranscriptTurns`：连续的 assistant 消息聚合为一个 Kimi 回合（保留首条消息的 id/时间；遇用户消息或 cron/compaction 来源标记另起回合；首条为 Tool 角色时合并后作者纠正为 Kimi）。纯展示层聚合，不动上游 projector。测试 `workbench.test.ts` 更新 + 新增聚合用例。

## 验证

- `pnpm typecheck` 通过。
- `pnpm test`：307 passed / 2 skipped / 0 failed（新增 3 用例：图片粘贴 ×2、回合聚合 ×1；更新 2 用例：trailing thinking、usage pill）。

---

# Round 5: Composer Rework / Sidebar New-task / Usage Bars / Browser Overlay / Plan Card (fix/ui-polish-issues)

## 本轮改动

1. **Composer 重做**：
   - 高度自适应改为纯 CSS `field-sizing: content`（`min-height:96px; max-height:50dvh`），删除上一版全部 JS 高度管理（`composerHeight` ref、`resizeTextareaToContent`、`startInputResize`、window resize 监听）与右下角/顶边拖拽手柄——用户反馈 JS 方案真实键入路径下不生效且拖拽功能不再需要。独立 HTML 环境实测：空 96px → 10 行 208px → 60 行封顶 300px（等比 50dvh）。
   - "目录 / BTW / 会话操作"三个按钮从 textarea 右上角悬浮位移到底部工具行（`.composer-primary-tools` 末尾，带左侧细分隔线），消除内容多时的重叠 bug；`.conversation-toc` 弹层定位祖先改为 `position:relative` 的静态容器，仍向上弹出。
   - 模型按钮右侧新增思维强度 chip（`model-effort-chip`，蓝底胶囊，显示 低/中/高 等）。
2. **项目行"新建任务"外置**：`.project-action-area` 在"三个点"右侧新增 PhPlus 按钮（hover 才显示，与三个点同机制；容器改 `grid-auto-flow:column` 避免竖排），点击 emit `createSession(project.id)`。测试 `projectSidebar.test.ts` 新增用例。
3. **套餐弹窗进度条**：每条限额行新增全宽 `.usage-detail-track`（行容器改 `flex-wrap:wrap`），绿色系区别于上下文弹窗的蓝条；`usageTone` 达 warning/critical 阈值时转琥珀/红。胶囊按钮保留英文 resetHint 不动。
4. **右侧栏浏览器三功能修复（核心）**：排查结论——批注/窗口截图/框选链路全部已实现，用户感知"没实现"的根因是**原生 WebContentsView 永远合成在 DOM 之上**，批注编辑弹层/截图预览/"N 条批注"按钮虽创建成功却被浏览器画面完全盖住。修复：新增 overlay 机制——渲染端 `BrowserPanel` 计算 `overlayOpen`（有批注草稿或截图预览打开、且非选择中）→ emit `overlay` → 新 IPC `browser:set-overlay` → 主进程 `KimiBrowserManager.setOverlayOpen()` 暂时把 guest 从窗口摘下（`#detach`，页面不销毁），弹层关闭后 `#attachIfNeeded` 挂回；guest 隐藏期间 surface 显示"页面已暂时隐藏"提示。附带修框选拖到 webview 外松开卡 dragging 的 bug（`mousemove` 检测 `buttons===0` 复位）。测试 `browserPanel.test.ts`（overlay emit ×2）+ `browserBridge.test.ts`（setOverlay 路由）。
5. **计划卡片改版**（纯 CSS）：条目字号 10px→11.5px 并允许折行（原 nowrap 截断）；状态文字改彩色小 chip（完成绿/进行中蓝/待办灰）；右上"4/4"大数字改小号灰底胶囊；行间距加大。

## 验证

- `pnpm typecheck` 通过；`pnpm test`：320 passed / 2 skipped / 0 failed（更新 `composerSkills.test.ts` 高度断言为"无内联高度+无拖拽手柄"）。
- 截图：`r5-composer.png`（按钮已在底行）、`r5-project-row.png`（新建任务外置）、`r5-usage-popover.png`（绿/琥珀进度条）、`r5-plan-card.png`（新样式）。fixture 无套餐/todo 数据，两者用静态 DOM 注入验证 CSS；组件 wiring 由单测覆盖。
- 备注：fixture 下 composer 禁用且 controls 为 null，思维强度 chip 与真实键入拉高需在真实会话复核；浏览器 overlay 的遮挡解除效果涉及原生视图，dev 环境无法截图验证，依赖代码路径与单测。

---

# Round 6: TOC Rail / Composer Cleanup / Context-card Actions / Clickable Inline Paths (feat/convo-toc-rail)

## 本轮改动

1. **会话目录改为左侧 Codex 式刻度轨**（`ConversationPane.vue` + `.toc-rail/.toc-tick` CSS）：每个 user 回合一枚刻度，悬浮于会话区左缘（不占布局宽度）；刻度纵坐标 ∝ 回合在全文的位置（`contentTop/scrollHeight × railHeight`），长度 ∝ 回合高度（clamp 6–15px）；当前视口回合的刻度加长高亮（`is-active`，蓝）；点击平滑滚动到对应回合，title 显示回合摘要。测量由 ResizeObserver + window resize + 内容流式 watcher 驱动。注意点：tick 用透明 border 扩大点击区，必须 `box-sizing: content-box`（全局 border-box 会把 2px 背景区压没，第一版截图实测不可见后修复）。原"目录"弹层按钮删除。
2. **会话框不再携带"目录 / BTW / 会话操作"**：ComposerBar 移除 `session-actions` slot，ConversationPane 移除整块工具组及相关脚本（tocOpen/compactInstruction/conversationActionMenu/requestCompact/Esc 处理与 compact/undo/startSideChat emits）；CSS 清理 `.composer-session-actions`、`.conversation-tool-button`、`.conversation-action-menu/popover`、`.conversation-toc` 及 640px 媒体查询。
3. **压缩上下文 / 撤销上一轮移入顶部上下文卡**（TopBar `context-popover` 新增"会话操作"区：压缩说明输入 + 两按钮；新 props `sessionReady/promptRunning/hasTurns/conversationActionPending`，新 emits `compact/undo`，App 接线同一组 handler）。**BTW 侧边会话移到左侧任务树"三个点"菜单**（仅当前活动会话可见，bridge 侧对重复开启本就幂等）；SideChatPanel 本体不变。
4. **Kimi 回复里的文件路径可打开**：根因是 CLI 回复习惯用行内代码写路径（如 `` `app/index.html` ``），此前 `code_inline` 只加样式不生成链接，点击无响应。现在 `installFilePathLinks` 给匹配的行内 code 写入 `data-workspace-path`，`onClick` 处理 `code.markdown-file-inline` 点击（HTML 仍由 `workspaceFileDestination` 路由到浏览器预览）；加指针/下划线 hover 样式与"点击打开文件"title。

## 验证

- `pnpm typecheck` 通过；`pnpm test`：324 passed / 2 skipped / 0 failed（重写 `conversationControls.test.ts`：删会话操作用例、加刻度轨布局/跳转用例（attachTo + 模拟布局指标）；新增 TopBar 压缩/撤销、侧栏 BTW 菜单、行内代码路径点击用例）。
- 截图：`r6-toc-rail.png`（左缘蓝色刻度）、`r6-context-popover.png`（会话操作区，fixture 下按钮禁用为正确态）、`r6-session-menu.png`（BTW 菜单项）。fixture 只有 1 个 user 回合，多刻度分布与行内代码点击由单测覆盖。

---

# Round 7: Context-card Compact Button / Live Plan Refresh (feat/context-compact-button)

## 本轮改动

1. **压缩按钮放进上下文卡 header 右侧**（TopBar.vue）：`.context-compact-button`（PhArrowsIn 图标 + "压缩"文字），点击直接 `emit('compact')` 执行，无需再填说明；`conversationActionPending === 'compact'` 时显 spinner。禁用条件 `sessionReady !== true || promptRunning === true || conversationActionPending != null`。原"会话操作"区里的压缩说明输入框与压缩按钮删除（`compactInstruction` ref、`requestCompact` 移除），该区只剩"撤销上一轮"，`.context-action-row` 由 grid 两列改 flex。
2. **计划面板实时刷新修复（核心）**：根因两条——① `liveTodo()`（SessionSyncController.ts）只认 `payload.display.kind === 'todo_list'`，但真实服务端（agent-core-v2，kimi-code 0.29.0）的 TodoList 帧是 `tool.call.started` + `args.todos` 全量清单、**没有 display**，所以实时帧全部丢弃，只有重进会话走 REST transcript hydrate 才看到计划；② hydrate 条目 todoId 恒为服务端常量 `'todo'`，而 liveTodo 无显式 id 时 fallback 是 `live:${session_id}`，即使解析成功也会 append 成第二条而非替换。修复：display 路径保留；新增 args 回退——`tool.call.started` 且 name 为 TodoList/TodoWrite 时解析 `args.todos`（复用 `parseTodoItems`），`agentId` 非 main 的子代理帧忽略（不覆盖主计划）；todoId fallback 改为 `'todo'` 对齐 hydrate。

## 验证

- `pnpm typecheck` 通过；`pnpm test`：325 passed / 2 skipped / 0 failed（`SessionSyncController.test.ts` 新增用例：真实 v2 帧形状 args.todos 无 display → 替换同 id hydrate 条目；子代理 TodoList 不覆盖主计划；`topBarUsage.test.ts` 改为 header 压缩按钮 + 撤销按钮用例）。
- 截图：`r7-context-popover.png`——header 右侧"压缩"按钮、会话操作区仅剩"撤销上一轮"（fixture 无 ready 会话，按钮禁用为正确态）。
- 备注：todo 实时刷新涉及真实服务端 WS 帧，dev fixture 无法端到端复现，靠单测覆盖，需在真实会话复核。

---

# Round 8: Right-rail De-card / Composer Flatten (feat/right-rail-sections)

## 本轮改动

1. **右栏去卡片化（核心）**：用户反馈右栏白卡与左栏/中栏表面语言不统一、视觉突兀。Changes 视图（`.changed-files-panel/.todo-panel/.plan-panel`）从"白底+描边+圆角卡片"改为平铺区块：内容直接落在面板底色上，区块间发丝分隔线（`section + section` border-top），空态从 72px 居中大块收成左对齐单行。区块标题统一复用侧栏"项目"的灰色小标题系统（11px / weight 590 / letter-spacing 0.08em），左右两栏同一套标题语言；`.changes-view` 的 grid 行（`minmax(260px,1fr)` 撑大空计划卡）改为自然流。
2. **文件 tab 同步**：`.file-search-results` 去卡片（白底+边框 → 平铺 + 底部分隔线），结果按钮加圆角 hover；`.file-preview-panel` 保留白底代码画布但圆角 11→10px。
3. **面板文案中文化**：EXTENSIONS→扩展、Changes→更改、Background Tasks→后台任务（任务数胶囊样式与计划计数统一）。
4. **输入框扁平化**：`.composer-wrap` 去 `0 10px 30px` 投影和 backdrop blur，圆角 15→12px，focus-within 只留蓝色 ring——靠描边定义边界，与扁平化后的右栏同一语言。
5. **字号地板（右栏 + 输入框范围）**：changed-file-row 10.5→11、git-summary 9.5→10、todo 状态 chip 9→10、plan-empty 10→10.5、后台任务 strong 10.5→11 / em 8.5→10 / code 9→10、搜索结果行 10→11 / small 8.5→10 / grep code 8.5→10、附件 chip strong 10.5→11 / small 9→10.5。分段 tab 激活块去投影；侧栏 `.section-heading` 颜色 #98a1ae→#767e8c（2.47:1→≈4.5:1，与右栏标题同值）。

## 验证

- `pnpm typecheck` 通过；`pnpm test`：334 passed / 2 skipped / 0 failed（修一处模板 v-if/v-else 链断裂：更改区 h2 常显后状态行改独立条件）。
- 截图：`r8-rail-changes.png`（平铺区块 + 分隔线 + 单行空态）、`r8-rail-files.png`、`r8-composer.png`（无投影、12px 圆角）。右栏三区块实测背景均为 transparent。
- 备注：fixture 无 git/todo/task 数据，有数据的行级渲染靠类名不变的单测兜底；真实会话里建议复核长文件列表的内部滚动。

### Round 8b 修正：轮廓卡方案（用户反馈全平铺也不好看）

- 全平铺区块改为"轮廓卡"：保留卡片的分组轮廓，但 `background: transparent` + 描边弱化为 `rgba(15,23,42,0.07)`——去掉的是白底亮度冲击，保留的是分组边界。区块内边距恢复（section padding 10px 11px 12px），`.changes-view` 恢复 gap:10px，分隔线规则删除。
- 文件 tab `.file-search-results` 同样改透明轮廓卡（描边同色，header 分隔线同步弱化）。
- 灰色小标题系统、中文化文案、字号地板、输入框扁平化均保留不变。
- A/B 截图对比：`r8b-variantA-transparent.png`（透明底，已落地）vs `r8b-variantB-halfwhite.png`（注入 rgba(255,255,255,0.55) 半白底）——空态下两者差异很小，透明底更干净。
- 测试：334 passed / 2 skipped，无回归。

---

## Latest QA Result

- Scope: v0.2.0 Secondary Model Provider master/detail redesign.
- Full report: `# Secondary Model Provider Master/Detail (v0.2.0)` above.

final result: passed

---

# Secondary Model Provider Master/Detail (v0.2.0)

- Source visual truth: `/var/folders/td/2bghhqcx6l52c06vq81_n35m0000gn/T/codex-clipboard-0d92e2be-232b-4d10-af73-2f4106c215e0.png`
- Browser-rendered implementation: `/Users/feili/.codex/visualizations/2026/07/27/019fa3bd-753d-7c33-bdae-5c031c73bffb/model-settings-provider-master-detail-v2.png`
- Full-view comparison: `/Users/feili/.codex/visualizations/2026/07/27/019fa3bd-753d-7c33-bdae-5c031c73bffb/model-settings-design-qa-comparison-v2.png`
- Focused add-provider state: `/Users/feili/.codex/visualizations/2026/07/27/019fa3bd-753d-7c33-bdae-5c031c73bffb/model-settings-provider-add-custom-v2.png`
- Responsive state: `/Users/feili/.codex/visualizations/2026/07/27/019fa3bd-753d-7c33-bdae-5c031c73bffb/model-settings-provider-narrow.png`
- Viewport: `1296 × 1010` CSS px, DPR 1; responsive check at `900 × 800` CSS px.
- Source pixels: `1296 × 1010`; implementation pixels: `1296 × 1010`; comparison pixels: `2592 × 1010`.
- Density normalization: none required; source and implementation were captured at identical pixel dimensions.
- State: light theme, Settings → Models → Sub-agent model, `openai-main` selected, `GPT-5 mini` selected.

## Findings

No actionable P0, P1, or P2 mismatch remains. The implementation adopts the source's defining structure—provider catalog on the left, selected provider detail and model list on the right—while retaining Moon Code's outer Settings navigation and Kimi-owned configuration boundaries.

## Required Fidelity Surfaces

- Fonts and typography: system UI sans is retained to match Moon Code. Provider names, section headings, connection values and model rows now use the source's larger, clearer hierarchy; small metadata remains compact but readable.
- Spacing and layout rhythm: the Settings modal was expanded to `1220 × 900` maximum, the provider rail widened to 270 px, and the right detail pane uses 26–28 px inset spacing. Border radius, row height and section rhythm follow the source without introducing nested decorative cards.
- Colors and visual tokens: white and quiet gray surfaces, one restrained Moon Code blue, mint connection states, neutral dividers and no gradients. State colors retain sufficient contrast and do not replace text labels.
- Image quality and asset fidelity: the source's vendor logos are not available from Kimi's Provider payload. The implementation intentionally uses Phosphor provider/CPU icons rather than fabricated logos, inline SVG or CSS drawings. Kimi and custom providers remain distinguishable through icon, title and protocol copy.
- Copy and content: technical terms are reduced to the task vocabulary: model service, API Key, API Base URL, available models, reasoning effort and save. Runtime implementation details remain collapsed.

## Primary Interactions Tested

- Switched between Primary model and Sub-agent model tabs.
- Selected existing providers and verified their connection/model state.
- Opened and cancelled the Add custom provider flow.
- Verified model selection, reasoning-effort control, follow-primary and save actions remain present.
- At `900 × 800`, `.settings-content` and `.provider-manager` both reported `scrollWidth === clientWidth`; selected provider and Save remain available.
- Browser console checked. Two errors are emitted by the broader development fixture because it omits `onKimiUsageStateChanged` and `markPetSessionViewed`; neither originates in SettingsPanel or occurs through the production preload contract. Component tests and the production build cover the real contract.

## Comparison History

### Iteration 1

- Earlier finding: `[P1]` the first add-provider capture inherited an obsolete two-column grid from the previous form CSS, putting the header beside the fields and breaking the source's clear vertical hierarchy.
- Fix: reset `.secondary-provider-form` to a single explicit grid column, preserving the two-column layout only inside `.provider-form-grid`.
- Post-fix evidence: `model-settings-provider-add-custom-v2.png` shows the provider header, fields, credential note and actions in a clean top-to-bottom sequence.

### Iteration 2

- Earlier finding: `[P2]` the first master/detail capture used a `1120 × 720` modal and 236 px provider rail, making the source-inspired structure feel too small and leaving the Add custom action below the visible fold.
- Fix: expanded the modal to `1220 × 900`, widened the provider rail to 270 px, increased row heights and type sizes, and raised the provider workspace minimum height.
- Post-fix evidence: `model-settings-provider-master-detail-v2.png` keeps the Provider catalog, selected provider, model row and primary actions visible together.

## Focused Region Comparison

The full-view composite was used for major-region proportions and hierarchy. The add-provider state received a separate focused comparison because the source's API Key and Base URL form is a key fidelity surface and its field alignment was too small to judge reliably in the full composite.

## Follow-up Polish

- `[P3]` Use official vendor logos only if Kimi later exposes stable Provider branding metadata; do not infer brands from arbitrary custom IDs.
- `[P3]` Recheck optical density with a real Provider that returns a long model catalog; the list has bounded internal scrolling, but the fixture currently exposes one model for the selected provider.

final result: passed

### Round 8c 修正：标题外置 + 内容驱动容器（自选方案）

- 原则：标题放卡片外面建立节奏（macOS 设置式）；空态只留标题 + 一行灰字，不画框；框只给需要边界的滚动内容，线性阅读列表永不加框。
- 落地：`.changes-view` 区块完全去框（gap 18px 留白分隔）；文件列表的轮廓卡从 section 下沉到 `.changed-files-list`（只在有更改文件时渲染，max-height 30vh 内部滚动，行间 0.05 发丝分隔线）；计划/后台任务平铺列表（任务行间分隔线，首行去顶线）；标题行（灰小标题 + 右侧计数/摘要）外置于内容之上。
- 截图：`r8c-empty.png`（空态无框，干净）、`r8c-populated.png` / `r8c-full-populated.png`（注入 4 文件 + 5 计划 + 3 任务验证填充态；填充态为 DOM 注入示意，非真实数据）。
- 测试：334 passed / 2 skipped，无回归。

---

## Current QA Gate

- Current scope: v0.2.0 Secondary Model approved master/detail layout with graphite and indigo visual system.
- Desktop evidence: `/Users/feili/.codex/visualizations/2026/07/27/019fa3bd-753d-7c33-bdae-5c031c73bffb/model-settings-graphite-provider.png`.
- Add Provider evidence: `/Users/feili/.codex/visualizations/2026/07/27/019fa3bd-753d-7c33-bdae-5c031c73bffb/model-settings-graphite-add-custom.png`.
- Responsive evidence: `/Users/feili/.codex/visualizations/2026/07/27/019fa3bd-753d-7c33-bdae-5c031c73bffb/model-settings-taste-narrow.png` at `900 × 800`; content and Provider manager both report `scrollWidth === clientWidth`.
- Layout decision: restored the approved vertical Provider rail and right-side configuration workspace.
- Color decision: graphite Provider rail, cold-white configuration surface, one restrained indigo action color, semantic green only for real connection state.
- Shape rule: 10 px structural surfaces, 8-9 px controls, compact status labels only. No decorative gradients, glass, wide shadows or mixed radius language.
- Interaction checks: Provider selection, Add Provider open/cancel, Primary/Sub-agent tabs, model controls and responsive collapse verified in the browser.
- Verification: `pnpm check` passes with 376 tests passed and 6 skipped; typecheck and production build pass.

final result: passed

---

# Round 9: 子 Agent 模型设置页重构（回归 DESIGN.md 亮色体系）

## 本轮改动

1. **样式三层覆盖合并为单层**：`styles.css` 中 6090–7873 的基础层 + 两个 taste-pass 覆盖层（graphite 深色导航 + indigo  Accent）全部删除，重写为单层实现；回归 DESIGN.md 的冷白工作台 + 唯一 Moon Blue（#3085fa）动作色。同时清理无组件引用的死样式（`.provider-row`、`.provider-list`、`.secondary-outcome`、`.secondary-config-*`、`.secondary-source-*`、`.secondary-field`、`.experimental-chip`、`.settings-actions` 等）及 760px 遗留媒体查询。
2. **Provider rail 去深色化**：深石墨 rail 改为 `#f6f9fc` 冷白，选中项白底 + 中性描边；Kimi 内置服务用蓝底图标区分，第三方用浅灰蓝图标。
3. **状态文字化**（DESIGN.md：状态不只靠颜色）：rail 条目副行从 `Kimi 内置` / `openai_responses` 改为 `内置 · 已连接` / `openai_responses · 已连接`；详情 header 状态徽章新增 `is-unconfigured`（待配置琥珀态），模板补充对应 class 绑定。
4. **文案对齐功能语义**：`添加自定义` → `添加模型服务`；表单标题 `添加自定义服务` → `添加模型服务`，说明补全 Google/兼容接口与凭据归属。测试 `settingsPanel.test.ts` 同步更新按钮查找文案。

## 验证

- `pnpm check` 通过：typecheck 0 错误，376 passed / 6 skipped，生产构建成功。
- 截图（fixture，1296×1010）：`model-v3-secondary-openai.png`（默认 openai-main + GPT-5 mini 选中）、`model-v3-secondary-kimi.png`（Kimi 内置选中态）、`model-v3-secondary-add.png`（添加模型服务表单）、`model-v3-primary.png`（主模型 Tab 回归）。采集脚本 `artifacts/design-qa/shots-model-settings.mjs`。
- `.settings-content` 无横向溢出；浏览器控制台 0 error。
