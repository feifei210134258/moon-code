export type RendererLocale = 'zh-CN' | 'en-US'

type LocalizedValue = {
  source: string
  applied: string
}

// The renderer was originally Chinese-only.  Keep the source copy in the Vue
// templates and apply the alternate locale at the document boundary so that
// message, tool-output and other Kimi-owned strings remain untouched.
//
// This deliberately translates exact UI copy only.  It does not attempt to
// translate arbitrary conversation text, file names, Markdown, code, or data
// returned by Kimi.
const enUS: Record<string, string> = {
  '项目文件': 'Project files',
  '扩展': 'Extensions',
  '新建任务': 'New task',
  '添加项目': 'Add project',
  '搜索任务': 'Search tasks',
  '清除搜索': 'Clear search',
  '项目': 'Projects',
  '项目和任务': 'Projects and tasks',
  '新建': 'New',
  '重命名': 'Rename',
  '移除项目': 'Remove project',
  '项目名称': 'Project name',
  '任务名称': 'Task name',
  '任务操作': 'Task actions',
  '项目操作': 'Project actions',
  '查看子任务': 'View child tasks',
  '创建分叉': 'Create fork',
  '导出 ZIP': 'Export ZIP',
  '归档': 'Archive',
  '没有匹配的任务': 'No matching tasks',
  '正在加载…': 'Loading…',
  '加载更早的任务': 'Load earlier tasks',
  '设置': 'Settings',
  '非 Git 项目': 'Not a Git project',
  '查看 Context 用量': 'View context usage',
  '查看 Kimi 套餐用量': 'View Kimi plan usage',
  '已过期': 'Stale',
  '搜索': 'Search',
  '切换侧栏': 'Toggle sidebar',
  '账户': 'Account',
  'Kimi 用量详情': 'Kimi usage details',
  'Kimi 用量': 'Kimi usage',
  '套餐数据为准实时轮询': 'Plan data is refreshed near real time',
  '刷新用量': 'Refresh usage',
  '套餐限额': 'Plan limits',
  '暂无重置时间': 'No reset time',
  '余额': 'Balance',
  '本月已用': 'Month to date',
  '本月上限': 'Monthly limit',
  '未启用月度上限': 'Monthly limit disabled',
  '当前 Session': 'Current session',
  '数据源：Kimi `/oauth/usage`': 'Source: Kimi `/oauth/usage`',
  '会话': 'Session',
  '目录': 'Contents',
  '会话操作': 'Session actions',
  '压缩说明（可选）': 'Compaction instructions (optional)',
  '例如：保留当前实现约束': 'For example: retain the current implementation constraints',
  '压缩上下文': 'Compact context',
  '撤销上一轮': 'Undo last turn',
  '会话目录': 'Session contents',
  'Kimi 会话标记': 'Kimi session markers',
  '正在读取 Kimi 会话…': 'Loading Kimi session…',
  '正在恢复实时会话…': 'Restoring live session…',
  '会话读取失败': 'Could not load session',
  '这个会话还没有消息': 'This session has no messages yet',
  '这个会话还没有消息，从下方输入框开始一个新任务。': 'This session has no messages yet. Start a new task from the composer below.',
  '已排队': 'Queued',
  'Kimi 已接收任务，正在生成回复…': 'Kimi received the task and is preparing a response…',
  'Kimi 等待你的操作': 'Kimi is waiting for your action',
  '正在读取 Kimi 会话控制…': 'Loading Kimi session controls…',
  '连接 Kimi 并选择一个会话后即可输入': 'Connect Kimi and select a session to start typing',
  '附件消息': 'Attachment message',
  '上下文已压缩': 'Context compacted',
  '待发送附件': 'Attachments to send',
  '正在上传到 Kimi…': 'Uploading to Kimi…',
  '输入任务': 'Enter a task',
  '描述需要持续完成的目标…': 'Describe the goal to pursue…',
  '描述你的任务或问题…': 'Describe your task or question…',
  '下一条消息会创建 Kimi Goal 并立即开始执行': 'The next message will create and immediately start a Kimi Goal',
  '添加附件': 'Add attachment',
  '引用文件': 'Mention a file',
  '发送': 'Send',
  '正在发送…': 'Sending…',
  '正在搜索文件…': 'Searching files…',
  '没有匹配文件': 'No matching files',
  '输入': 'Input',
  '输出': 'Output',
  '工具执行进度': 'Tool execution progress',
  '工具 Diff': 'Tool Diff',
  '变更前': 'Before',
  '变更后': 'After',
  '运行中': 'Running',
  '失败': 'Failed',
  '完成': 'Complete',
  '开发浏览器': 'Developer browser',
  '后退': 'Back',
  '前进': 'Forward',
  '停止加载': 'Stop loading',
  '刷新': 'Refresh',
  '浏览器地址': 'Browser address',
  '在系统浏览器打开': 'Open in system browser',
  '视口尺寸': 'Viewport size',
  '适应面板': 'Fit panel',
  '桌面 · 1440 × 900': 'Desktop · 1440 × 900',
  '平板 · 768 × 1024': 'Tablet · 768 × 1024',
  '手机 · 390 × 844': 'Mobile · 390 × 844',
  '自定义': 'Custom',
  '自定义视口宽度': 'Custom viewport width',
  '自定义视口高度': 'Custom viewport height',
  '视口': 'Viewport',
  '整页': 'Full page',
  '选择中…': 'Selecting…',
  '批注元素': 'Annotate element',
  '框选区域': 'Select region',
  '打开已发现的本地服务': 'Open discovered local server',
  '打开 HTML 或 localhost': 'Open HTML or localhost',
  'HTML 会通过 Workspace 隔离的本地预览服务加载，不使用 file://。': 'HTML is loaded through a Workspace-isolated local preview server, not file://.',
  '清空当前诊断': 'Clear current diagnostics',
  '暂无 Console 输出': 'No Console output',
  '暂无 Network 请求': 'No Network requests',
  '读取安全预览…': 'Loading safe preview…',
  '没有可预览的正文': 'No previewable body',
  '元素': 'Element',
  '批注区域截图': 'Annotation area screenshot',
  '页面': 'Page',
  '批注页面 URL': 'Annotation page URL',
  '反馈': 'Feedback',
  '告诉 Kimi 这里需要怎么调整…': 'Tell Kimi what should change here…',
  '截图': 'Screenshot',
  '定位信息': 'Location details',
  '页面文字': 'Page text',
  '删除': 'Delete',
  '发送中…': 'Sending…',
  '发送给 Kimi': 'Send to Kimi',
  '选择页面元素或框选区域后，批注草稿会显示在这里。': 'Annotation drafts appear here after selecting an element or region.',
  '整页截图': 'Full-page screenshot',
  '视口截图': 'Viewport screenshot',
  'Kimi 请求授权': 'Kimi requests approval',
  '需要你的授权': 'Your approval is required',
  '等待确认': 'Waiting for confirmation',
  'Kimi 请求执行此操作': 'Kimi requests this action',
  '正在提交…': 'Submitting…',
  '拒绝': 'Reject',
  '本会话允许': 'Allow for this session',
  '允许一次': 'Allow once',
  'Kimi 等待回答': 'Kimi is waiting for an answer',
  'Kimi 需要你的选择': 'Kimi needs your choice',
  '回答后继续执行': 'Continue after answering',
  '问题进度': 'Question progress',
  '推荐': 'Recommended',
  '其他答案': 'Other answer',
  '其他答案…': 'Other answer…',
  '放弃': 'Dismiss',
  '返回': 'Back',
  '下一项': 'Next',
  '提交回答': 'Submit answer',
  'Kimi 当前目标': 'Current Kimi goal',
  '执行中': 'Active',
  '已暂停': 'Paused',
  '受阻': 'Blocked',
  '已完成': 'Complete',
  '余': 'Remaining',
  '暂停 Goal': 'Pause Goal',
  '恢复 Goal': 'Resume Goal',
  '取消 Goal': 'Cancel Goal',
  'Kimi Prompt 队列': 'Kimi Prompt queue',
  '当前 Prompt': 'Current prompt',
  '停止当前 Prompt': 'Stop current prompt',
  '附件 Prompt': 'Attachment prompt',
  '编辑待发送 Prompt': 'Edit draft prompt',
  '上移待发送 Prompt': 'Move draft prompt up',
  '下移待发送 Prompt': 'Move draft prompt down',
  '移除待发送 Prompt': 'Remove draft prompt',
  '排队 Prompt': 'Queued prompt',
  '将 Prompt 插入当前任务': 'Steer prompt into current task',
  '移出 Prompt 队列': 'Remove prompt from queue',
  'Moon Code Agent 详情': 'Moon Code Agent details',
  '关闭 Agent 详情': 'Close Agent details',
  '正在读取 Agent 独立输出…': 'Loading Agent output…',
  '任务': 'Task',
  '（无可显示内容）': '(No displayable content)',
  '该 Agent 尚未产生可显示的独立输出。': 'This Agent has no displayable output yet.',
  '仅显示 Kimi Server 当前返回的最近 100 个 Turn。': 'Only the latest 100 Turns currently returned by Kimi Server are shown.',
  '选择 Agent 后读取其独立 Transcript。': 'Select an Agent to load its separate transcript.',
  '空闲': 'Idle',
  '排队中': 'Queued',
  '已取消': 'Cancelled',
  '正在生成…': 'Generating…',
  'Agent 正在回复': 'Agent is replying',
  '独立对话': 'Separate conversation',
  '关闭 Side Chat': 'Close Side Chat',
  '你': 'You',
  '向这个独立 Agent 补充问题，不会写入主对话。': 'Ask this separate Agent a follow-up without writing to the main conversation.',
  '向 BTW Agent 继续追问…': 'Ask the BTW Agent a follow-up…',
  '发送 Side Chat': 'Send Side Chat',
  '终端列表': 'Terminal list',
  '关闭': 'Close',
  '新建终端': 'New terminal',
  '收起终端': 'Collapse terminal',
  '正在读取终端…': 'Loading terminals…',
  '这个 Session 还没有终端': 'This Session has no terminals yet',
  '连接 Kimi Runtime': 'Connect Kimi Runtime',
  '可启动当前应用托管的 Kimi，也可连接你已启动且受 Bearer 保护的 Kimi Server。Token 只用于本次 Main 进程连接，不会保存或回传。': 'Start the Kimi managed by this app, or connect an already-running Bearer-protected Kimi Server. The token is used only by this Main-process connection and is never saved or returned.',
  '启动托管 Kimi': 'Start managed Kimi',
  '或连接已运行的 Server': 'or connect a running Server',
  '仅本次连接使用': 'Used only for this connection',
  '连接受保护 Server': 'Connect protected Server',
  '界面语言': 'Interface language',
  '影响系统通知、日期/数字格式与界面语言标记': 'Affects system notifications, date/number formatting, and document language',
  '通用': 'General',
  '默认 Permission': 'Default permission',
  '新 Session 的权限模式': 'Permission mode for new Sessions',
  '默认 Plan': 'Default plan',
  '新 Session 自动规划': 'Automatically plan new Sessions',
  '合并可用 Skills': 'Merge available Skills',
  '遵循 Kimi 的 Skill 发现规则': 'Follow Kimi Skill discovery rules',
  '用量与通知': 'Usage and notifications',
  '只保存客户端阈值；套餐数据仍来自 Kimi `/oauth/usage`。': 'Only client thresholds are stored; plan data still comes from Kimi `/oauth/usage`.',
  '官方数据源': 'Official data source',
  '数据有效': 'Data is current',
  '轻提示阈值': 'Info threshold',
  '只改变界面强调，默认 50%': 'Changes visual emphasis only; default 50%',
  '警告阈值': 'Warning threshold',
  '触发第一次系统通知，默认 80%': 'Triggers the first system notification; default 80%',
  '严重阈值': 'Critical threshold',
  '触发高优先级通知，默认 95%': 'Triggers a high-priority notification; default 95%',
  '系统通知': 'System notifications',
  '同一 reset 周期每个阈值只提醒一次': 'Notify each threshold only once per reset window',
  '任务完成通知': 'Task completion notifications',
  '主 Turn 完成或失败时发送系统通知': 'Send a system notification when the main Turn completes or fails',
  '通知声音': 'Notification sound',
  '系统通知同时播放系统提示音': 'Play the system alert sound with notifications',
  '前台 30 秒、后台 60 秒轮询；Prompt 结束、窗口聚焦、网络恢复与登录完成时立即刷新。': 'Refresh every 30 seconds in the foreground and 60 in the background, plus after Prompt completion, focus, network recovery, and sign-in.',
  '已归档任务': 'Archived tasks',
  '列表和恢复操作均直接来自 Kimi Session。': 'The list and restore actions come directly from Kimi Sessions.',
  '正在读取归档任务…': 'Loading archived tasks…',
  '当前没有已归档任务。': 'There are no archived tasks.',
  '未命名任务': 'Untitled task',
  '恢复': 'Restore',
  'Kimi 启动中': 'Kimi is starting',
  'Kimi 连接异常': 'Kimi connection error',
  'Kimi 未连接': 'Kimi is disconnected',
  '文件已保存到所选位置。': 'File saved to the selected location.',
  '已在 Finder 中显示文件。': 'File revealed in Finder.',
  '已交给 Kimi 打开文件。': 'Kimi was asked to open the file.',
  '正在思考…': 'Thinking…',
  '等待工具结果': 'Waiting for tool result',
  '此轮由 Kimi 定时任务触发': 'This turn was triggered by a Kimi scheduled task',
  '此轮由 Kimi 上下文压缩生成': 'This turn was generated by Kimi context compaction',
  '项目文件引用': 'Project file mention',
  '选择后插入路径': 'Insert the path after selecting',
  '正在搜索 Kimi Workspace…': 'Searching Kimi Workspace…',
  '没有匹配的文件': 'No matching files',
  '文件': 'File',
  '打开或下载': 'Open or download',
  '刷新文件和更改': 'Refresh files and changes',
  '收起扩展栏': 'Collapse extensions',
  '扩展工作区': 'Extension workspace',
  '浏览器': 'Browser',
  '个文件已更改': 'files changed',
  '正在读取 Git 状态…': 'Loading Git status…',
  '选择一个 Kimi Session 后读取更改。': 'Select a Kimi Session to load changes.',
  '工作区没有未提交更改。': 'The Workspace has no uncommitted changes.',
  '当前工作区未检测到可用的 Git 仓库。': 'No usable Git repository was detected in the current Workspace.',
  '选择文件查看 Diff': 'Select a file to view its Diff',
  '复制 Diff': 'Copy Diff',
  '正在读取 Diff…': 'Loading Diff…',
  '代码差异': 'Code diff',
  '这个文件没有可显示的文本 Diff。': 'This file has no displayable text Diff.',
  '从上方 Changed Files 选择一个文件。': 'Select a file from Changed Files above.',
  'Diff 较大，当前仅显示前': 'Diff is large; showing the first',
  '行': 'lines',
  '计划': 'Plan',
  'Kimi Todo 计划': 'Kimi Todo plan',
  'Kimi 生成计划后会在这里实时显示。': 'Kimi plans appear here as they are generated.',
  '正在读取 Kimi Tasks…': 'Loading Kimi Tasks…',
  '取消后台任务': 'Cancel background task',
  '当前 Session 没有后台任务。': 'The current Session has no background tasks.',
  '搜索文件名…': 'Search file names…',
  '搜索文件内容…': 'Search file contents…',
  '内容': 'Contents',
  '文件搜索': 'File search',
  '项': 'items',
  '没有匹配的文件。': 'No matching files.',
  '结果已按 Kimi Server 限制截断。': 'Results were truncated by Kimi Server limits.',
  '内容搜索': 'Content search',
  '个文件': 'files',
  '正在搜索内容…': 'Searching contents…',
  '处': 'matches',
  '没有匹配的内容。': 'No matching content.',
  '上一级': 'Up one level',
  '正在读取目录…': 'Loading directory…',
  '目录内容已按 Kimi Server 限制截断。': 'Directory contents were truncated by Kimi Server limits.',
  '这个目录是空的。': 'This directory is empty.',
  '文件预览': 'File preview',
  '文件操作': 'File actions',
  '下载': 'Download',
  '系统打开': 'Open with system',
  'Cursor 打开': 'Open in Cursor',
  'VS Code 打开': 'Open in VS Code',
  '在 Finder 中显示': 'Reveal in Finder',
  '正在读取文件…': 'Loading file…',
  '二进制文件不会作为文本载入 Renderer。': 'Binary files are not loaded as text into the Renderer.',
  '进行中': 'In progress',
  '待处理': 'Pending',
  'Kimi Session 警告': 'Kimi Session warnings',
  '警告读取失败：': 'Could not load warnings:',
  '该媒体来源无法安全预览': 'This media source cannot be safely previewed',
  'Kimi 会话图片附件': 'Kimi session image attachment',
  '正在读取媒体…': 'Loading media…',
  '图片附件': 'Image attachment',
  '视频附件': 'Video attachment',
  '已登录': 'Signed in',
  '登录已过期': 'Sign-in expired',
  '授权已撤销': 'Authorization revoked',
  '未登录': 'Signed out',
  '任务已恢复到原项目。': 'Task restored to its original project.',
  '时间未知': 'Unknown time',
  '尚无成功数据': 'No successful data yet',
  'Moon Code 设置': 'Moon Code settings',
  '关闭设置': 'Close settings',
  '设置分类': 'Settings categories',
  '账号': 'Account',
  '模型': 'Models',
  'MCP 与工具': 'MCP and tools',
  '用量': 'Usage',
  '需要先连接 Kimi Runtime': 'Connect Kimi Runtime first',
  '设置直接来自 Kimi，不会读取或维护第二份配置。': 'Settings come directly from Kimi; the app does not read or maintain a second configuration.',
  '正在读取 Kimi 设置…': 'Loading Kimi settings…',
  'Kimi 账号': 'Kimi account',
  '使用官方 device-code 登录流程。': 'Use the official device-code sign-in flow.',
  '退出登录': 'Sign out',
  '登录 Kimi': 'Sign in to Kimi',
  '在浏览器完成授权': 'Complete authorization in the browser',
  '打开 Kimi 授权页': 'Open Kimi authorization page',
  '取消登录': 'Cancel sign-in',
  '默认模型': 'Default model',
  '影响新 Session；已有 Session 保留自己的模型。': 'Affects new Sessions; existing Sessions keep their own model.',
  '刷新目录': 'Refresh catalog',
  '次主力模型': 'Secondary model',
  '实验': 'Experimental',
  '当前 Runtime 不支持': 'Not supported by this Runtime',
  '实验开关已启用': 'Experimental flag enabled',
  '实验开关状态未知': 'Experimental flag status unknown',
  '实验开关未启用': 'Experimental flag disabled',
  'Moon Code 启动覆盖': 'Moon Code launch override',
  '外部环境变量覆盖': 'External environment override',
  'Kimi 原有配置': 'Existing Kimi configuration',
  'Moon Code 已禁用': 'Disabled by Moon Code',
  '等待重启生效': 'Waiting for restart',
  '已禁用次主力模型': 'Secondary model disabled',
  '重启后，Moon Code 内新派生的子 Agent 将继承主模型；Kimi 配置文件不会被删除或改写。': 'After restart, newly spawned subagents in Moon Code will inherit the primary model; the Kimi config file will not be deleted or modified.',
  '若父进程设置了 Kimi master 实验开关，Moon Code 会在此 Runtime 中取消继承它，以确保 secondary 确实关闭。': 'If the parent process sets Kimi’s master experimental flag, Moon Code stops inheriting it in this Runtime so secondary is actually disabled.',
  '未配置': 'Not configured',
  '未设置时，新派生的 Agent/AgentSwarm 继承主模型。': 'When unset, newly spawned Agent/AgentSwarm workers inherit the primary model.',
  '最大输出 Token': 'Maximum output tokens',
  '不修改 effort': 'Do not change effort',
  '不覆盖（使用 Kimi 配置）': 'Do not override (use Kimi configuration)',
  '留空不修改': 'Leave blank to keep unchanged',
  '保存次主力模型': 'Save secondary model',
  '禁用并恢复继承主模型': 'Disable and inherit primary model',
  '使用 Kimi 原有配置': 'Use existing Kimi configuration',
  '需要重启 Kimi Runtime': 'Kimi Runtime restart required',
  '重启会中断正在执行的任务，并关闭当前 Session 连接。': 'Restarting interrupts running tasks and closes the current Session connection.',
  '立即重启并应用': 'Restart and apply now',
  '重启 Kimi Runtime 会中断当前正在执行的任务，并关闭当前 Session 连接。确定继续吗？': 'Restarting Kimi Runtime interrupts running tasks and closes the current Session connection. Continue?',
  '次主力模型只影响新派生的子 Agent。': 'The secondary model affects only newly spawned subagents.',
  '配置通过当前 Kimi Runtime 的官方 /config 接口保存。': 'Configuration is saved through the current Kimi Runtime’s official /config API.',
  '配置使用 Kimi 官方环境变量应用于 Moon Code 启动的 Runtime，不会改写 config.toml。': 'Configuration is applied to the Moon Code-launched Runtime through official Kimi environment variables; config.toml is not modified.',
  '次主力模型已更新；只影响新派生的 Agent/AgentSwarm。': 'Secondary model updated; it affects only newly spawned Agent/AgentSwarm workers.',
  '次主力模型已保存；重启 Kimi Runtime 后生效。': 'Secondary model saved; restart Kimi Runtime to apply it.',
  '已保存禁用设置；重启 Kimi Runtime 后，子 Agent 将恢复继承主模型。': 'Disable setting saved; after restarting Kimi Runtime, subagents will inherit the primary model again.',
  '次主力模型已禁用；子 Agent 将继承主模型。': 'Secondary model disabled; subagents will inherit the primary model.',
  '已恢复使用 Kimi 原有配置；重启 Kimi Runtime 后生效。': 'Restored the existing Kimi configuration; restart Kimi Runtime to apply it.',
  '已恢复使用 Kimi 原有配置。': 'Restored the existing Kimi configuration.',
  'Kimi Runtime 已重启，次主力模型设置已生效。': 'Kimi Runtime restarted; the secondary-model setting is now active.',
  '凭据只提交给 Kimi Server，界面只读取“已配置”。': 'Credentials are sent only to Kimi Server; the UI only sees “configured”.',
  '添加': 'Add',
  '类型': 'Type',
  '取消': 'Cancel',
  '保存并刷新': 'Save and refresh',
  '来自当前 Session 的真实 Skill 目录。': 'From the current Session’s authoritative Skill catalog.',
  '当前没有 Session，显示 Workspace 可用 Skill。': 'There is no current Session; showing Workspace Skills.',
  '正在扫描 Kimi Skills…': 'Scanning Kimi Skills…',
  '当前上下文没有发现可用 Skill。': 'No Skills were found in the current context.',
  '无描述': 'No description',
  '仅用户调用': 'User-invocable only',
  '状态和有效工具集均由当前 Kimi Agent 返回。': 'Status and the effective tool set are returned by the current Kimi Agent.',
  '正在读取 MCP 状态…': 'Loading MCP status…',
  '尚未配置 MCP Server。': 'No MCP Server is configured.',
  '有效工具': 'Effective tools',
  '当前 Agent 尚未公布工具。': 'The current Agent has not published tools.',
  '可用': 'Available',
  '已禁用': 'Disabled',
  'Kimi 配置和仅本机的产品偏好会明确分开保存。': 'Kimi configuration and local product preferences are stored separately.',
  'Telemetry': 'Telemetry',
  '只控制 Kimi 官方遥测，不增加客户端追踪': 'Controls only Kimi telemetry and adds no client tracking'
}

