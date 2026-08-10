export const IPC = {
  ping: 'my-agent:ping',
  getPaths: 'my-agent:get-paths',
  agentChat: 'my-agent:agent-chat',
  agentCancel: 'my-agent:agent-cancel',
  agentPause: 'my-agent:agent-pause',
  agentResume: 'my-agent:agent-resume',
  memoryList: 'my-agent:memory-list',
  memoryUpsert: 'my-agent:memory-upsert',
  memoryDelete: 'my-agent:memory-delete',
  skillsList: 'my-agent:skills-list',
  skillsRead: 'my-agent:skills-read',
  skillsWrite: 'my-agent:skills-write',
  skillsDelete: 'my-agent:skills-delete',
  settingsGet: 'my-agent:settings-get',
  settingsSet: 'my-agent:settings-set',
  toolConfirm: 'my-agent:tool-confirm',
  sessionsList: 'my-agent:sessions-list',
  sessionsGet: 'my-agent:sessions-get',
  sessionsCreate: 'my-agent:sessions-create',
  sessionsDelete: 'my-agent:sessions-delete',
  events: 'my-agent:events'
} as const

export type AppPaths = {
  userData: string
  platform: NodeJS.Platform
}

export type AgentMode = 'interactive' | 'goal'

export type ChatRequest = {
  sessionId: string
  message: string
  mode: AgentMode
}

export type GoalChecklistItem = {
  id: string
  title: string
  done: boolean
  evidence?: string
}

export type LongMemoryEntry = {
  id: string
  title: string
  content: string
  tags: string[]
  source: 'user' | 'agent'
  revision: number
  updatedAt: string
  createdAt: string
}

export type SkillSummary = {
  id: string
  name: string
  description: string
  path: string
}

export type ModelSettings = {
  baseURL: string
  apiKey: string
  model: string
  /** 目标模式：清单连续无进展多少轮后软暂停（默认 20；有进展会重置） */
  stagnationRounds?: number
  /** LangGraph 递归保险丝（默认目标模式 500 / 交互 80） */
  recursionLimit?: number
  /** 绝对 act 轮次上限，0=不限制（默认 0） */
  hardRoundCap?: number
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  createdAt: string
}

export type SessionSummary = {
  id: string
  title: string
  mode: AgentMode
  updatedAt: string
  createdAt: string
  paused: boolean
  goal?: string
}

export type SessionDetail = SessionSummary & {
  messages: ChatMessage[]
  checklist: GoalChecklistItem[]
  shortMemory: string
}
