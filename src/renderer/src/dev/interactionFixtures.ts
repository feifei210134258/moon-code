import type { ApprovalRequestView, KimiSessionWarning, QuestionRequestView } from '@shared/contracts'
import type { ChatTurn } from '../types'

export const approvalFixture: ApprovalRequestView = {
  approvalId: 'visual-approval',
  toolCallId: 'visual-tool',
  toolName: 'Shell',
  action: '运行项目测试并读取输出',
  display: 'pnpm test',
  createdAt: '2026-07-23T00:00:00.000Z',
  expiresAt: '2026-07-23T00:05:00.000Z'
}

export const questionFixture: QuestionRequestView = {
  questionId: 'visual-question',
  toolCallId: 'visual-tool',
  createdAt: '2026-07-23T00:00:00.000Z',
  questions: [{
    id: 'preview-mode',
    header: '预览方式',
    question: 'HTML 文件默认在哪里打开？',
    options: [
      {
        id: 'browser',
        label: '内置浏览器',
        description: '保留项目上下文，后续可继续添加 HTML 批注。',
        recommended: true
      },
      {
        id: 'system',
        label: '系统浏览器',
        description: '使用当前系统的默认浏览器打开。',
        recommended: false
      }
    ],
    multiSelect: false,
    allowOther: true,
    otherLabel: '其他方式…'
  }]
}

export const activityFixtureTurns: ChatTurn[] = [{
  id: 'visual-tool-turn',
  role: 'assistant',
  author: 'Kimi',
  time: '10:36',
  blocks: [
    {
      id: 'visual-tool-turn:text:0',
      type: 'text',
      text: '我先检查项目结构和现有测试，再继续实现。'
    },
    {
      id: 'visual-tool-turn:thinking:0',
      type: 'activity',
      activity: {
        id: 'visual-tool-turn:thinking:0',
        kind: 'thinking',
        label: 'Thinking',
        description: '检查工作区结构，确认需要修改的模块与测试边界',
        detail: '检查工作区结构，确认需要修改的模块与测试边界。\n保持 Kimi Session 为唯一事实源，并避免创建第二套消息状态。',
        status: 'done'
      }
    },
    {
      id: 'visual-tool-turn:tool:0',
      type: 'activity',
      activity: {
        id: 'visual-tool-turn:tool:0',
        kind: 'tool',
        label: 'Shell',
        description: 'pnpm test',
        inputPreview: '{"command":"pnpm test","cwd":"/workspace"}',
        outputPreview: 'Test Files  16 passed\nTests  45 passed',
        outputStream: 'stdout',
        progress: 64,
        status: 'running'
      }
    },
    {
      id: 'visual-tool-turn:text:1',
      type: 'text',
      text: [
        '## 实现结果',
        '',
        '| 能力 | 状态 |',
        '| --- | --- |',
        '| Attachment | 完成 |',
        '| Markdown | 验证中 |',
        '',
        '- [x] GFM 与 `TypeScript` 高亮',
        '- [x] 文件路径 src/renderer/index.html:8 可点击',
        '',
        '```ts',
        'const source: "kimi" = "kimi"',
        '```',
        '',
        '行内公式：$E = mc^2$',
        '',
        '```mermaid',
        'flowchart LR',
        '  A[选择附件] --> B[上传 Kimi]',
        '  B --> C[提交 Prompt]',
        '```'
      ].join('\n')
    }
  ]
}]

export const sessionWarningFixture: KimiSessionWarning[] = [{
  code: 'agents_too_large',
  message: '项目 AGENTS.md 超出推荐长度，部分指令可能被截断。',
  severity: 'warning'
}]
