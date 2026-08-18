# Moon Code 调研与设计索引

> 工作名称：Moon Code；历史调研基线：2026-07-22，Kimi Code `0.29.0`；本机系统 CLI 当前为 `0.29.2`
> 当前阶段：P0 功能实现与未签名 macOS / Windows 内测交付；0.2.0 次主力模型正在补充 Provider 配置体验

这个项目不是通用 Agent 聚合器，也不是 Codex 协议客户端。它是一个以 Kimi Code 为唯一 Agent 内核的桌面客户端（支持 macOS 与 Windows）；“Codex 风格”只描述 UI、任务工作台和桌宠交互。

## 已确认的产品决策

- Kimi Code Web 当前可见功能必须完整覆盖。
- macOS 与 Windows 均已交付，架构为后续 Linux 留出空间。
- 客户端管理一套经过兼容验证的 Kimi Code 运行时，同时允许高级用户选择系统已安装版本。
- 内置开发浏览器包含地址栏、项目预览、Console、Network、设备尺寸和截图。
- HTML 画面批注是可行的增强目标：用户在网页元素或区域上写反馈，客户端把截图、元素定位和文字反馈作为普通 Kimi Prompt 附件发送。
- 提供类似 Codex 的桌面悬浮宠物，用来表达 Session 状态并跳回对应 Session；不使用 Codex 协议，也不复制 Codex 自带素材。
- Kimi 套餐用量通过官方 `/api/v1/oauth/usage` 准实时监控。
- Kimi 的 Workspace、Session、Transcript 是消息和会话的唯一事实源，不再建立第二套聊天数据库。

## 文档

1. [调研结论与竞品分析](./00-research-conclusions.md)
2. [产品需求文档](./01-product-requirements.md)
3. [Kimi Web 功能对照表](./02-kimi-web-parity.md)
4. [信息架构与 UX 规格](./03-ux-and-information-architecture.md)
5. [技术架构](./04-technical-architecture.md)
6. [技术验证与交付路线](./05-spikes-and-roadmap.md)
7. [视觉基线](./06-visual-baseline.md)
8. [Kimi Web P0 实现审计](./07-p0-implementation-audit.md)
9. [最小运行与未签名分发](./08-minimum-run-and-distribution.md)
10. [0.2.0 PRD：次主力模型](./09-v0.2.0-secondary-model-prd.md)
11. [0.2.0 发布说明](./10-v0.2.0-release-notes.md)
12. [0.2.1 发布说明](./11-v0.2.1-release-notes.md)
13. [0.2.2 发布说明](./12-v0.2.2-release-notes.md)
14. [0.2.3 发布说明](./13-v0.2.3-release-notes.md)
15. [0.2.4 发布说明](./14-v0.2.4-release-notes.md)
16. [0.2.5 发布说明](./15-v0.2.5-release-notes.md)
17. [0.2.6 发布说明](./16-v0.2.6-release-notes.md)
18. [ADR-0001：使用 Kimi 官方 Server API](./adr/0001-use-kimi-server-api.md)
19. [ADR-0002：Electron + Vue 桌面架构](./adr/0002-electron-vue-desktop.md)
20. [ADR-0003：Kimi 数据为唯一事实源](./adr/0003-kimi-data-source-of-truth.md)
21. [ADR-0004：Kimi 0.29 v2 Terminal 兼容层](./adr/0004-kimi-v2-terminal-compatibility.md)
22. [ADR-0005：Kimi 0.29 v2 Provider 变更边界](./adr/0005-kimi-v2-provider-mutation-boundary.md)
23. [ADR-0006：Skills、MCP 与 Agent roster 事实源](./adr/0006-kimi-skills-mcp-agent-projection.md)
23. [ADR-0007：Browser WebContentsView 与 Preview 安全边界](./adr/0007-browser-webcontentsview-preview-boundary.md)
24. [ADR-0008：Usage 权威接口与轮询边界](./adr/0008-usage-authority-polling-boundary.md)
25. [ADR-0009：桌宠多 Session 状态与窗口权限边界](./adr/0009-pet-multi-session-window-boundary.md)
26. [ADR-0010：HTML 批注隔离 World 与普通 Prompt 边界](./adr/0010-browser-annotation-isolated-world-and-prompt-boundary.md)
27. [ADR-0011：Prompt Queue 本地草稿边界](./adr/0011-prompt-queue-local-draft-boundary.md)
28. [ADR-0012：Attachment、Media 与 Markdown 安全边界](./adr/0012-attachment-media-and-markdown-boundary.md)
29. [ADR-0013：Conversation Controls 与 Markdown 本地图片边界](./adr/0013-kimi-web-conversation-controls-and-local-image-boundary.md)
30. [ADR-0014：Kimi Web BTW Side Chat 边界](./adr/0014-kimi-web-btw-side-chat-boundary.md)
31. [ADR-0015：Moon Code Agent 详情与独立 Transcript 边界](./adr/0015-kimi-agent-detail-transcript-boundary.md)
32. [ADR-0016：Kimi Web 文件 Mention 边界](./adr/0016-kimi-web-file-mention-boundary.md)
33. [ADR-0017：Kimi 多客户端全局状态失效边界](./adr/0017-kimi-global-state-invalidation-boundary.md)
34. [ADR-0019：次主力模型的 Provider 配置边界](./adr/0019-secondary-model-provider-configuration.md)

### Spike 实施记录

- [Spike A：托管 Kimi 运行时](./spikes/0001-managed-runtime.md)
- [Spike B：Kimi API 契约基线](./spikes/0002-kimi-contract.md)
- [Spike C：Kimi 0.29.2 次主力模型兼容性](./spikes/0003-secondary-model-0.29.2.md)

## 当前推进

P0 的非上游阻塞能力已经实现：真实 Session 的 snapshot/Transcript/Prompt/Approval/Question/Tool/Thinking/WS resync，Files/Changes/Diff、Session Terminal、Model/Provider/OAuth/Settings、Skills、MCP/Tools、Agent roster 与独立 Agent Detail 均已接入。Browser 支持 HTML 路由、隔离 WebContentsView、受限 Workspace Preview、localhost、视口、Console/Network、截图与元素/区域批注；Usage、Pet、Attachment/Media、GFM、代码、KaTeX、Mermaid 和多客户端状态失效也已有实现与打包态验证。当前可构建带正式图标的未签名 arm64 `.app` 和 DMG；公开 Beta 前仍需完成签名/公证和耐久性验证。逐项证据见 [P0 实现审计](./07-p0-implementation-audit.md)。
