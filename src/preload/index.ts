import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type AgentMode,
  type AppPaths,
  type ChatRequest,
  type LongMemoryEntry,
  type ModelSettings,
  type SessionDetail,
  type SessionFileRecord,
  type SessionSummary,
  type SessionTaskRecord,
  type SkillSummary,
  type AgentLogFileSummary,
  type Workflow,
  type WorkflowRun
} from '../shared/ipc'

const shy = {
  ping: (): Promise<'pong'> => ipcRenderer.invoke(IPC.ping),
  getPaths: (): Promise<AppPaths> => ipcRenderer.invoke(IPC.getPaths),
  getSettings: (): Promise<ModelSettings> => ipcRenderer.invoke(IPC.settingsGet),
  setSettings: (next: ModelSettings): Promise<ModelSettings> =>
    ipcRenderer.invoke(IPC.settingsSet, next),
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
  createSession: (input?: { mode?: AgentMode; title?: string }): Promise<SessionSummary> =>
    ipcRenderer.invoke(IPC.sessionsCreate, input),
  deleteSession: (id: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC.sessionsDelete, id),
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
  // shell-session-side-panel
  listSessionFiles: (sessionId: string): Promise<SessionFileRecord[]> =>
    ipcRenderer.invoke(IPC.sessionFilesList, sessionId),
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
  listWorkflows: (): Promise<Workflow[]> => ipcRenderer.invoke(IPC.workflowList),
  getWorkflow: (id: string): Promise<Workflow | null> => ipcRenderer.invoke(IPC.workflowGet, id),
  saveWorkflow: (wf: Workflow): Promise<Workflow> => ipcRenderer.invoke(IPC.workflowSave, wf),
  deleteWorkflow: (id: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC.workflowDelete, id),
  runWorkflow: (
    id: string
  ): Promise<{ ok: boolean; run?: WorkflowRun; error?: string }> =>
    ipcRenderer.invoke(IPC.workflowRun, id),
  listWorkflowRuns: (id?: string): Promise<WorkflowRun[]> =>
    ipcRenderer.invoke(IPC.workflowRunsList, id),
  getWorkflowTemplate: (): Promise<Workflow> => ipcRenderer.invoke(IPC.workflowTemplate),
  listAgentLogs: (): Promise<AgentLogFileSummary[]> => ipcRenderer.invoke(IPC.logsAgentList),
  readAgentLog: (input: {
    name: string
    offset?: number
    limit?: number
  }): Promise<{ name: string; content: string; truncated: boolean }> =>
    ipcRenderer.invoke(IPC.logsAgentRead, input),
  revealAgentLogsDir: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.logsAgentReveal),
  onEvent: (handler: (payload: unknown) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown): void => {
      handler(payload)
    }
    ipcRenderer.on(IPC.events, listener)
    return () => ipcRenderer.removeListener(IPC.events, listener)
  }
}

contextBridge.exposeInMainWorld('shy', shy)
