/**
 * Sub-agent 派活：类型 + 任务 schema。
 *
 * 设计参考 minimax mavis-09 §1.6 Task tool：
 * - 3 种 subagent_type（explore / worker / verifier），区别在可用工具集
 * - foreground / background 两模式（run_in_background）
 * - 后台任务有独立 id + status + output/error
 * - 并发上限 3 防 token 烧穿
 *
 * 单文件放类型，避免循环 import。
 */

export type SubagentType = 'explore' | 'worker' | 'verifier'

/** 跟 minimax 对齐：sub-agent 工具集白名单 */
export const SUBAGENT_TOOL_ALLOWLIST: Record<SubagentType, ReadonlySet<string>> = {
  explore: new Set([
    'shell_exec',
    'fs_read',
    'grep',
    'glob',
    'memory_list',
    'skill_list',
    'web_search',
    'web_fetch',
    'task_query'
  ]),
  worker: new Set([
    'shell_exec',
    'fs_read',
    'fs_write',
    'fs_edit',
    'fs_delete',
    'grep',
    'glob',
    'memory_upsert',
    'memory_list',
    'memory_delete',
    'skill_list',
    'skill_write',
    'skill_delete',
    'web_search',
    'web_fetch',
    'task',
    'task_query'
  ]),
  verifier: new Set([
    'shell_exec',
    'fs_read',
    'grep',
    'glob',
    'memory_list',
    'skill_list',
    'web_search',
    'web_fetch',
    'task_query'
  ])
} as const

export type SubagentStatus =
  | 'queued' // 已入队，未开始
  | 'running' // 正在跑
  | 'completed' // 跑完，output 有值
  | 'failed' // 跑挂，error 有值
  | 'cancelled' // 用户取消
  | 'budget_exceeded' // token / step 超限

export type SubagentTask = {
  id: string
  parentSessionId: string
  description: string
  prompt: string
  subagentType: SubagentType
  status: SubagentStatus
  /** 最终输出（completed 时填，markdown 文本） */
  output?: string
  /** 失败原因（failed / cancelled / budget_exceeded 时填） */
  error?: string
  /** 累计 tokenUsed（prompt + completion） */
  tokenUsed: number
  /** LLM invoke 次数（≈ step 数） */
  rounds: number
  createdAt: number
  startedAt?: number
  completedAt?: number
}

/** 任务并发上限 */
export const SUBAGENT_MAX_CONCURRENT = 3

/** Sub-agent budget（与主 agent 阶段 1 一致） */
export type SubagentBudget = {
  tokenBudget: number // 0=无限（默认 0）
  maxSteps: number // 0=无限（默认 0）
  timeoutMs: number // 0=无限（默认 0）
}

export const DEFAULT_SUBAGENT_BUDGET: SubagentBudget = {
  tokenBudget: 0,
  maxSteps: 0,
  timeoutMs: 0
}

/** 任务事件（runner emit 给上层） */
export type SubagentEvent =
  | { type: 'queued'; taskId: string; description: string; subagentType: SubagentType }
  | { type: 'started'; taskId: string }
  | { type: 'progress'; taskId: string; message: string; rounds: number; tokenUsed: number }
  | { type: 'completed'; taskId: string; output: string; tokenUsed: number; rounds: number }
  | { type: 'failed'; taskId: string; error: string; status: SubagentStatus }
