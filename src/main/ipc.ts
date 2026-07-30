import { app, dialog, ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { basename } from 'node:path'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { lookup as lookupMediaType } from 'mime-types'
import {
  ipcChannels,
  type AppBootstrapState,
  type BrowserAnnotationDraft,
  type BrowserAnnotationMode,
  type BrowserAnnotationSubmitInput,
  type BrowserCaptureResult,
  type BrowserNetworkDetails,
  type BrowserViewState,
  type KimiOAuthCancelResult,
  type KimiOAuthFlow,
  type KimiMcpServer,
  type KimiAttachmentBlob,
  type KimiAttachmentPickResult,
  type KimiUploadedFile,
  type KimiGlobalStateEvent,
  type KimiSessionRuntimeStatus,
  type KimiSideChatView,
  type KimiAgentTranscript,
  type KimiSessionGoal,
  type KimiSessionOperationalState,
  type KimiProviderRefreshResult,
  type KimiSettingsPreferences,
  type KimiSettingsSnapshot,
  type KimiSkill,
  type KimiSkillActivationResult,
  type KimiTool,
  type KimiUsageState,
  type KimiCliUpdateState,
  type InteractionResolveResult,
  type PromptAbortResult,
  type PromptSteerResult,
  type PromptSubmissionResult,
  type QuestionDismissResult,
  type RuntimePublicState,
  type SessionTerminal,
  type SessionViewState,
  type TerminalExitEvent,
  type TerminalOutputEvent,
  type WorkspaceFileDiff,
  type WorkspaceFileList,
  type WorkspaceFilePreview,
  type WorkspaceFileSearchResult,
  type WorkspaceGrepResult,
  type WorkspaceGitStatus,
  type WorkspaceGitBranches,
  type WorkspaceOpenApp,
  type WorkspaceNavigationItem,
  type WorkspaceNavigationSnapshot,
  type KimiSessionWarning,
  type KimiUndoDraft,
  type WorkspaceAddResult,
  type WorkspaceMarkdownImage,
  type SessionCreateResult,
  type SessionExportResult
} from '../shared/contracts.js'
import type { SessionSummary } from '../../packages/kimi-adapter/src/wire/schemas.js'
import { discoverRuntimes } from './runtime/discovery.js'
import type { KimiRuntimeManager } from './runtime/KimiRuntimeManager.js'
import type { KimiSessionBridge } from './kimi/KimiSessionBridge.js'
import type { KimiSettingsBridge } from './kimi/KimiSettingsBridge.js'
import type { KimiCapabilitiesBridge } from './kimi/KimiCapabilitiesBridge.js'
import type { KimiBrowserManager } from './browser/KimiBrowserManager.js'
import type { KimiUsageService } from './kimi/KimiUsageService.js'
import type { KimiPetService } from './pet/KimiPetService.js'
import type { KimiCliUpdateService } from './runtime/KimiCliUpdateService.js'
import { discoverLocalDevServers } from './browser/LocalDevServerDiscovery.js'
import {
  validateCapabilityId,
  validateOptionalSessionId,
  validateOptionalSkillArgs
} from './security/capabilityInputs.js'
import { validateQuestionAnswers } from './security/interactionInputs.js'
import {
  validateAnnotationDraftId,
  validateAnnotationMode,
  validateAnnotationSubmitInput
} from './security/annotationInputs.js'
import {
  assertTerminalId,
  validateTerminalInput,
  validateTerminalSinceSeq,
  validateTerminalSize,
  validateTerminalSizeInput
} from './security/terminalInputs.js'
import { isTrustedRendererUrl } from './security/trustedRenderer.js'
import {
  validateAddProviderInput,
  validateModelId,
  validatePreferencesPatch,
  validateProviderId,
  validateProviderRefreshInput,
  validateSecondaryModelInput,
  validateUpdateProviderInput
} from './security/settingsInputs.js'
import { validateWorkspacePath } from './security/workspaceInputs.js'
import {
  validateFileSearchQuery,
  validateWorkspaceLine,
  validateWorkspaceOpenApp
} from './security/fileSearchInputs.js'
import {
  validateMediaType,
  validatePastedAttachment,
  validatePromptControls,
  validatePromptInput,
  validateSideChatPromptInput
} from './security/promptInputs.js'
import {
  validateCompactInstruction,
  validateMarkdownImageSource,
  validateUndoCount
} from './security/conversationInputs.js'
import {
  validateLifecycleSessionId,
  validateSessionTitle,
  validateWorkspaceId,
  validateWorkspaceName
} from './security/lifecycleInputs.js'
import {
  validateBrowserBounds,
  validateBrowserRequestId,
  validateBrowserUrl,
  validateBrowserViewport,
  validateBrowserWorkspaceScope
} from './security/browserInputs.js'
import { validateRuntimeExternalConnection } from './security/runtimeInputs.js'

export function registerIpc(
  runtime: KimiRuntimeManager,
  sessions: KimiSessionBridge,
  settings: KimiSettingsBridge,
  capabilities: KimiCapabilitiesBridge,
  browser: KimiBrowserManager,
  usage: KimiUsageService,
  pets: KimiPetService,
  cliUpdates: KimiCliUpdateService,
  getMainWindow: () => BrowserWindow | null,
  trustedRendererUrl: string
): void {
  const assertTrustedSender = (event: IpcMainInvokeEvent): void => {
    const window = getMainWindow()
    const senderUrl = event.senderFrame?.url ?? ''
    if (
      window === null ||
      event.sender !== window.webContents ||
      !isTrustedRendererUrl(senderUrl, trustedRendererUrl)
    ) {
      throw new Error('Rejected IPC request from an untrusted renderer')
    }
  }

  ipcMain.handle(ipcChannels.appBootstrap, async (event): Promise<AppBootstrapState> => {
    assertTrustedSender(event)
    return {
      appVersion: app.getVersion(),
      platform: process.platform,
      runtime: runtime.state,
      discovery: await discoverRuntimes()
    }
  })
  ipcMain.handle(ipcChannels.runtimeDiscover, (event) => {
    assertTrustedSender(event)
    return discoverRuntimes()
  })
  ipcMain.handle(ipcChannels.kimiCliUpdateCheck, async (event): Promise<KimiCliUpdateState> => {
    assertTrustedSender(event)
    return await cliUpdates.check()
  })
  ipcMain.handle(ipcChannels.kimiCliUpdateDownload, async (event): Promise<KimiCliUpdateState> => {
    assertTrustedSender(event)
    return await cliUpdates.install()
  })
  ipcMain.handle(ipcChannels.runtimeStart, (event, mode?: unknown) => {
    assertTrustedSender(event)
    if (mode !== undefined && mode !== 'managed' && mode !== 'system') {
      throw new TypeError('Invalid Kimi runtime mode')
    }
    return runtime.start(mode)
  })
  ipcMain.handle(ipcChannels.runtimeRestart, async (event) => {
    assertTrustedSender(event)
    await sessions.close()
    return await runtime.restart()
  })
  ipcMain.handle(ipcChannels.runtimeConnectExternal, (event, input?: unknown) => {
    assertTrustedSender(event)
    return runtime.connectExternal(validateRuntimeExternalConnection(input))
  })
  ipcMain.handle(ipcChannels.runtimeStop, async (event) => {
    assertTrustedSender(event)
    const cleanup = sessions.close()
    const state = await runtime.stop()
    await cleanup
    return state
  })
  ipcMain.handle(ipcChannels.workspaceTree, async (event): Promise<WorkspaceNavigationItem[]> => {
    assertTrustedSender(event)
    return (await loadWorkspaceNavigationSnapshot(runtime)).workspaces
  })
  ipcMain.handle(
    ipcChannels.workspaceTreePage,
    async (event, beforeId?: unknown): Promise<WorkspaceNavigationSnapshot> => {
      assertTrustedSender(event)
      if (beforeId !== undefined) assertShortId(beforeId, 'session page cursor')
      return await loadWorkspaceNavigationSnapshot(runtime, beforeId)
    }
  )
  ipcMain.handle(ipcChannels.workspaceAdd, async (event): Promise<WorkspaceAddResult> => {
    assertTrustedSender(event)
    const window = getMainWindow()
    if (window === null) return { cancelled: true, workspaceId: null }
    const selection = await dialog.showOpenDialog(window, {
      title: '添加 Kimi Workspace',
      buttonLabel: '添加项目',
      properties: ['openDirectory', 'createDirectory']
    })
    const root = selection.filePaths[0]
    if (selection.canceled || root === undefined) return { cancelled: true, workspaceId: null }
    const workspace = await runtime.createRestClient().addWorkspace({ root })
    return { cancelled: false, workspaceId: workspace.id }
  })
  ipcMain.handle(ipcChannels.workspaceRename, async (event, workspaceId?: unknown, name?: unknown): Promise<void> => {
    assertTrustedSender(event)
    await runtime.createRestClient().renameWorkspace(
      validateWorkspaceId(workspaceId),
      validateWorkspaceName(name)
    )
  })
  ipcMain.handle(ipcChannels.workspaceDelete, async (event, workspaceId?: unknown): Promise<void> => {
    assertTrustedSender(event)
    await runtime.createRestClient().deleteWorkspace(validateWorkspaceId(workspaceId))
  })
  ipcMain.handle(ipcChannels.sessionCreate, async (event, workspaceId?: unknown): Promise<SessionCreateResult> => {
    assertTrustedSender(event)
    const session = await runtime.createRestClient().createSession({
      workspaceId: validateWorkspaceId(workspaceId)
    })
    return { sessionId: session.id, workspaceId: session.workspace_id }
  })
  ipcMain.handle(ipcChannels.sessionRename, async (event, sessionId?: unknown, title?: unknown): Promise<void> => {
    assertTrustedSender(event)
    await runtime.createRestClient().renameSession(
      validateLifecycleSessionId(sessionId),
      validateSessionTitle(title)
    )
  })
  ipcMain.handle(ipcChannels.sessionArchive, async (event, sessionId?: unknown): Promise<void> => {
    assertTrustedSender(event)
    await runtime.createRestClient().archiveSession(validateLifecycleSessionId(sessionId))
  })
  ipcMain.handle(ipcChannels.sessionRestore, async (event, sessionId?: unknown): Promise<SessionCreateResult> => {
    assertTrustedSender(event)
    const session = await runtime.createRestClient().restoreSession(validateLifecycleSessionId(sessionId))
    return { sessionId: session.id, workspaceId: session.workspace_id }
  })
  ipcMain.handle(ipcChannels.sessionFork, async (event, sessionId?: unknown): Promise<SessionCreateResult> => {
    assertTrustedSender(event)
    const session = await runtime.createRestClient().forkSession(validateLifecycleSessionId(sessionId))
    return { sessionId: session.id, workspaceId: session.workspace_id }
  })
  ipcMain.handle(ipcChannels.sessionExport, async (event, sessionId?: unknown): Promise<SessionExportResult> => {
    assertTrustedSender(event)
    const id = validateLifecycleSessionId(sessionId)
    const window = getMainWindow()
    if (window === null) return { saved: false }
    const destination = await dialog.showSaveDialog(window, {
      title: '导出 Kimi Session',
      defaultPath: `${id}.zip`,
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
    })
    if (destination.canceled || destination.filePath === undefined) return { saved: false }
    await writeFile(destination.filePath, await runtime.createRestClient().exportSession(id))
    return { saved: true }
  })
  ipcMain.handle(ipcChannels.sessionsArchivedList, async (event): Promise<WorkspaceNavigationItem['sessions']> => {
    assertTrustedSender(event)
    const page = await runtime.createRestClient().listSessionPage({
      archivedOnly: true,
      pageSize: 100
    })
    return page.items.map(projectSessionNavigation)
  })
  ipcMain.handle(
    ipcChannels.sessionChildrenList,
    async (event, sessionId?: unknown): Promise<WorkspaceNavigationItem['sessions']> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      return (await runtime.createRestClient().listChildSessions(sessionId)).map(projectSessionNavigation)
    }
  )
  ipcMain.handle(
    ipcChannels.sessionWarningsList,
    async (event, sessionId?: unknown): Promise<KimiSessionWarning[]> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      return await runtime.createRestClient().getSessionWarnings(sessionId)
    }
  )
  ipcMain.handle(ipcChannels.sessionOpen, async (event, sessionId?: unknown): Promise<SessionViewState> => {
    assertTrustedSender(event)
    assertSessionId(sessionId)
    return await sessions.openSession(sessionId)
  })
  ipcMain.handle(
    ipcChannels.sessionRuntimeGet,
    async (event, sessionId?: unknown): Promise<KimiSessionRuntimeStatus> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      return await sessions.getRuntimeStatus(sessionId)
    }
  )
  ipcMain.handle(
    ipcChannels.sessionPlanModeSet,
    async (event, sessionId?: unknown, enabled?: unknown): Promise<void> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      if (typeof enabled !== 'boolean') throw new Error('Invalid plan mode value')
      await sessions.setSessionPlanMode(sessionId, enabled)
    }
  )
  ipcMain.handle(
    ipcChannels.sessionOperationalGet,
    async (event, sessionId?: unknown): Promise<KimiSessionOperationalState> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      return await sessions.getOperationalState(sessionId)
    }
  )
  ipcMain.handle(
    ipcChannels.sessionCompact,
    async (event, sessionId?: unknown, instruction?: unknown): Promise<void> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      await sessions.compactSession(sessionId, validateCompactInstruction(instruction))
    }
  )
  ipcMain.handle(
    ipcChannels.sessionUndo,
    async (event, sessionId?: unknown, count?: unknown): Promise<KimiUndoDraft | null> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      return await sessions.undoSession(sessionId, validateUndoCount(count))
    }
  )
  ipcMain.handle(
    ipcChannels.sideChatStart,
    async (event, sessionId?: unknown): Promise<KimiSideChatView> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      return await sessions.startSideChat(sessionId)
    }
  )
  ipcMain.handle(
    ipcChannels.sideChatPrompt,
    async (
      event,
      sessionId?: unknown,
      agentId?: unknown,
      input?: unknown
    ): Promise<PromptSubmissionResult> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      assertShortId(agentId, 'Side Chat agent')
      return await sessions.submitSideChatPrompt(sessionId, agentId, validateSideChatPromptInput(input))
    }
  )
  ipcMain.handle(ipcChannels.sideChatClose, (event, sessionId?: unknown, agentId?: unknown): void => {
    assertTrustedSender(event)
    assertSessionId(sessionId)
    assertShortId(agentId, 'Side Chat agent')
    sessions.closeSideChat(sessionId, agentId)
  })
  ipcMain.handle(
    ipcChannels.agentTranscriptGet,
    async (event, sessionId?: unknown, agentId?: unknown): Promise<KimiAgentTranscript> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      assertShortId(agentId, 'agent')
      return await sessions.getAgentTranscript(sessionId, agentId)
    }
  )
  ipcMain.handle(
    ipcChannels.sessionGoalControl,
    async (event, sessionId?: unknown, control?: unknown): Promise<KimiSessionGoal | null> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      if (control !== 'pause' && control !== 'resume' && control !== 'cancel') {
        throw new TypeError('Invalid Kimi goal control')
      }
      return await sessions.controlGoal(sessionId, control)
    }
  )
  ipcMain.handle(
    ipcChannels.taskCancel,
    async (event, sessionId?: unknown, taskId?: unknown): Promise<{ cancelled: true }> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      assertShortId(taskId, 'task')
      return await sessions.cancelTask(sessionId, taskId)
    }
  )
  ipcMain.handle(
    ipcChannels.promptSubmit,
    async (event, sessionId?: unknown, input?: unknown): Promise<PromptSubmissionResult> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      return await sessions.submitPrompt(sessionId, validatePromptInput(input))
    }
  )
  ipcMain.handle(
    ipcChannels.promptSteer,
    async (event, sessionId?: unknown, promptIds?: unknown): Promise<PromptSteerResult> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      if (
        !Array.isArray(promptIds) ||
        promptIds.length < 1 ||
        promptIds.length > 100 ||
        !promptIds.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 256)
      ) throw new TypeError('Invalid Kimi prompt ids')
      return await sessions.steerPrompts(sessionId, promptIds)
    }
  )
  ipcMain.handle(
    ipcChannels.promptAbort,
    async (event, sessionId?: unknown, promptId?: unknown): Promise<PromptAbortResult> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      if (typeof promptId !== 'string' || promptId.length < 1 || promptId.length > 256) {
        throw new TypeError('Invalid Kimi prompt id')
      }
      return await sessions.abortPrompt(sessionId, promptId)
    }
  )
  ipcMain.handle(
    ipcChannels.sessionAbort,
    async (event, sessionId?: unknown): Promise<{ aborted: boolean }> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      return await sessions.abortSession(sessionId)
    }
  )
  ipcMain.handle(
    ipcChannels.approvalRespond,
    async (
      event,
      sessionId?: unknown,
      approvalId?: unknown,
      response?: unknown
    ): Promise<InteractionResolveResult> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      assertShortId(approvalId, 'approval')
      if (!isRecord(response)) throw new TypeError('Invalid Kimi approval response')
      const decision = response.decision
      const scope = response.scope
      if (
        (decision !== 'approved' && decision !== 'rejected' && decision !== 'cancelled') ||
        (scope !== undefined && scope !== 'session')
      ) throw new TypeError('Invalid Kimi approval response')
      return await sessions.respondApproval(sessionId, approvalId, {
        decision,
        ...(scope === undefined ? {} : { scope })
      })
    }
  )
  ipcMain.handle(
    ipcChannels.questionRespond,
    async (
      event,
      sessionId?: unknown,
      questionId?: unknown,
      answers?: unknown
    ): Promise<InteractionResolveResult> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      assertShortId(questionId, 'question')
      return await sessions.respondQuestion(sessionId, questionId, validateQuestionAnswers(answers))
    }
  )
  ipcMain.handle(
    ipcChannels.questionDismiss,
    async (event, sessionId?: unknown, questionId?: unknown): Promise<QuestionDismissResult> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      assertShortId(questionId, 'question')
      return await sessions.dismissQuestion(sessionId, questionId)
    }
  )
  ipcMain.handle(ipcChannels.attachmentsPick, async (event): Promise<KimiAttachmentPickResult> => {
    assertTrustedSender(event)
    const window = getMainWindow()
    if (window === null) return { cancelled: true, files: [] }
    const selection = await dialog.showOpenDialog(window, {
      title: '添加到 Kimi Prompt',
      buttonLabel: '添加附件',
      properties: ['openFile', 'multiSelections']
    })
    if (selection.canceled || selection.filePaths.length === 0) return { cancelled: true, files: [] }
    const client = runtime.createRestClient()
    const files = []
    for (const path of selection.filePaths) {
      const name = basename(path)
      const mediaType = lookupMediaType(path) || 'application/octet-stream'
      const uploaded = await client.uploadFile({ bytes: await readFile(path), name, mediaType })
      files.push({
        fileId: uploaded.id,
        name: uploaded.name,
        mediaType: uploaded.media_type,
        size: uploaded.size
      })
    }
    return { cancelled: false, files }
  })
  ipcMain.handle(ipcChannels.attachmentsPaste, async (event, input?: unknown): Promise<KimiUploadedFile> => {
    assertTrustedSender(event)
    const safe = validatePastedAttachment(input)
    const uploaded = await runtime.createRestClient().uploadFile(safe)
    return {
      fileId: uploaded.id,
      name: uploaded.name,
      mediaType: uploaded.media_type,
      size: uploaded.size
    }
  })
  ipcMain.handle(
    ipcChannels.attachmentsAddWorkspaceFile,
    async (event, sessionId?: unknown, path?: unknown): Promise<KimiUploadedFile> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      const target = sessions.workspaceFileSystemPath(sessionId, validateWorkspacePath(path))
      const targetStat = await stat(target)
      if (!targetStat.isFile()) throw new Error('只能将文件添加为会话附件，文件夹请以路径形式引用。')
      const mediaType = lookupMediaType(target) || 'application/octet-stream'
      const uploaded = await runtime
        .createRestClient()
        .uploadFile({ bytes: await readFile(target), name: basename(target), mediaType })
      return {
        fileId: uploaded.id,
        name: uploaded.name,
        mediaType: uploaded.media_type,
        size: uploaded.size
      }
    }
  )
  ipcMain.handle(
    ipcChannels.attachmentRead,
    async (event, fileId?: unknown, mediaType?: unknown): Promise<KimiAttachmentBlob> => {
      assertTrustedSender(event)
      assertShortId(fileId, 'file')
      const safeMediaType = validateMediaType(mediaType)
      return {
        fileId,
        mediaType: safeMediaType,
        bytes: await runtime.createRestClient().downloadFile(fileId)
      }
    }
  )
  ipcMain.handle(ipcChannels.attachmentDiscard, async (event, fileId?: unknown): Promise<void> => {
    assertTrustedSender(event)
    assertShortId(fileId, 'file')
    await runtime.createRestClient().deleteFile(fileId)
  })
  ipcMain.handle(
    ipcChannels.filesList,
    async (event, sessionId?: unknown, path?: unknown): Promise<WorkspaceFileList> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      const safePath = path === undefined ? '.' : validateWorkspacePath(path, { allowRoot: true })
      return await sessions.listFiles(sessionId, safePath)
    }
  )
  ipcMain.handle(
    ipcChannels.filesRead,
    async (event, sessionId?: unknown, path?: unknown): Promise<WorkspaceFilePreview> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      return await sessions.readFile(sessionId, validateWorkspacePath(path))
    }
  )
  ipcMain.handle(
    ipcChannels.filesSearch,
    async (event, sessionId?: unknown, query?: unknown): Promise<WorkspaceFileSearchResult> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      return await sessions.searchFiles(sessionId, validateFileSearchQuery(query, 'search'))
    }
  )
  ipcMain.handle(
    ipcChannels.filesGrep,
    async (event, sessionId?: unknown, pattern?: unknown): Promise<WorkspaceGrepResult> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      return await sessions.grepFiles(sessionId, validateFileSearchQuery(pattern, 'grep'))
    }
  )
  ipcMain.handle(
    ipcChannels.filesDownload,
    async (event, sessionId?: unknown, path?: unknown): Promise<{ saved: boolean }> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      const safePath = validateWorkspacePath(path)
      const saveOptions = { defaultPath: basename(safePath) }
      const window = getMainWindow()
      const target = window === null
        ? await dialog.showSaveDialog(saveOptions)
        : await dialog.showSaveDialog(window, saveOptions)
      if (target.canceled || target.filePath === undefined) return { saved: false }
      await writeFile(target.filePath, await sessions.downloadWorkspaceFile(sessionId, safePath))
      return { saved: true }
    }
  )
  ipcMain.handle(
    ipcChannels.filesOpen,
    async (event, sessionId?: unknown, path?: unknown, line?: unknown): Promise<{ opened: true }> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      return await sessions.openWorkspaceFile(sessionId, validateWorkspacePath(path), validateWorkspaceLine(line))
    }
  )
  ipcMain.handle(
    ipcChannels.filesOpenIn,
    async (
      event,
      sessionId?: unknown,
      appId?: unknown,
      path?: unknown,
      line?: unknown
    ): Promise<{ opened: true }> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      return await sessions.openWorkspaceFileIn(
        sessionId,
        validateWorkspaceOpenApp(appId),
        validateWorkspacePath(path),
        validateWorkspaceLine(line)
      )
    }
  )
  ipcMain.handle(
    ipcChannels.filesReveal,
    async (event, sessionId?: unknown, path?: unknown): Promise<{ revealed: true }> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      return await sessions.revealWorkspaceFile(sessionId, validateWorkspacePath(path))
    }
  )
  ipcMain.handle(
    ipcChannels.filesOpenSystem,
    async (event, sessionId?: unknown, path?: unknown): Promise<{ opened: true }> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      const target = sessions.workspaceFileSystemPath(sessionId, validateWorkspacePath(path))
      const reason = await shell.openPath(target)
      if (reason.length > 0) throw new Error(`系统无法打开该文件：${reason}`)
      return { opened: true }
    }
  )
  ipcMain.handle(
    ipcChannels.filesTrash,
    async (event, sessionId?: unknown, path?: unknown): Promise<{ trashed: true }> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      const target = sessions.workspaceFileSystemPath(sessionId, validateWorkspacePath(path))
      await shell.trashItem(target)
      return { trashed: true }
    }
  )
  ipcMain.handle(
    ipcChannels.markdownImageRead,
    async (event, sessionId?: unknown, source?: unknown): Promise<WorkspaceMarkdownImage | null> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      return await sessions.readMarkdownImage(sessionId, validateMarkdownImageSource(source))
    }
  )
  ipcMain.handle(
    ipcChannels.gitStatus,
    async (event, sessionId?: unknown): Promise<WorkspaceGitStatus> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      return await sessions.getGitStatus(sessionId)
    }
  )
  ipcMain.handle(
    ipcChannels.gitBranches,
    async (event, sessionId?: unknown): Promise<WorkspaceGitBranches> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      return await sessions.listGitBranches(sessionId)
    }
  )
  ipcMain.handle(
    ipcChannels.fileDiff,
    async (event, sessionId?: unknown, path?: unknown): Promise<WorkspaceFileDiff> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      return await sessions.getFileDiff(sessionId, validateWorkspacePath(path))
    }
  )
  ipcMain.handle(
    ipcChannels.terminalsList,
    async (event, sessionId?: unknown): Promise<SessionTerminal[]> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      return await sessions.listTerminals(sessionId)
    }
  )
  ipcMain.handle(
    ipcChannels.terminalCreate,
    async (event, sessionId?: unknown, size?: unknown): Promise<SessionTerminal> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      return await sessions.createTerminal(sessionId, validateTerminalSizeInput(size))
    }
  )
  ipcMain.handle(
    ipcChannels.terminalAttach,
    async (event, sessionId?: unknown, terminalId?: unknown, sinceSeq?: unknown): Promise<void> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      assertTerminalId(terminalId)
      await sessions.attachTerminal(sessionId, terminalId, validateTerminalSinceSeq(sinceSeq))
    }
  )
  ipcMain.handle(
    ipcChannels.terminalDetach,
    async (event, sessionId?: unknown, terminalId?: unknown): Promise<void> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      assertTerminalId(terminalId)
      await sessions.detachTerminal(sessionId, terminalId)
    }
  )
  ipcMain.handle(
    ipcChannels.terminalInput,
    async (event, sessionId?: unknown, terminalId?: unknown, data?: unknown): Promise<void> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      assertTerminalId(terminalId)
      await sessions.sendTerminalInput(sessionId, terminalId, validateTerminalInput(data))
    }
  )
  ipcMain.handle(
    ipcChannels.terminalResize,
    async (
      event,
      sessionId?: unknown,
      terminalId?: unknown,
      cols?: unknown,
      rows?: unknown
    ): Promise<void> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      assertTerminalId(terminalId)
      const size = validateTerminalSize(cols, rows)
      await sessions.resizeTerminal(sessionId, terminalId, size.cols, size.rows)
    }
  )
  ipcMain.handle(
    ipcChannels.terminalClose,
    async (event, sessionId?: unknown, terminalId?: unknown): Promise<{ closed: boolean }> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      assertTerminalId(terminalId)
      return await sessions.closeTerminal(sessionId, terminalId)
    }
  )
  ipcMain.handle(ipcChannels.settingsGet, async (event): Promise<KimiSettingsSnapshot> => {
    assertTrustedSender(event)
    return await settings.getSnapshot()
  })
  ipcMain.handle(
    ipcChannels.settingsDefaultModelSet,
    async (event, modelId?: unknown): Promise<KimiSettingsSnapshot> => {
      assertTrustedSender(event)
      return await settings.setDefaultModel(validateModelId(modelId))
    }
  )
  ipcMain.handle(
    ipcChannels.settingsSecondaryModelSet,
    async (event, input?: unknown): Promise<KimiSettingsSnapshot> => {
      assertTrustedSender(event)
      return await settings.setSecondaryModel(validateSecondaryModelInput(input))
    }
  )
  ipcMain.handle(
    ipcChannels.settingsSecondaryModelDisable,
    async (event): Promise<KimiSettingsSnapshot> => {
      assertTrustedSender(event)
      return await settings.disableSecondaryModel()
    }
  )
  ipcMain.handle(
    ipcChannels.settingsSecondaryModelInherit,
    async (event): Promise<KimiSettingsSnapshot> => {
      assertTrustedSender(event)
      return await settings.inheritSecondaryModel()
    }
  )
  ipcMain.handle(
    ipcChannels.settingsPreferencesUpdate,
    async (event, patch?: unknown): Promise<KimiSettingsPreferences> => {
      assertTrustedSender(event)
      return await settings.updatePreferences(validatePreferencesPatch(patch))
    }
  )
  ipcMain.handle(
    ipcChannels.providerAdd,
    async (event, input?: unknown): Promise<KimiSettingsSnapshot> => {
      assertTrustedSender(event)
      return await settings.addProvider(validateAddProviderInput(input))
    }
  )
  ipcMain.handle(
    ipcChannels.providerUpdate,
    async (event, input?: unknown): Promise<KimiSettingsSnapshot> => {
      assertTrustedSender(event)
      return await settings.updateProvider(validateUpdateProviderInput(input))
    }
  )
  ipcMain.handle(
    ipcChannels.providerDelete,
    async (event, providerId?: unknown): Promise<KimiSettingsSnapshot> => {
      assertTrustedSender(event)
      return await settings.deleteProvider(validateProviderId(providerId)!)
    }
  )
  ipcMain.handle(
    ipcChannels.providersRefresh,
    async (event, input?: unknown): Promise<KimiProviderRefreshResult> => {
      assertTrustedSender(event)
      return await settings.refreshProviders(validateProviderRefreshInput(input))
    }
  )
  ipcMain.handle(
    ipcChannels.oauthLoginStart,
    async (event, provider?: unknown): Promise<KimiOAuthFlow> => {
      assertTrustedSender(event)
      const flow = await settings.startOAuthLogin(validateProviderId(provider, true))
      if (flow.status === 'authenticated') void usage.refresh()
      return flow
    }
  )
  ipcMain.handle(
    ipcChannels.oauthLoginPoll,
    async (event, provider?: unknown): Promise<KimiOAuthFlow | null> => {
      assertTrustedSender(event)
      const flow = await settings.pollOAuthLogin(validateProviderId(provider, true))
      if (flow?.status === 'authenticated') void usage.refresh()
      return flow
    }
  )
  ipcMain.handle(
    ipcChannels.oauthLoginCancel,
    async (event, provider?: unknown): Promise<KimiOAuthCancelResult> => {
      assertTrustedSender(event)
      return await settings.cancelOAuthLogin(validateProviderId(provider, true))
    }
  )
  ipcMain.handle(
    ipcChannels.oauthLogout,
    async (event, provider?: unknown): Promise<{ loggedOut: true; provider: string }> => {
      assertTrustedSender(event)
      const result = await settings.logoutOAuth(validateProviderId(provider, true))
      void usage.refresh()
      return result
    }
  )
  ipcMain.handle(
    ipcChannels.skillsSessionList,
    async (event, sessionId?: unknown): Promise<KimiSkill[]> => {
      assertTrustedSender(event)
      return await capabilities.listSessionSkills(validateCapabilityId(sessionId, 'session id'))
    }
  )
  ipcMain.handle(
    ipcChannels.skillsWorkspaceList,
    async (event, workspaceId?: unknown): Promise<KimiSkill[]> => {
      assertTrustedSender(event)
      return await capabilities.listWorkspaceSkills(validateCapabilityId(workspaceId, 'workspace id'))
    }
  )
  ipcMain.handle(
    ipcChannels.skillActivate,
    async (
      event,
      sessionId?: unknown,
      skillName?: unknown,
      args?: unknown
    ): Promise<KimiSkillActivationResult> => {
      assertTrustedSender(event)
      const safeSessionId = validateCapabilityId(sessionId, 'session id')
      sessions.beginSkillActivation(safeSessionId)
      try {
        return await capabilities.activateSkill(
          safeSessionId,
          validateCapabilityId(skillName, 'skill name'),
          validateOptionalSkillArgs(args)
        )
      } catch (error) {
        sessions.rejectSkillActivation(safeSessionId)
        throw error
      }
    }
  )
  ipcMain.handle(
    ipcChannels.toolsList,
    async (event, sessionId?: unknown): Promise<KimiTool[]> => {
      assertTrustedSender(event)
      return await capabilities.listTools(validateOptionalSessionId(sessionId))
    }
  )
  ipcMain.handle(ipcChannels.mcpServersList, async (event): Promise<KimiMcpServer[]> => {
    assertTrustedSender(event)
    return await capabilities.listMcpServers()
  })
  ipcMain.handle(
    ipcChannels.mcpServerRestart,
    async (event, serverId?: unknown): Promise<{ restarting: true }> => {
      assertTrustedSender(event)
      return await capabilities.restartMcpServer(validateCapabilityId(serverId, 'MCP server id'))
    }
  )
  ipcMain.handle(
    ipcChannels.browserOpenHtml,
    async (event, sessionId?: unknown, path?: unknown): Promise<BrowserViewState> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      return await browser.openHtml(sessionId, validateWorkspacePath(path))
    }
  )
  ipcMain.handle(
    ipcChannels.browserNavigate,
    async (event, url?: unknown): Promise<BrowserViewState> => {
      assertTrustedSender(event)
      return await browser.navigate(validateBrowserUrl(url))
    }
  )
  ipcMain.handle(ipcChannels.browserBack, (event): BrowserViewState => {
    assertTrustedSender(event)
    return browser.back()
  })
  ipcMain.handle(ipcChannels.browserForward, (event): BrowserViewState => {
    assertTrustedSender(event)
    return browser.forward()
  })
  ipcMain.handle(ipcChannels.browserReload, (event): BrowserViewState => {
    assertTrustedSender(event)
    return browser.reload()
  })
  ipcMain.handle(ipcChannels.browserStop, (event): BrowserViewState => {
    assertTrustedSender(event)
    return browser.stop()
  })
  ipcMain.handle(ipcChannels.browserSetBounds, (event, bounds?: unknown): void => {
    assertTrustedSender(event)
    browser.setBounds(validateBrowserBounds(bounds))
  })
  ipcMain.handle(
    ipcChannels.browserSetVisible,
    async (event, visible?: unknown): Promise<BrowserViewState> => {
      assertTrustedSender(event)
      if (typeof visible !== 'boolean') throw new TypeError('Invalid browser visibility')
      return await browser.setVisible(visible)
    }
  )
  ipcMain.handle(ipcChannels.browserSetOverlay, (event, open?: unknown): void => {
    assertTrustedSender(event)
    if (typeof open !== 'boolean') throw new TypeError('Invalid browser overlay state')
    browser.setOverlayOpen(open)
  })
  ipcMain.handle(
    ipcChannels.browserSetWorkspace,
    async (event, scope?: unknown): Promise<BrowserViewState> => {
      assertTrustedSender(event)
      return await browser.setWorkspaceScope(validateBrowserWorkspaceScope(scope))
    }
  )
  ipcMain.handle(
    ipcChannels.browserSetViewport,
    async (event, viewport?: unknown): Promise<BrowserViewState> => {
      assertTrustedSender(event)
      return await browser.setViewport(validateBrowserViewport(viewport))
    }
  )
  ipcMain.handle(ipcChannels.browserClearConsole, (event): BrowserViewState => {
    assertTrustedSender(event)
    return browser.clearConsole()
  })
  ipcMain.handle(ipcChannels.browserClearNetwork, (event): BrowserViewState => {
    assertTrustedSender(event)
    return browser.clearNetwork()
  })
  ipcMain.handle(
    ipcChannels.browserNetworkDetails,
    async (event, requestId?: unknown): Promise<BrowserNetworkDetails> => {
      assertTrustedSender(event)
      return await browser.getNetworkDetails(validateBrowserRequestId(requestId))
    }
  )
  ipcMain.handle(
    ipcChannels.browserCapture,
    async (event, fullPage?: unknown): Promise<BrowserCaptureResult> => {
      assertTrustedSender(event)
      if (typeof fullPage !== 'boolean') throw new TypeError('Invalid browser capture mode')
      return await browser.capture(fullPage)
    }
  )
  ipcMain.handle(
    ipcChannels.browserAnnotationPick,
    async (event, mode?: unknown): Promise<BrowserAnnotationDraft> => {
      assertTrustedSender(event)
      return await browser.pickAnnotation(validateAnnotationMode(mode) as BrowserAnnotationMode)
    }
  )
  ipcMain.handle(ipcChannels.browserAnnotationDelete, (event, draftId?: unknown): void => {
    assertTrustedSender(event)
    browser.deleteAnnotation(validateAnnotationDraftId(draftId))
  })
  ipcMain.handle(
    ipcChannels.browserAnnotationSubmit,
    async (
      event,
      sessionId?: unknown,
      input?: unknown,
      controls?: unknown
    ): Promise<PromptSubmissionResult> => {
      assertTrustedSender(event)
      assertSessionId(sessionId)
      const validated = validateAnnotationSubmitInput(input) as BrowserAnnotationSubmitInput
      const result = await sessions.submitVisualAnnotation(
        sessionId,
        browser.prepareAnnotationSubmission(validated),
        validatePromptControls(controls)
      )
      browser.deleteAnnotation(validated.draftId)
      return result
    }
  )
  ipcMain.handle(ipcChannels.browserOpenExternal, async (event): Promise<{ opened: true }> => {
    assertTrustedSender(event)
    return await browser.openExternal()
  })
  ipcMain.handle(ipcChannels.browserDiscoverLocal, async (event): Promise<string[]> => {
    assertTrustedSender(event)
    return await discoverLocalDevServers()
  })
  ipcMain.handle(ipcChannels.usageGet, (event): KimiUsageState => {
    assertTrustedSender(event)
    return usage.state
  })
  ipcMain.handle(ipcChannels.usageRefresh, async (event): Promise<KimiUsageState> => {
    assertTrustedSender(event)
    return await usage.refresh()
  })
  ipcMain.handle(
    ipcChannels.usagePreferencesUpdate,
    async (event, preferences?: unknown): Promise<KimiUsageState> => {
      assertTrustedSender(event)
      return await usage.updatePreferences(preferences)
    }
  )
  ipcMain.handle(ipcChannels.petSessionViewed, (event, sessionId?: unknown): void => {
    assertTrustedSender(event)
    assertSessionId(sessionId)
    pets.markViewed(sessionId)
  })

  runtime.on('state-changed', (state: RuntimePublicState) => {
    const window = getMainWindow()
    if (window !== null && !window.isDestroyed()) {
      window.webContents.send(ipcChannels.runtimeStateChanged, state)
    }
  })
  const mainTurnBySession = new Map<string, boolean>()
  sessions.on('state-changed', (state: SessionViewState) => {
    const wasActive = mainTurnBySession.get(state.sessionId) === true
    mainTurnBySession.set(state.sessionId, state.mainTurnActive)
    if (wasActive && !state.mainTurnActive) {
      void usage.refresh()
      usage.notifyTurnCompleted({
        sessionId: state.sessionId,
        title: state.title || '未命名任务',
        failed: state.error !== null
      })
    }
    const window = getMainWindow()
    if (window !== null && !window.isDestroyed()) {
      window.webContents.send(ipcChannels.sessionStateChanged, state)
    }
  })
  sessions.on('global-state-changed', (state: KimiGlobalStateEvent) => {
    const window = getMainWindow()
    if (window !== null && !window.isDestroyed()) {
      window.webContents.send(ipcChannels.globalStateChanged, state)
    }
  })
  sessions.on('terminal-output', (output: TerminalOutputEvent) => {
    const window = getMainWindow()
    if (window !== null && !window.isDestroyed()) {
      window.webContents.send(ipcChannels.terminalOutput, output)
    }
  })
  sessions.on('terminal-exit', (exit: TerminalExitEvent) => {
    const window = getMainWindow()
    if (window !== null && !window.isDestroyed()) {
      window.webContents.send(ipcChannels.terminalExit, exit)
    }
  })
  browser.on('state-changed', (state: BrowserViewState) => {
    const window = getMainWindow()
    if (window !== null && !window.isDestroyed()) {
      window.webContents.send(ipcChannels.browserStateChanged, state)
    }
  })
  usage.on('state-changed', (state: KimiUsageState) => {
    const window = getMainWindow()
    if (window !== null && !window.isDestroyed()) {
      window.webContents.send(ipcChannels.usageStateChanged, state)
    }
  })
}

