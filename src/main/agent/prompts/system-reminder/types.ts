/**
 * System Reminder 类型定义（参考 minimax mavis-09 §3）。
 *
 * 设计：
 * - 每个 reminder 是一个独立 provider 函数：input → string | undefined
 * - 返回 undefined 表示该 reminder 跳过（gate 失败 / cooldown 未到 / allowlist 不允许）
 * - Registry 管理 provider 列表（按注册顺序）
 * - Service 编排 collect + buildReminder
 *
 * 4 类 provider（首批）：
 * - identity:  agent / user / session ID（turn 1 full / turn 2+ slim）
 * - platform:  OS / shell / 路径 / 权限层
 * - progress:  goal / 验收清单 / 当前段 / 进度
 * - memory:    长期记忆摘录 + 短期压缩态
 *
 * Cooldown 机制：
 * - 每个 reminder 可有独立 cooldown（默认 6h / 15min / 5min 三档）
 * - 同 session+reminder 重复注入被抑制
 *
 * Critical 机制：
 * - critical reminder 即使 SR 关闭也会跑（identity / platform 等核心信息）
 */

/** 提醒器输入 — 由 service.collect() 构造 */
export type ReminderInput = {
  /** 当前 session 信息 */
  env: {
    sessionId: string
    agentName: string
    agentRole: 'orchestrator' | 'worker' | 'unknown'
    displayName?: string
    userConfiguredName?: string
    platform: NodeJS.Platform
    cwd: string
    shell: 'zsh' | 'bash' | 'powershell' | 'cmd'
    teamModeOff: boolean
  }
  /** 当前 turn number（1 = 首次对话） */
  turnCount: number
  /** 长期记忆 block（来自 memory/db.ts） */
  memoryBlock: string
  /** 短期压缩态 */
  shortMemory: string
  /** 已匹配技能 block */
  skillBlock: string
  /** 当前 goal 状态（如果有） */
  goal?: {
    goal: string
    checklist: ReadonlyArray<{ id: string; title: string; done: boolean }>
    progress: { done: number; total: number; pct: number }
    budget: { tokenUsed: number; tokenBudget: number; pct: number; disabled: boolean }
    stagnantRounds: number
    blockedRounds: number
  }
  /** 兄弟 session / team 队友（peers） */
  peers?: ReadonlyArray<{ sessionId: string; displayName: string; status: 'idle' | 'running' }>
  /** 用户配置 allowlist（null = 全开） */
  allowlist: Set<string> | null
  /** 是否仅 critical（disable model gate） */
  criticalOnly: boolean
}

/** 提醒器函数签名 */
export type ReminderProviderFn = (input: ReminderInput) => string | undefined

/** Registry 条目 */
export type ReminderProviderEntry = {
  name: string
  fn: ReminderProviderFn
  critical: boolean
}

/** Cooldown 时长档位 */
export const COOLDOWN_PRESETS = {
  longTerm: 6 * 60 * 60 * 1000, // 6h  — bootstrap / persona
  userProfile: 15 * 60 * 1000, // 15min — user profile missing
  taskComplete: 5 * 60 * 1000, // 5min — task completion
  identity: 0, // 0 = no cooldown (身份类每轮都注入)
  platform: 0 // 同上
} as const

/** 某个 reminder 的具体 cooldown（per-key） */
export type CooldownMs = number
