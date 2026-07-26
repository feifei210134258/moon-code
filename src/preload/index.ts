import { contextBridge, ipcRenderer } from 'electron'
import {
  ipcChannels,
  type BrowserViewState,
  type KimiAgentDesktopApi,
  type KimiGlobalStateEvent,
  type KimiUsageState,
  type PetOpenSessionIntent,
  type RuntimePublicState,
  type SessionViewState,
  type TerminalExitEvent,
  type TerminalOutputEvent
} from '../shared/contracts.js'

const api: KimiAgentDesktopApi = {
  getBootstrapState: () => ipcRenderer.invoke(ipcChannels.appBootstrap),
  discoverRuntime: () => ipcRenderer.invoke(ipcChannels.runtimeDiscover),
  checkKimiCliUpdate: () => ipcRenderer.invoke(ipcChannels.kimiCliUpdateCheck),
  downloadKimiCliUpdate: () => ipcRenderer.invoke(ipcChannels.kimiCliUpdateDownload),
  startRuntime: (mode) => ipcRenderer.invoke(ipcChannels.runtimeStart, mode),
  connectExternalRuntime: (input) => ipcRenderer.invoke(ipcChannels.runtimeConnectExternal, input),
  stopRuntime: () => ipcRenderer.invoke(ipcChannels.runtimeStop),
  getWorkspaceTree: () => ipcRenderer.invoke(ipcChannels.workspaceTree),
  getWorkspaceTreePage: (beforeId) => ipcRenderer.invoke(ipcChannels.workspaceTreePage, beforeId),
  addWorkspace: () => ipcRenderer.invoke(ipcChannels.workspaceAdd),
  renameWorkspace: (workspaceId, name) => ipcRenderer.invoke(ipcChannels.workspaceRename, workspaceId, name),
  deleteWorkspace: (workspaceId) => ipcRenderer.invoke(ipcChannels.workspaceDelete, workspaceId),
  createSession: (workspaceId) => ipcRenderer.invoke(ipcChannels.sessionCreate, workspaceId),
  renameSession: (sessionId, title) => ipcRenderer.invoke(ipcChannels.sessionRename, sessionId, title),
  archiveSession: (sessionId) => ipcRenderer.invoke(ipcChannels.sessionArchive, sessionId),
  restoreSession: (sessionId) => ipcRenderer.invoke(ipcChannels.sessionRestore, sessionId),
  forkSession: (sessionId) => ipcRenderer.invoke(ipcChannels.sessionFork, sessionId),
  exportSession: (sessionId) => ipcRenderer.invoke(ipcChannels.sessionExport, sessionId),
  listArchivedSessions: () => ipcRenderer.invoke(ipcChannels.sessionsArchivedList),
  listChildSessions: (sessionId) => ipcRenderer.invoke(ipcChannels.sessionChildrenList, sessionId),
  getSessionWarnings: (sessionId) => ipcRenderer.invoke(ipcChannels.sessionWarningsList, sessionId),
  openSession: (sessionId) => ipcRenderer.invoke(ipcChannels.sessionOpen, sessionId),
  getSessionRuntimeStatus: (sessionId) => ipcRenderer.invoke(ipcChannels.sessionRuntimeGet, sessionId),
  getSessionOperationalState: (sessionId) => ipcRenderer.invoke(ipcChannels.sessionOperationalGet, sessionId),
  compactSession: (sessionId, instruction) =>
    ipcRenderer.invoke(ipcChannels.sessionCompact, sessionId, instruction),
  undoSession: (sessionId, count) => ipcRenderer.invoke(ipcChannels.sessionUndo, sessionId, count),
  startSideChat: (sessionId) => ipcRenderer.invoke(ipcChannels.sideChatStart, sessionId),
  submitSideChatPrompt: (sessionId, agentId, input) =>
    ipcRenderer.invoke(ipcChannels.sideChatPrompt, sessionId, agentId, input),
  closeSideChat: (sessionId, agentId) => ipcRenderer.invoke(ipcChannels.sideChatClose, sessionId, agentId),
  getAgentTranscript: (sessionId, agentId) => ipcRenderer.invoke(ipcChannels.agentTranscriptGet, sessionId, agentId),
  controlSessionGoal: (sessionId, control) =>
    ipcRenderer.invoke(ipcChannels.sessionGoalControl, sessionId, control),
  cancelBackgroundTask: (sessionId, taskId) => ipcRenderer.invoke(ipcChannels.taskCancel, sessionId, taskId),
  submitPrompt: (sessionId, input) => ipcRenderer.invoke(ipcChannels.promptSubmit, sessionId, input),
  steerPrompts: (sessionId, promptIds) => ipcRenderer.invoke(ipcChannels.promptSteer, sessionId, promptIds),
  abortPrompt: (sessionId, promptId) => ipcRenderer.invoke(ipcChannels.promptAbort, sessionId, promptId),
  abortSession: (sessionId) => ipcRenderer.invoke(ipcChannels.sessionAbort, sessionId),
  respondApproval: (sessionId, approvalId, response) =>
    ipcRenderer.invoke(ipcChannels.approvalRespond, sessionId, approvalId, response),
  respondQuestion: (sessionId, questionId, answers) =>
    ipcRenderer.invoke(ipcChannels.questionRespond, sessionId, questionId, answers),
  dismissQuestion: (sessionId, questionId) =>
    ipcRenderer.invoke(ipcChannels.questionDismiss, sessionId, questionId),
  pickAttachments: () => ipcRenderer.invoke(ipcChannels.attachmentsPick),
  pasteAttachment: (input) => ipcRenderer.invoke(ipcChannels.attachmentsPaste, input),
  readAttachment: (fileId, mediaType) => ipcRenderer.invoke(ipcChannels.attachmentRead, fileId, mediaType),
  discardAttachment: (fileId) => ipcRenderer.invoke(ipcChannels.attachmentDiscard, fileId),
  listFiles: (sessionId, path) => ipcRenderer.invoke(ipcChannels.filesList, sessionId, path),
  readFile: (sessionId, path) => ipcRenderer.invoke(ipcChannels.filesRead, sessionId, path),
  searchFiles: (sessionId, query) => ipcRenderer.invoke(ipcChannels.filesSearch, sessionId, query),
  grepFiles: (sessionId, pattern) => ipcRenderer.invoke(ipcChannels.filesGrep, sessionId, pattern),
  downloadWorkspaceFile: (sessionId, path) => ipcRenderer.invoke(ipcChannels.filesDownload, sessionId, path),
  openWorkspaceFile: (sessionId, path, line) => ipcRenderer.invoke(ipcChannels.filesOpen, sessionId, path, line),
  openWorkspaceFileIn: (sessionId, appId, path, line) =>
    ipcRenderer.invoke(ipcChannels.filesOpenIn, sessionId, appId, path, line),
  revealWorkspaceFile: (sessionId, path) => ipcRenderer.invoke(ipcChannels.filesReveal, sessionId, path),
  readMarkdownImage: (sessionId, source) =>
    ipcRenderer.invoke(ipcChannels.markdownImageRead, sessionId, source),
  getGitStatus: (sessionId) => ipcRenderer.invoke(ipcChannels.gitStatus, sessionId),
  getFileDiff: (sessionId, path) => ipcRenderer.invoke(ipcChannels.fileDiff, sessionId, path),
  listTerminals: (sessionId) => ipcRenderer.invoke(ipcChannels.terminalsList, sessionId),
  createTerminal: (sessionId, size) => ipcRenderer.invoke(ipcChannels.terminalCreate, sessionId, size),
  attachTerminal: (sessionId, terminalId, sinceSeq) =>
    ipcRenderer.invoke(ipcChannels.terminalAttach, sessionId, terminalId, sinceSeq),
  detachTerminal: (sessionId, terminalId) =>
    ipcRenderer.invoke(ipcChannels.terminalDetach, sessionId, terminalId),
  sendTerminalInput: (sessionId, terminalId, data) =>
    ipcRenderer.invoke(ipcChannels.terminalInput, sessionId, terminalId, data),
  resizeTerminal: (sessionId, terminalId, cols, rows) =>
    ipcRenderer.invoke(ipcChannels.terminalResize, sessionId, terminalId, cols, rows),
  closeTerminal: (sessionId, terminalId) =>
    ipcRenderer.invoke(ipcChannels.terminalClose, sessionId, terminalId),
  getKimiSettings: () => ipcRenderer.invoke(ipcChannels.settingsGet),
  setDefaultModel: (modelId) => ipcRenderer.invoke(ipcChannels.settingsDefaultModelSet, modelId),
  updateKimiPreferences: (patch) => ipcRenderer.invoke(ipcChannels.settingsPreferencesUpdate, patch),
  addKimiProvider: (input) => ipcRenderer.invoke(ipcChannels.providerAdd, input),
  refreshKimiProviders: (input) => ipcRenderer.invoke(ipcChannels.providersRefresh, input),
  startOAuthLogin: (provider) => ipcRenderer.invoke(ipcChannels.oauthLoginStart, provider),
  pollOAuthLogin: (provider) => ipcRenderer.invoke(ipcChannels.oauthLoginPoll, provider),
  cancelOAuthLogin: (provider) => ipcRenderer.invoke(ipcChannels.oauthLoginCancel, provider),
  logoutOAuth: (provider) => ipcRenderer.invoke(ipcChannels.oauthLogout, provider),
  listSessionSkills: (sessionId) => ipcRenderer.invoke(ipcChannels.skillsSessionList, sessionId),
  listWorkspaceSkills: (workspaceId) => ipcRenderer.invoke(ipcChannels.skillsWorkspaceList, workspaceId),
  activateSkill: (sessionId, skillName, args) =>
    ipcRenderer.invoke(ipcChannels.skillActivate, sessionId, skillName, args),
  listKimiTools: (sessionId) => ipcRenderer.invoke(ipcChannels.toolsList, sessionId),
  listMcpServers: () => ipcRenderer.invoke(ipcChannels.mcpServersList),
  restartMcpServer: (serverId) => ipcRenderer.invoke(ipcChannels.mcpServerRestart, serverId),
  openHtmlPreview: (sessionId, path) => ipcRenderer.invoke(ipcChannels.browserOpenHtml, sessionId, path),
  navigateBrowser: (url) => ipcRenderer.invoke(ipcChannels.browserNavigate, url),
  browserBack: () => ipcRenderer.invoke(ipcChannels.browserBack),
  browserForward: () => ipcRenderer.invoke(ipcChannels.browserForward),
  browserReload: () => ipcRenderer.invoke(ipcChannels.browserReload),
  browserStop: () => ipcRenderer.invoke(ipcChannels.browserStop),
  setBrowserBounds: (bounds) => ipcRenderer.invoke(ipcChannels.browserSetBounds, bounds),
  setBrowserVisible: (visible) => ipcRenderer.invoke(ipcChannels.browserSetVisible, visible),
  setBrowserOverlay: (open) => ipcRenderer.invoke(ipcChannels.browserSetOverlay, open),
  setBrowserWorkspace: (scope) => ipcRenderer.invoke(ipcChannels.browserSetWorkspace, scope),
  setBrowserViewport: (viewport) => ipcRenderer.invoke(ipcChannels.browserSetViewport, viewport),
  clearBrowserConsole: () => ipcRenderer.invoke(ipcChannels.browserClearConsole),
  clearBrowserNetwork: () => ipcRenderer.invoke(ipcChannels.browserClearNetwork),
  getBrowserNetworkDetails: (requestId) => ipcRenderer.invoke(ipcChannels.browserNetworkDetails, requestId),
  captureBrowser: (fullPage) => ipcRenderer.invoke(ipcChannels.browserCapture, fullPage),
  pickBrowserAnnotation: (mode) => ipcRenderer.invoke(ipcChannels.browserAnnotationPick, mode),
  deleteBrowserAnnotation: (draftId) => ipcRenderer.invoke(ipcChannels.browserAnnotationDelete, draftId),
  submitBrowserAnnotation: (sessionId, input, controls) =>
    ipcRenderer.invoke(ipcChannels.browserAnnotationSubmit, sessionId, input, controls),
  openBrowserExternal: () => ipcRenderer.invoke(ipcChannels.browserOpenExternal),
  discoverBrowserLocalServers: () => ipcRenderer.invoke(ipcChannels.browserDiscoverLocal),
  getKimiUsage: () => ipcRenderer.invoke(ipcChannels.usageGet),
  refreshKimiUsage: () => ipcRenderer.invoke(ipcChannels.usageRefresh),
  updateKimiUsagePreferences: (preferences) =>
    ipcRenderer.invoke(ipcChannels.usagePreferencesUpdate, preferences),
  markPetSessionViewed: (sessionId) => ipcRenderer.invoke(ipcChannels.petSessionViewed, sessionId),
  onRuntimeStateChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: RuntimePublicState): void => listener(state)
    ipcRenderer.on(ipcChannels.runtimeStateChanged, handler)
    return () => ipcRenderer.removeListener(ipcChannels.runtimeStateChanged, handler)
  },
  onKimiGlobalStateChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: KimiGlobalStateEvent): void => listener(state)
    ipcRenderer.on(ipcChannels.globalStateChanged, handler)
    return () => ipcRenderer.removeListener(ipcChannels.globalStateChanged, handler)
  },
  onSessionStateChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: SessionViewState): void => listener(state)
    ipcRenderer.on(ipcChannels.sessionStateChanged, handler)
    return () => ipcRenderer.removeListener(ipcChannels.sessionStateChanged, handler)
  },
  onTerminalOutput: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, output: TerminalOutputEvent): void => listener(output)
    ipcRenderer.on(ipcChannels.terminalOutput, handler)
    return () => ipcRenderer.removeListener(ipcChannels.terminalOutput, handler)
  },
  onTerminalExit: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, exit: TerminalExitEvent): void => listener(exit)
    ipcRenderer.on(ipcChannels.terminalExit, handler)
    return () => ipcRenderer.removeListener(ipcChannels.terminalExit, handler)
  },
  onBrowserStateChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: BrowserViewState): void => listener(state)
    ipcRenderer.on(ipcChannels.browserStateChanged, handler)
    return () => ipcRenderer.removeListener(ipcChannels.browserStateChanged, handler)
  },
  onKimiUsageStateChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: KimiUsageState): void => listener(state)
    ipcRenderer.on(ipcChannels.usageStateChanged, handler)
    return () => ipcRenderer.removeListener(ipcChannels.usageStateChanged, handler)
  },
  onPetOpenSession: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, intent: PetOpenSessionIntent): void => listener(intent)
    ipcRenderer.on(ipcChannels.petOpenSession, handler)
    return () => ipcRenderer.removeListener(ipcChannels.petOpenSession, handler)
  }
}

contextBridge.exposeInMainWorld('kimiAgent', api)
