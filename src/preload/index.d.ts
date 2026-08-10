import type {
  AgentMode,
  AppPaths,
  ChatRequest,
  LongMemoryEntry,
  ModelSettings,
  SessionDetail,
  SessionSummary,
  SkillSummary
} from '../shared/ipc'

export interface MyAgentApi {
  ping: () => Promise<'pong'>
  getPaths: () => Promise<AppPaths>
  getSettings: () => Promise<ModelSettings>
  setSettings: (next: ModelSettings) => Promise<ModelSettings>
  chat: (req: ChatRequest) => Promise<{ ok: boolean; started: boolean }>
  cancel: (sessionId: string) => Promise<{ ok: boolean }>
  pause: (sessionId: string) => Promise<{ ok: boolean }>
  resume: (sessionId: string) => Promise<{ ok: boolean; started: boolean }>
  listSessions: () => Promise<SessionSummary[]>
  getSession: (id: string) => Promise<SessionDetail | null>
  createSession: (input?: { mode?: AgentMode; title?: string }) => Promise<SessionSummary>
  deleteSession: (id: string) => Promise<{ ok: boolean }>
  listMemory: () => Promise<LongMemoryEntry[]>
  upsertMemory: (input: {
    id?: string
    title: string
    content: string
    tags?: string[]
    source?: 'user' | 'agent'
  }) => Promise<LongMemoryEntry>
  deleteMemory: (id: string) => Promise<{ ok: boolean }>
  listSkills: () => Promise<SkillSummary[]>
  readSkill: (id: string) => Promise<{ id: string; markdown: string; path: string }>
  writeSkill: (input: {
    id?: string
    markdown: string
    scripts?: Record<string, string>
  }) => Promise<SkillSummary>
  deleteSkill: (id: string) => Promise<{ ok: boolean }>
  confirmTool: (requestId: string, approved: boolean) => Promise<{ ok: boolean }>
  onEvent: (handler: (payload: unknown) => void) => () => void
}

declare global {
  interface Window {
    myAgent: MyAgentApi
  }
}

export {}
