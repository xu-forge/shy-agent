import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type AppPaths,
  type ChatRequest,
  type LongMemoryEntry,
  type ModelSettings,
  type SkillSummary
} from '../shared/ipc'

const myAgent = {
  ping: (): Promise<'pong'> => ipcRenderer.invoke(IPC.ping),
  getPaths: (): Promise<AppPaths> => ipcRenderer.invoke(IPC.getPaths),
  getSettings: (): Promise<ModelSettings> => ipcRenderer.invoke(IPC.settingsGet),
  setSettings: (next: ModelSettings): Promise<ModelSettings> =>
    ipcRenderer.invoke(IPC.settingsSet, next),
  chat: (req: ChatRequest): Promise<{ ok: boolean; started: boolean }> =>
    ipcRenderer.invoke(IPC.agentChat, req),
  cancel: (sessionId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC.agentCancel, sessionId),
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
  confirmTool: (requestId: string, approved: boolean): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC.toolConfirm, requestId, approved),
  onEvent: (handler: (payload: unknown) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown): void => {
      handler(payload)
    }
    ipcRenderer.on(IPC.events, listener)
    return () => ipcRenderer.removeListener(IPC.events, listener)
  }
}

contextBridge.exposeInMainWorld('myAgent', myAgent)
