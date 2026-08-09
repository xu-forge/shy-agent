export const IPC = {
  ping: 'my-agent:ping',
  getPaths: 'my-agent:get-paths',
  // reserved for later changes
  agentChat: 'my-agent:agent-chat',
  agentCancel: 'my-agent:agent-cancel',
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

export type LongMemoryEntry = {
  id: string
  title: string
  content: string
  tags: string[]
  source: 'user' | 'agent'
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
}
