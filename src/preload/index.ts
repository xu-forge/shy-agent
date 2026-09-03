import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type AgentMode,
  type AppPaths,
  type ChatRequest,
  type LongMemoryEntry,
  type ModelSettings,
  type OpenCodeGoModelsResult,
  type McpConfigFile,
  type McpServerStatus,
  type McpSetResult,
  type SessionDetail,
  type SessionMessagesPage,
  type SessionMessagesPageInput,
  type SessionFileRecord,
  type SessionDiffRecord,
  type SessionSummary,
  type SessionTaskRecord,
  type SkillSummary,
  type AgentLogFileSummary,
  type BindSessionProjectResult,
  type CreateScheduleTaskInput,
  type Project,
  type ProjectCreateResult,
  type ProjectFileReadResult,
  type ProjectFileWriteResult,
  type ProjectMaterialsImportResult,
  type ProjectMaterialsListResult,
  type MaterialCanvasState,
  type MaterialCanvasStateGetResult,
  type MaterialCanvasStateSetResult,
  type MaterialThumbGetInput,
  type MaterialThumbGetResult,
  type MaterialThumbPutInput,
  type MaterialThumbPutResult,
  type ProjectFileDeleteResult,
  type ProjectFileOpenResult,
  type ProjectFileRenameInput,
  type ProjectFileRenameResult,
  type ProjectFileReadDataUrlResult,
  type ProjectPickFileResult,
  type ProjectPickFolderResult,
  type ProjectRevealResult,
  type ProjectTreeListResult,
  type ProjectType,
  type ScheduleOccurrence,
  type ScheduleReminderEvent,
  type ScheduleRunFinishedEvent,
  type ScheduleRun,
  type ScheduleRunsGetInput,
  type ScheduleRunsListInput,
  type ScheduleTask,
  type ScheduleTaskSaveResult,
  type ScheduleTasksExpandInput,
  type ScheduleTasksListResult,
  type UpdateScheduleTaskInput,
  type DockOpenRootResult,
  type DockTreeListResult,
  type DockFileReadResult,
  type DockFileReadDataUrlResult,
  type DockFilePathResult
} from '../shared/ipc'

