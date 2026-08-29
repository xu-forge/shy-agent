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
  skillsSetEnabled: 'shy:skills-set-enabled',
  settingsGet: 'shy:settings-get',
  settingsSet: 'shy:settings-set',
  mcpGet: 'shy:mcp-get',
  mcpSet: 'shy:mcp-set',
  mcpStatus: 'shy:mcp-status',
  toolConfirm: 'shy:tool-confirm',
  askUserReply: 'shy:ask-user-reply',
  sessionsList: 'shy:sessions-list',
  sessionsGet: 'shy:sessions-get',
  sessionsCreate: 'shy:sessions-create',
  sessionsDelete: 'shy:sessions-delete',
  sessionFilesList: 'shy:session-files-list',
  sessionFilesReveal: 'shy:session-files-reveal',
  sessionDiffsList: 'shy:session-diffs-list',
  sessionTasksList: 'shy:session-tasks-list',
  sessionTasksUpdate: 'shy:session-tasks-update',
  sessionTasksDelete: 'shy:session-tasks-delete',
  scheduleTasksList: 'shy:schedule-tasks-list',
  scheduleTasksGet: 'shy:schedule-tasks-get',
  scheduleTasksCreate: 'shy:schedule-tasks-create',
  scheduleTasksUpdate: 'shy:schedule-tasks-update',
  scheduleTasksDelete: 'shy:schedule-tasks-delete',
  scheduleTasksExpand: 'shy:schedule-tasks-expand',
  scheduleRemind: 'shy:schedule-remind',
  logsAgentList: 'shy:logs-agent-list',
  logsAgentRead: 'shy:logs-agent-read',
  logsAgentReveal: 'shy:logs-agent-reveal',
  projectsList: 'shy:projects-list',
  projectsCreate: 'shy:projects-create',
  projectsDelete: 'shy:projects-delete',
  sessionsBindProject: 'shy:sessions-bind-project',
  projectPickFolder: 'shy:project-pick-folder',
  projectPickFile: 'shy:project-pick-file',
  projectTreeList: 'shy:project-tree-list',
  projectFileRead: 'shy:project-file-read',
  projectFileReadDataUrl: 'shy:project-file-read-data-url',
  projectFileWrite: 'shy:project-file-write',
  projectReveal: 'shy:project-reveal',
  projectMaterialsList: 'shy:project-materials-list',
  projectMaterialsImport: 'shy:project-materials-import',
  materialThumbGet: 'shy:material-thumb-get',
  materialThumbPut: 'shy:material-thumb-put',
  materialCanvasStateGet: 'shy:material-canvas-state-get',
  materialCanvasStateSet: 'shy:material-canvas-state-set',
  projectFileOpen: 'shy:project-file-open',
  projectFileRename: 'shy:project-file-rename',
  projectFileDelete: 'shy:project-file-delete',
  dockOpenRoot: 'shy:dock-open-root',
  dockTreeList: 'shy:dock-tree-list',
  dockFileRead: 'shy:dock-file-read',
  dockFileReadDataUrl: 'shy:dock-file-read-data-url',
  dockFileReveal: 'shy:dock-file-reveal',
  dockFileOpen: 'shy:dock-file-open',
  events: 'shy:events',
  browserShow: 'shy:browser-show',
  browserHide: 'shy:browser-hide',
  browserSetBounds: 'shy:browser-set-bounds',
  browserGetState: 'shy:browser-get-state',
  browserNavigate: 'shy:browser-navigate',
  browserScreenshot: 'shy:browser-screenshot',
  browserBack: 'shy:browser-back',
  browserForward: 'shy:browser-forward',
  browserReload: 'shy:browser-reload'
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

export type RunStatus = 'idle' | 'running' | 'paused' | 'completed' | 'cancelled'

export type ActiveView = { kind: 'code' | 'material'; relativePath: string }

export type ChatRequest = {
  sessionId: string
  message: string
  mode: AgentMode
  verifyCommand?: string
  /** 发送瞬间正在查看的文件；不写入用户消息正文 */
  activeView?: ActiveView
}

