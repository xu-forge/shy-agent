import type {
  AgentLogFileSummary,
  AgentMode,
  AppPaths,
  ChatRequest,
  CreateScheduleTaskInput,
  LongMemoryEntry,
  ModelSettings,
  ScheduleOccurrence,
  ScheduleReminderEvent,
  ScheduleTask,
  ScheduleTaskSaveResult,
  ScheduleTasksExpandInput,
  ScheduleTasksListResult,
  SessionDetail,
  SessionFileRecord,
  SessionSummary,
  SessionTaskRecord,
  SkillSummary,
  UpdateScheduleTaskInput
} from '../shared/ipc'

export interface ShyApi {
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
  listSessionFiles: (sessionId: string) => Promise<SessionFileRecord[]>
  revealSessionFile: (sessionId: string, filePath: string) => Promise<{ ok: boolean }>
  listSessionTasks: (sessionId: string) => Promise<SessionTaskRecord[]>
  updateSessionTask: (input: {
    sessionId: string
    id: string
    done: boolean
    evidence?: string
  }) => Promise<{ ok: boolean; task?: SessionTaskRecord; error?: string }>
  deleteSessionTask: (input: { sessionId: string; id: string }) => Promise<{ ok: boolean }>
  confirmTool: (requestId: string, approved: boolean) => Promise<{ ok: boolean }>
  scheduleTasksList: () => Promise<ScheduleTasksListResult>
  scheduleTasksGet: (id: string) => Promise<ScheduleTask | null>
  scheduleTasksCreate: (input: CreateScheduleTaskInput) => Promise<ScheduleTaskSaveResult>
  scheduleTasksUpdate: (input: {
    id: string
    patch: UpdateScheduleTaskInput
  }) => Promise<ScheduleTaskSaveResult>
  scheduleTasksDelete: (id: string) => Promise<{ ok: boolean }>
  scheduleTasksExpand: (input: ScheduleTasksExpandInput) => Promise<ScheduleOccurrence[]>
  listAgentLogs: () => Promise<AgentLogFileSummary[]>
  readAgentLog: (input: {
    name: string
    offset?: number
    limit?: number
  }) => Promise<{ name: string; content: string; truncated: boolean }>
  revealAgentLogsDir: () => Promise<{ ok: boolean }>
  onEvent: (handler: (payload: unknown) => void) => () => void
  onEventByType: <T extends { type: string }>(type: T['type'], handler: (event: T) => void) => () => void
  onScheduleRemind: (handler: (event: ScheduleReminderEvent) => void) => () => void
}

declare global {
  interface Window {
    shy: ShyApi
  }
}

export {}