function assertSessionId(sessionId: unknown): asserts sessionId is string {
  if (typeof sessionId !== 'string' || sessionId.length < 1 || sessionId.length > 256 || sessionId.includes('\0')) {
    throw new TypeError('Invalid Kimi session id')
  }
}

function assertShortId(value: unknown, kind: string): asserts value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256 || value.includes('\0')) {
    throw new TypeError(`Invalid Kimi ${kind} id`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function projectSessionNavigation(session: SessionSummary): WorkspaceNavigationItem['sessions'][number] {
  return {
    id: session.id,
    title: session.title,
    updatedAt: typeof session.updated_at === 'string' ? session.updated_at : null,
    busy: session.busy,
    pendingInteraction: session.pending_interaction ?? 'none',
    lastTurnReason: session.last_turn_reason ?? null,
    lastPrompt: session.last_prompt ?? null,
    parentSessionId: typeof session.metadata.parent_session_id === 'string'
      ? session.metadata.parent_session_id
      : null
  }
}

async function loadWorkspaceNavigationSnapshot(
  runtime: KimiRuntimeManager,
  beforeId?: string
): Promise<WorkspaceNavigationSnapshot> {
  const client = runtime.createRestClient()
  const [workspaces, page] = await Promise.all([
    client.listWorkspaces(),
    client.listSessionPage({
      includeArchive: false,
      pageSize: 50,
      ...(beforeId === undefined ? {} : { beforeId })
    })
  ])
  const sessionsByWorkspace = new Map<string, WorkspaceNavigationItem['sessions']>()
  for (const session of page.items) {
    const items = sessionsByWorkspace.get(session.workspace_id) ?? []
    items.push(projectSessionNavigation(session))
    sessionsByWorkspace.set(session.workspace_id, items)
  }
  return {
    workspaces: workspaces.map((workspace) => ({
      id: workspace.id,
      name: workspace.name.trim() || basename(workspace.root) || workspace.root || '未命名项目',
      root: workspace.root,
      sessions: sessionsByWorkspace.get(workspace.id) ?? []
    })),
    hasMoreSessions: page.hasMore,
    nextBeforeId: page.items.at(-1)?.id ?? null
  }
}