export type GoalChecklistItem = {
  id: string
  title: string
  done: boolean
  /** 可执行的 shell 验收命令 */
  check?: string
  evidence?: string
  lastExitCode?: number
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

export type SkillRootKind = 'project' | 'agent' | 'user' | 'builtin'

export type SkillSummary = {
  id: string
  name: string
  description: string
  path: string
  /** 来源根（minimax-feature-port） */
  rootKind: SkillRootKind
  /** 启用状态（默认 true） */
  enabled: boolean
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
  /** 目标模式：LLM 在 verify 阶段判定"同条件重复"达该轮数后触发 blocked 暂停（默认 3；范围 1-10） */
  blockedAuditRounds?: number
  /** 目标模式：完成时是否通过 goal_complete 事件向 UI 报告 tokenUsed / rounds / duration（默认 true） */
  enableGoalCompleteReport?: boolean
  /** 始终授权：开启后工具确认不再逐条弹窗，直接放行（默认 false） */
  autoApproveTools?: boolean
}

export type McpServerEntry = {
  command: string
  args: string[]
  env: Record<string, string>
  enabled: boolean
}

export type McpConfigFile = {
  mcpServers: Record<string, McpServerEntry>
}

export type McpServerState = 'connected' | 'disabled' | 'error' | 'connecting' | 'invalid'

export type McpServerStatus = {
  id: string
  state: McpServerState
  error?: string
  tools: string[]
}

export type McpSetResult = {
  config: McpConfigFile
  status: McpServerStatus[]
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  createdAt: string
  kind?: 'result'
}

export type SessionSummary = {
  id: string
  title: string
  mode: AgentMode
  updatedAt: string
  createdAt: string
  paused: boolean
  goal?: string
  runStatus?: RunStatus
  verifyCommand?: string
  projectId?: string | null
}

export type SessionDetail = SessionSummary & {
  messages: ChatMessage[]
  checklist: GoalChecklistItem[]
  shortMemory: string
  approvedChecks?: string[]
  resultContent?: string
  resultReportPath?: string
}

export type ProjectType = 'code' | 'material'

export type Project = {
  id: string
  name: string
  type: ProjectType
  rootPath: string
  createdAt: string
  updatedAt: string
}

export type MaterialKind = 'image' | 'video' | 'audio' | 'doc' | 'other'

export type MaterialItem = {
  id: string
  relativePath: string
  absPath: string
  kind: MaterialKind
  mime: string
  mtimeMs: number
  size: number
  sourceSessionId?: string
  derivedFrom?: string
}

export type TreeNode = { name: string; path: string; type: 'file' | 'dir'; children?: TreeNode[] }

export type BindSessionProjectResult =
  { ok: true } | { ok: false; error: 'already_bound' | 'has_messages' | 'not_found' }

export type ProjectPickFolderResult = { ok: true; path: string } | { ok: false }

export type ProjectPickFileResult = ProjectPickFolderResult

export type ProjectRevealResult = { ok: true } | { ok: false; error: 'path_escape' | 'not_found' }

export type ProjectFileReadDataUrlResult =
  { ok: true; dataUrl: string } | { ok: false; error: 'path_escape' | 'not_found' }

export type ProjectCreateResult =
  { ok: true; project: Project } | { ok: false; error: 'root_path_taken' }

export type ProjectTreeListResult =
  { ok: true; tree: TreeNode[]; truncated: boolean } | { ok: false; error: 'not_found' }

export type ProjectFileReadResult =
  { ok: true; content: string } | { ok: false; error: 'path_escape' | 'not_found' }

export type ProjectFileWriteResult =
  { ok: true } | { ok: false; error: 'path_escape' | 'not_found' }

export type ProjectMaterialsListResult =
  { ok: true; items: MaterialItem[]; truncated: boolean } | { ok: false; error: 'not_found' }

export type ProjectMaterialsImportResult =
  { ok: true; item: MaterialItem } | { ok: false; error: 'path_escape' | 'not_found' }

/* ────────── material canvas（material-canvas） ────────── */

export type MaterialThumbGetInput = {
  projectId: string
  absPath: string
  mtimeMs: number
  size: number
}

export type MaterialThumbGetResult =
  { ok: true; url: string } | { ok: false; reason: 'unsupported' | 'not_found' | 'path_escape' }

export type MaterialThumbPutInput = MaterialThumbGetInput & {
  /** data:image/png 或 data:image/jpeg 的 base64 data URL（renderer 截帧产物） */
  dataUrl: string
}

export type MaterialThumbPutResult =
  { ok: true; url: string } | { ok: false; reason: 'invalid_data' | 'path_escape' }

export type MaterialCanvasSortBy = 'mtime_desc'

export type MaterialCanvasState = {
  x: number
  y: number
  scale: number
  sortBy?: MaterialCanvasSortBy
  /** 折叠分组的目录 relativePath 集合（material-canvas-groups） */
  collapsed?: string[]
}

export type MaterialCanvasStateGetResult =
  { ok: true; state: MaterialCanvasState | null } | { ok: false; error: 'not_found' }

export type MaterialCanvasStateSetResult = { ok: true } | { ok: false; error: 'not_found' }

export type ProjectFileOpenResult =
  { ok: true } | { ok: false; error: 'path_escape' | 'not_found' | 'open_failed' }

export type ProjectFileRenameInput = {
  projectId: string
  absPath: string
  newName: string
}

export type ProjectFileRenameResult =
  { ok: true; item: MaterialItem }
  | { ok: false; error: 'path_escape' | 'not_found' | 'name_taken' | 'invalid_name' }

export type ProjectFileDeleteResult =
  { ok: true } | { ok: false; error: 'path_escape' | 'not_found' | 'delete_failed' }

export type DockOpenRootResult =
  { ok: true; path: string } | { ok: false; error: 'not_found' | 'open_failed' }

export type DockTreeListResult =
  | { ok: true; tree: TreeNode[]; truncated: boolean; rootPath: string }
  | { ok: false; error: 'not_found' }

export type DockFileReadResult =
  | { ok: true; content: string; truncated: boolean }
  | { ok: false; error: 'path_escape' | 'not_found' }

export type DockFileReadDataUrlResult =
  { ok: true; dataUrl: string } | { ok: false; error: 'path_escape' | 'not_found' }

export type DockFilePathResult =
  { ok: true } | { ok: false; error: 'path_escape' | 'not_found' | 'open_failed' }

/* ────────── session files & tasks（shell-session-side-panel） ────────── */

export type FileOp = 'read' | 'write' | 'delete'

export type SessionFileRecord = {
  id: number
  sessionId: string
  op: FileOp
  path: string
  occurredAt: number
}

/* ────────── session diffs（inspector-func-panel） ────────── */

export type SessionDiffRecord = {
  id: number
  sessionId: string
  path: string
  op: 'write' | 'delete'
  added: number
  removed: number
  diffText: string
  snapshotPath: string | null
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

/* ────────── schedule（定时任务） ────────── */

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

export type ScheduleTaskAction = 'remind' | 'run_skill'

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
  type: 'schedule_conflict'
  taskId: string
  message: string
}

export type CreateScheduleTaskInput = Omit<ScheduleTask, 'id' | 'createdAt' | 'updatedAt'>

export type UpdateScheduleTaskInput = Partial<
  Pick<ScheduleTask, 'title' | 'enabled' | 'schedule' | 'action' | 'payload'>
>

export type ScheduleTasksListResult = {
  tasks: ScheduleTask[]
  warnings: ScheduleConflictWarning[]
}

export type ScheduleTaskSaveResult = {
  task: ScheduleTask | null
  warnings: ScheduleConflictWarning[]
}

export type ScheduleTasksExpandInput = {
  rangeStart: string | number
  rangeEnd: string | number
}

export type ScheduleReminderEvent = {
  type: 'schedule_remind'
  taskId: string
  title: string
  message: string
  at: string
}

/* ────────── Agent events (chat → renderer) ────────── */

export type AgentEvent =
  | { type: 'status'; message: string }
  | { type: 'assistant'; content: string; sessionId?: string }
  | { type: 'assistant_delta'; content: string; sessionId?: string }
  | { type: 'assistant_done'; sessionId?: string }
  | { type: 'reasoning_delta'; content: string; sessionId?: string }
  | { type: 'reasoning_done'; sessionId?: string }
  | { type: 'tool'; name: string; detail?: unknown; input?: unknown; sessionId?: string }
  | { type: 'tool_call'; id: string; name?: string; input?: unknown; sessionId?: string }
  | { type: 'tool_result'; id: string; output?: unknown; error?: string; sessionId?: string }
  | { type: 'memory'; action: string; entryId?: string; title?: string; sessionId?: string }
  | { type: 'goal'; goal?: string; checklist?: GoalChecklistItem[]; sessionId?: string }
  | {
      type: 'task'
      kind: 'add'
      id: string
      title: string
      done?: boolean
      evidence?: string
      source: TaskSource
      sessionId?: string
    }
  | {
      type: 'task'
      kind: 'update'
      id: string
      title?: string
      done?: boolean
      evidence?: string
      source?: TaskSource
      sessionId?: string
    }
  | { type: 'task'; kind: 'remove'; id: string; sessionId?: string }
  | { type: 'error'; message: string; sessionId?: string }
  | { type: 'result'; content: string; reportPath?: string; sessionId?: string }
  | { type: 'done'; reason: string; sessionId?: string }
  | {
      type: 'confirm_required'
      action: string
      detail: string
      requestId: string
      sessionId?: string
    }
  | {
      type: 'ask_user'
      requestId: string
      question: string
      options?: string[]
      sessionId?: string
    }
  | { type: 'notify'; message: string; sessionId?: string }
  | { type: 'session'; title?: string; sessionId?: string }
  | { type: 'blocked'; rounds: number; reason?: string; sessionId?: string }
  | {
      type: 'goal_complete'
      goal: string
      checklist: GoalChecklistItem[]
      tokenUsed: number
      rounds: number
      durationMs: number
      sessionId?: string
    }
  | { type: 'skills_changed' }
  | { type: 'browser_navigated'; tabId: string; url: string }
  | { type: 'browser_screenshot'; path: string }
