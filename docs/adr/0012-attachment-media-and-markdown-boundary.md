# ADR-0012：Attachment、Media 与 Markdown 安全边界

- 状态：Accepted
- 日期：2026-07-24
- 基线：Kimi Code `0.29.0`

## 背景

Kimi Prompt 官方契约允许 `text`、`image`、`video` 和 `file` content。文件先通过全局 `POST /api/v1/files` 上传；历史媒体自 Kimi Code `0.37.2` 起通过带 Bearer 的 `GET /api/v1/sessions/{session_id}/media/{file_id}` 读取（早期版本为 `GET /api/v1/files/{file_id}`，保留为无会话上下文时的回退）。Renderer 不应获得 Kimi token，也不能把任意本机路径交给 Main 读取。

同时，Assistant 文本需要支持 GFM、代码高亮、KaTeX 和 Mermaid。模型输出属于不受信任内容，不能直接作为 HTML 或可执行图表注入 Renderer。

## 决策

1. 附件选择使用 Electron 原生文件对话框。路径只存在于 Main；Main 读取用户明确选择的文件并以 multipart 上传 Kimi。
2. Renderer 只接收 Kimi 文件描述符：`fileId/name/mediaType/size`。图片和视频按官方 Web 语义提交为 file source；普通文件提交为 file content。
3. 本地 Prompt Draft 可以保存文件描述符，但不会保存文件字节或建立第二套附件数据库。删除 Draft 时尽力清理尚未提交的 Kimi file。
4. 历史媒体和文件预览通过 typed IPC 请求 Main；Main 添加 Bearer 并返回字节，Renderer 创建短生命周期 Blob URL。token 不进入 Renderer、日志或 DOM。
5. Markdown 禁止 raw HTML，并在渲染后使用 DOMPurify。Mermaid 使用动态加载、`securityLevel: strict`、非 HTML label 和 SVG profile 二次净化。
6. 普通 HTTP(S) 链接可以保留；识别出的 Workspace 文件路径转成内部点击事件。HTML 文件继续沿既有路由进入内置开发浏览器。
7. 模型提供的远程媒体 URL 不自动加载，避免未确认的第三方请求。Kimi file 与 base64 media 可以直接预览。

## 后果

- Attachment、Media 和富文本仍以 Kimi Session/Message 为唯一事实源。
- 原生选择避免暴露任意路径读取 IPC，但上传需要 Main 暂时持有文件字节。
- 视频和大文件预览会占用一次 Blob 内存；后续可在有证据时升级为受限自定义协议或流式读取。
- Markdown 中的 Workspace 本地图片源重写仍需单独实现，不能用 Renderer 直接访问本机路径代替。

## 证据

- `KimiRestClient.test.ts`
- `kimiSessionBridge.test.ts`
- `promptInputs.test.ts`
- `composerSkills.test.ts`
- `mediaBlocks.test.ts`
- `markdownBlock.test.ts`
- 实际 Renderer 验收：GFM 表格、任务列表、代码、KaTeX、文件路径和 Mermaid 标签均可见，Console 无 error/warn。