const shy = {
  ping: (): Promise<'pong'> => ipcRenderer.invoke(IPC.ping),
  getPaths: (): Promise<AppPaths> => ipcRenderer.invoke(IPC.getPaths),
  getSettings: (): Promise<ModelSettings> => ipcRenderer.invoke(IPC.settingsGet),
  setSettings: (next: ModelSettings): Promise<ModelSettings> =>
    ipcRenderer.invoke(IPC.settingsSet, next),
  listOpenCodeGoModels: (): Promise<OpenCodeGoModelsResult> =>
    ipcRenderer.invoke(IPC.opencodeGoModelsList),
  getMcpConfig: (): Promise<McpConfigFile> => ipcRenderer.invoke(IPC.mcpGet),
  setMcpConfig: (next: McpConfigFile): Promise<McpSetResult> =>
    ipcRenderer.invoke(IPC.mcpSet, next),
  getMcpStatus: (): Promise<McpServerStatus[]> => ipcRenderer.invoke(IPC.mcpStatus),
  authorizeMcp: (id: string): Promise<McpSetResult> => ipcRenderer.invoke(IPC.mcpAuthorize, id),
  chat: (req: ChatRequest): Promise<{ ok: boolean; started: boolean }> =>
    ipcRenderer.invoke(IPC.agentChat, req),
  cancel: (sessionId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC.agentCancel, sessionId),
  pause: (sessionId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC.agentPause, sessionId),
  resume: (sessionId: string): Promise<{ ok: boolean; started: boolean }> =>
    ipcRenderer.invoke(IPC.agentResume, sessionId),
  listSessions: (): Promise<SessionSummary[]> => ipcRenderer.invoke(IPC.sessionsList),
  getSession: (id: string): Promise<SessionDetail | null> =>
    ipcRenderer.invoke(IPC.sessionsGet, id),
  getSessionSummary: (id: string): Promise<SessionSummary | null> =>
    ipcRenderer.invoke(IPC.sessionsGetSummary, id),
  getSessionMessagesPage: (input: SessionMessagesPageInput): Promise<SessionMessagesPage> =>
    ipcRenderer.invoke(IPC.sessionMessagesPage, input),
  createSession: (input?: { mode?: AgentMode; title?: string }): Promise<SessionSummary> =>
    ipcRenderer.invoke(IPC.sessionsCreate, input),
  deleteSession: (id: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC.sessionsDelete, id),
  setSessionModel: (sessionId: string, model: string | null): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC.sessionsSetModel, sessionId, model),
  listMemory: (): Promise<LongMemoryEntry[]> => ipcRenderer.invoke(IPC.memoryList),
  upsertMemory: (input: {
    id?: string
    title: string
    content: string
    tags?: string[]
    source?: 'user' | 'agent'
  }): Promise<LongMemoryEntry> => ipcRenderer.invoke(IPC.memoryUpsert, input),
  deleteMemory: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.memoryDelete, id),
  listSkills: (): Promise<SkillSummary[]> => ipcRenderer.invoke(IPC.skillsList),
  readSkill: (id: string): Promise<{ id: string; markdown: string; path: string }> =>
    ipcRenderer.invoke(IPC.skillsRead, id),
  writeSkill: (input: {
    id?: string
    markdown: string
    scripts?: Record<string, string>
  }): Promise<SkillSummary> => ipcRenderer.invoke(IPC.skillsWrite, input),
  deleteSkill: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.skillsDelete, id),
  setSkillEnabled: (name: string, enabled: boolean): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC.skillsSetEnabled, { name, enabled }),
  // minimax-feature-port：内嵌浏览器控制
  browserShow: (bounds: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke(IPC.browserShow, bounds),
  browserHide: () => ipcRenderer.invoke(IPC.browserHide),
  browserSetBounds: (bounds: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke(IPC.browserSetBounds, bounds),
  browserGetState: () => ipcRenderer.invoke(IPC.browserGetState),
  browserNavigate: (url: string) => ipcRenderer.invoke(IPC.browserNavigate, url),
  browserScreenshot: () => ipcRenderer.invoke(IPC.browserScreenshot),
  browserBack: () => ipcRenderer.invoke(IPC.browserBack),
  browserForward: () => ipcRenderer.invoke(IPC.browserForward),
  browserReload: () => ipcRenderer.invoke(IPC.browserReload),
  // shell-session-side-panel
  listSessionFiles: (sessionId: string): Promise<SessionFileRecord[]> =>
    ipcRenderer.invoke(IPC.sessionFilesList, sessionId),
  listSessionDiffs: (sessionId: string): Promise<SessionDiffRecord[]> =>
    ipcRenderer.invoke(IPC.sessionDiffsList, sessionId),
  revealSessionFile: (sessionId: string, filePath: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC.sessionFilesReveal, sessionId, filePath),
  listSessionTasks: (sessionId: string): Promise<SessionTaskRecord[]> =>
    ipcRenderer.invoke(IPC.sessionTasksList, sessionId),
  updateSessionTask: (input: {
    sessionId: string
    id: string
    done: boolean
    evidence?: string
  }): Promise<{ ok: boolean; task?: SessionTaskRecord; error?: string }> =>
    ipcRenderer.invoke(IPC.sessionTasksUpdate, input),
  deleteSessionTask: (input: { sessionId: string; id: string }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC.sessionTasksDelete, input),
  confirmTool: (requestId: string, approved: boolean): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC.toolConfirm, requestId, approved),
  askUserReply: (requestId: string, answer: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC.askUserReply, requestId, answer),
  scheduleTasksList: (): Promise<ScheduleTasksListResult> =>
    ipcRenderer.invoke(IPC.scheduleTasksList),
  scheduleTasksGet: (id: string): Promise<ScheduleTask | null> =>
    ipcRenderer.invoke(IPC.scheduleTasksGet, id),
  scheduleTasksCreate: (input: CreateScheduleTaskInput): Promise<ScheduleTaskSaveResult> =>
    ipcRenderer.invoke(IPC.scheduleTasksCreate, input),
  scheduleTasksUpdate: (input: {
    id: string
    patch: UpdateScheduleTaskInput
  }): Promise<ScheduleTaskSaveResult> => ipcRenderer.invoke(IPC.scheduleTasksUpdate, input),
  scheduleTasksDelete: (id: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC.scheduleTasksDelete, id),
  scheduleTasksExpand: (input: ScheduleTasksExpandInput): Promise<ScheduleOccurrence[]> =>
    ipcRenderer.invoke(IPC.scheduleTasksExpand, input),
  scheduleRunsGet: (input: ScheduleRunsGetInput): Promise<ScheduleRun | null> =>
    ipcRenderer.invoke(IPC.scheduleRunsGet, input),
  scheduleRunsList: (input: ScheduleRunsListInput): Promise<ScheduleRun[]> =>
    ipcRenderer.invoke(IPC.scheduleRunsList, input),
  listAgentLogs: (): Promise<AgentLogFileSummary[]> => ipcRenderer.invoke(IPC.logsAgentList),
  readAgentLog: (input: {
    name: string
    offset?: number
    limit?: number
  }): Promise<{ name: string; content: string; truncated: boolean }> =>
    ipcRenderer.invoke(IPC.logsAgentRead, input),
  revealAgentLogsDir: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.logsAgentReveal),
  listProjects: (): Promise<Project[]> => ipcRenderer.invoke(IPC.projectsList),
  createProject: (input: {
    type: ProjectType
    rootPath: string
    name?: string
  }): Promise<ProjectCreateResult> => ipcRenderer.invoke(IPC.projectsCreate, input),
  deleteProject: (id: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC.projectsDelete, id),
  bindSessionProject: (input: {
    sessionId: string
    projectId: string
  }): Promise<BindSessionProjectResult> => ipcRenderer.invoke(IPC.sessionsBindProject, input),
  pickFolder: (): Promise<ProjectPickFolderResult> => ipcRenderer.invoke(IPC.projectPickFolder),
  pickFile: (): Promise<ProjectPickFileResult> => ipcRenderer.invoke(IPC.projectPickFile),
  projectReveal: (input: { projectId: string; absPath: string }): Promise<ProjectRevealResult> =>
    ipcRenderer.invoke(IPC.projectReveal, input),
  projectFileReadDataUrl: (input: {
    projectId: string
    relativePath: string
  }): Promise<ProjectFileReadDataUrlResult> =>
    ipcRenderer.invoke(IPC.projectFileReadDataUrl, input),
  projectTreeList: (projectId: string): Promise<ProjectTreeListResult> =>
    ipcRenderer.invoke(IPC.projectTreeList, projectId),
  projectFileRead: (input: {
    projectId: string
    relativePath: string
  }): Promise<ProjectFileReadResult> => ipcRenderer.invoke(IPC.projectFileRead, input),
  projectFileWrite: (input: {
    projectId: string
    relativePath: string
    content: string
  }): Promise<ProjectFileWriteResult> => ipcRenderer.invoke(IPC.projectFileWrite, input),
  projectMaterialsList: (projectId: string): Promise<ProjectMaterialsListResult> =>
    ipcRenderer.invoke(IPC.projectMaterialsList, projectId),
  projectMaterialsImport: (input: {
    projectId: string
    sourceAbsPath: string
  }): Promise<ProjectMaterialsImportResult> =>
    ipcRenderer.invoke(IPC.projectMaterialsImport, input),
  materialThumbGet: (input: MaterialThumbGetInput): Promise<MaterialThumbGetResult> =>
    ipcRenderer.invoke(IPC.materialThumbGet, input),
  materialThumbPut: (input: MaterialThumbPutInput): Promise<MaterialThumbPutResult> =>
    ipcRenderer.invoke(IPC.materialThumbPut, input),
  materialCanvasStateGet: (projectId: string): Promise<MaterialCanvasStateGetResult> =>
    ipcRenderer.invoke(IPC.materialCanvasStateGet, projectId),
  materialCanvasStateSet: (input: {
    projectId: string
    state: MaterialCanvasState
  }): Promise<MaterialCanvasStateSetResult> =>
    ipcRenderer.invoke(IPC.materialCanvasStateSet, input),
  projectFileOpen: (input: {
    projectId: string
    absPath: string
  }): Promise<ProjectFileOpenResult> => ipcRenderer.invoke(IPC.projectFileOpen, input),
  projectFileRename: (input: ProjectFileRenameInput): Promise<ProjectFileRenameResult> =>
    ipcRenderer.invoke(IPC.projectFileRename, input),
  projectFileDelete: (input: {
    projectId: string
    absPath: string
  }): Promise<ProjectFileDeleteResult> => ipcRenderer.invoke(IPC.projectFileDelete, input),
  dockOpenRoot: (sessionId: string): Promise<DockOpenRootResult> =>
    ipcRenderer.invoke(IPC.dockOpenRoot, sessionId),
  dockTreeList: (sessionId: string): Promise<DockTreeListResult> =>
    ipcRenderer.invoke(IPC.dockTreeList, sessionId),
  dockFileRead: (input: { sessionId: string; relativePath: string }): Promise<DockFileReadResult> =>
    ipcRenderer.invoke(IPC.dockFileRead, input),
  dockFileReadDataUrl: (input: {
    sessionId: string
    relativePath: string
  }): Promise<DockFileReadDataUrlResult> => ipcRenderer.invoke(IPC.dockFileReadDataUrl, input),
  dockFileReveal: (input: {
    sessionId: string
    relativePath: string
  }): Promise<DockFilePathResult> => ipcRenderer.invoke(IPC.dockFileReveal, input),
  dockFileOpen: (input: { sessionId: string; relativePath: string }): Promise<DockFilePathResult> =>
    ipcRenderer.invoke(IPC.dockFileOpen, input),
  onEvent: (handler: (payload: unknown) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown): void => {
      handler(payload)
    }
    ipcRenderer.on(IPC.events, listener)
    return () => ipcRenderer.removeListener(IPC.events, listener)
  },
  /**
   * 按 type 订阅事件(Stage 3.2 — renderer 端按 type 过滤,不用全收再过滤)
   * 用法:
   *   const off = window.shy.onEventByType('assistant_delta', (e) => appendToChat(e.content))
   *   off()
   */
  onEventByType: <T extends { type: string }>(
    type: T['type'],
    handler: (event: T) => void
  ): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown): void => {
      if (payload && typeof payload === 'object' && (payload as { type?: string }).type === type) {
        handler(payload as T)
      }
    }
    ipcRenderer.on(IPC.events, listener)
    return () => ipcRenderer.removeListener(IPC.events, listener)
  },
  onScheduleRemind: (handler: (event: ScheduleReminderEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: ScheduleReminderEvent): void => {
      handler(payload)
    }
    ipcRenderer.on(IPC.scheduleRemind, listener)
    return () => ipcRenderer.removeListener(IPC.scheduleRemind, listener)
  },
  onScheduleRunFinished: (handler: (event: ScheduleRunFinishedEvent) => void): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: ScheduleRunFinishedEvent
    ): void => {
      handler(payload)
    }
    ipcRenderer.on(IPC.scheduleRunFinished, listener)
    return () => ipcRenderer.removeListener(IPC.scheduleRunFinished, listener)
  }
}

contextBridge.exposeInMainWorld('shy', shy)
