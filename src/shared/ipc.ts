export const IPC = {
  ping: 'shy:ping',
  getPaths: 'shy:get-paths',
  agentChat: 'shy:agent-chat',
  agentCancel: 'shy:agent-cancel',
  agentPause: 'shy:agent-pause',
  agentResume: 'shy:agent-resume',
  memoryList: 'shy:memory-list',
  memoryUpsert: 'shy:memory-upsert',
  memoryDelete: 'shy:memory-delete',
  skillsList: 'shy:skills-list',
  skillsRead: 'shy:skills-read',
  skillsWrite: 'shy:skills-write',
  skillsDelete: 'shy:skills-delete',
  settingsGet: 'shy:settings-get',
  settingsSet: 'shy:settings-set',
  toolConfirm: 'shy:tool-confirm',
  sessionsList: 'shy:sessions-list',
  sessionsGet: 'shy:sessions-get',
  sessionsCreate: 'shy:sessions-create',
  sessionsDelete: 'shy:sessions-delete',
  sessionFilesList: 'shy:session-files-list',
  sessionFilesReveal: 'shy:session-files-reveal',
  sessionTasksList: 'shy:session-tasks-list',
  sessionTasksUpdate: 'shy:session-tasks-update',
  sessionTasksDelete: 'shy:session-tasks-delete',
  workflowList: 'shy:workflow-list',
  workflowGet: 'shy:workflow-get',
  workflowSave: 'shy:workflow-save',
  workflowDelete: 'shy:workflow-delete',
  workflowRun: 'shy:workflow-run',
  workflowRunsList: 'shy:workflow-runs-list',
  workflowTemplate: 'shy:workflow-template',
  logsAgentList: 'shy:logs-agent-list',
  logsAgentRead: 'shy:logs-agent-read',
  logsAgentReveal: 'shy:logs-agent-reveal',
  events: 'shy:events'
} as const

export type AppPaths = {
  /** @deprecated 同 shyHome，兼容旧字段名 */
  userData: string
  shyHome: string
  configDir: string
  dbPath: string
  skillsDir: string
  logsAgentDir: string
  artifactsDir: string
  platform: NodeJS.Platform
}

export type AgentLogFileSummary = {
  name: string
  path: string
  size: number
  mtimeMs: number
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
  /** 可执行验收规则的描述（如“运行 npm test 且全绿”）；本轮仅透传，rules engine 后续执行 */
  check?: string
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
  /** 目标模式 token 成本预算，0=不限制（默认 1_000_000_000）；按 usage_metadata 累计，超预算软暂停 */
  tokenBudget?: number
  /** 目标模式单段 invoke 的最大图步数；段尾落盘后自动续段（默认 60） */
  segmentSteps?: number
  /** 模型上下文窗口 token 数（用于估算上下文水位，默认 1_000_000） */
  contextWindow?: number
  /** 上下文水位触发压缩的阈值（百分比，默认 60；超过则压缩短期记忆） */
  compressThreshold?: number
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

/* ────────── session files & tasks（shell-session-side-panel） ────────── */

export type FileOp = 'read' | 'write' | 'delete'

export type SessionFileRecord = {
  id: number
  sessionId: string
  op: FileOp
  path: string
  occurredAt: number
}

export type TaskSource = 'goal' | 'agent'

export type SessionTaskRecord = {
  id: string
  sessionId: string
  title: string
  done: boolean
  evidence?: string
  source: TaskSource
  occurredAt: number
  updatedAt: number
}

export type TaskEvent =
  | {
      type: 'task'
      sessionId: string
      kind: 'add'
      id: string
      title: string
      evidence?: string
      source: TaskSource
    }
  | {
      type: 'task'
      sessionId: string
      kind: 'update'
      id: string
      title?: string
      done?: boolean
      evidence?: string
      source?: TaskSource
    }
  | { type: 'task'; sessionId: string; kind: 'remove'; id: string }

/* ────────── workflows（可视化节点工作流引擎） ────────── */

export type WorkflowNodeType =
  'trigger' | 'fetch' | 'summarize' | 'recommend' | 'write_doc' | 'output'

export type WorkflowNode = {
  id: string
  type: WorkflowNodeType
  label: string
  x: number
  y: number
  /** 节点参数（类型相关，见 engine） */
  config: Record<string, unknown>
}

export type WorkflowEdge = {
  id: string
  source: string
  target: string
}

/** 可交互式 cron：频率 + 时间 + 星期几，编译成 cron 表达式 */
export type WorkflowSchedule = {
  enabled: boolean
  frequency: 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'hourly'
  time: string // HH:mm，daily/weekdays/weekly 用
  weekdays: number[] // 0-6，Sunday=0，weekly 用
  dayOfMonth: number // monthly 用
  minute: number // hourly 用
  /** 由上面参数编译出的 cron 表达式（运行时权威） */
  cron: string
}

export type ScheduleTaskAction = 'run_workflow' | 'remind' | 'run_skill'

export type RunWorkflowScheduleTaskPayload = {
  workflowId: string
}

export type RemindScheduleTaskPayload = {
  message: string
}

export type RunSkillScheduleTaskPayload = {
  skillId: string
}

type ScheduleTaskBase = {
  id: string
  title: string
  enabled: boolean
  schedule: WorkflowSchedule
  createdAt: string
  updatedAt: string
}

export type ScheduleTask = ScheduleTaskBase &
  (
    | { action: 'run_workflow'; payload: RunWorkflowScheduleTaskPayload }
    | { action: 'remind'; payload: RemindScheduleTaskPayload }
    | { action: 'run_skill'; payload: RunSkillScheduleTaskPayload }
  )

export type ScheduleOccurrence = {
  taskId: string
  at: string
  title: string
  action: ScheduleTaskAction
}

/** 后续冲突检测任务填充；当前先固定供 IPC/UI 复用的警告结构。 */
export type ScheduleConflictWarning = {
  type: 'workflow_schedule_conflict'
  taskId: string
  workflowId: string
  message: string
}

export type Workflow = {
  id: string
  name: string
  description: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  schedule: WorkflowSchedule
  outputConfig: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type WorkflowRunStatus = 'running' | 'success' | 'failed' | 'cancelled'

export type WorkflowRun = {
  id: string
  workflowId: string
  workflowName: string
  status: WorkflowRunStatus
  trigger: 'manual' | 'schedule' | 'calendar_task'
  taskId?: string
  startedAt: string
  finishedAt?: string
  /** 逐节点执行日志 */
  logs: WorkflowRunLog[]
  /** 最终产物（如落盘的文档路径） */
  output?: string
  error?: string
}

export type WorkflowRunLog = {
  nodeId: string
  nodeLabel: string
  status: 'running' | 'success' | 'failed'
  message: string
  at: string
}

export type WorkflowEvent =
  { type: 'workflow_run'; run: WorkflowRun } | { type: 'workflow_updated'; workflow: Workflow }