let locale: RendererLocale = 'zh-CN'
let observer: MutationObserver | null = null
const textValues = new WeakMap<Text, LocalizedValue>()
const attributeValues = new WeakMap<Element, Map<string, LocalizedValue>>()
const localizableAttributes = ['aria-label', 'placeholder', 'title', 'alt'] as const

function isExcluded(node: Node): boolean {
  const element = node.parentElement
  return element?.closest('pre, code, textarea, .markdown-block, .xterm, [data-no-localize]') !== null
}

function splitWhitespace(value: string): { prefix: string; content: string; suffix: string } {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(value)
  return { prefix: match?.[1] ?? '', content: match?.[2] ?? value, suffix: match?.[3] ?? '' }
}

function translated(value: string): string {
  if (locale === 'zh-CN') return value
  const { prefix, content, suffix } = splitWhitespace(value)
  return `${prefix}${enUS[content] ?? content}${suffix}`
}

function localizeText(node: Text): void {
  if (isExcluded(node)) return
  const existing = textValues.get(node)
  const source = existing === undefined || node.data !== existing.applied ? node.data : existing.source
  const applied = translated(source)
  textValues.set(node, { source, applied })
  if (node.data !== applied) node.data = applied
}

function localizeAttribute(element: Element, name: string): void {
  if (element.closest('pre, code, textarea, .markdown-block, .xterm, [data-no-localize]') !== null) return
  const current = element.getAttribute(name)
  if (current === null) return
  let values = attributeValues.get(element)
  if (values === undefined) {
    values = new Map()
    attributeValues.set(element, values)
  }
  const existing = values.get(name)
  const source = existing === undefined || current !== existing.applied ? current : existing.source
  const applied = translated(source)
  values.set(name, { source, applied })
  if (current !== applied) element.setAttribute(name, applied)
}

function localizeSubtree(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) localizeText(root as Text)
  if (root.nodeType === Node.ELEMENT_NODE) {
    const element = root as Element
    for (const attribute of localizableAttributes) localizeAttribute(element, attribute)
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let node: Node | null
  while ((node = walker.nextNode()) !== null) {
    if (node.nodeType === Node.TEXT_NODE) localizeText(node as Text)
    else {
      const element = node as Element
      for (const attribute of localizableAttributes) localizeAttribute(element, attribute)
    }
  }
}

function ensureObserver(): void {
  if (observer !== null || typeof MutationObserver === 'undefined') return
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') localizeText(mutation.target as Text)
      else if (mutation.type === 'attributes') localizeAttribute(mutation.target as Element, mutation.attributeName!)
      else for (const node of mutation.addedNodes) localizeSubtree(node)
    }
  })
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...localizableAttributes]
  })
}

export function setRendererLocale(nextLocale: RendererLocale): void {
  locale = nextLocale
  document.documentElement.lang = locale === 'en-US' ? 'en' : 'zh-CN'
  ensureObserver()
  localizeSubtree(document.documentElement)
}

export function rendererLocale(): RendererLocale {
  return locale
}
