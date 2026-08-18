/**
 * 结构化 `<goal_context>` 块 — 注入到 goal 模式 LLM 调用的系统消息前。
 *
 * 设计参考 Codex goal system 的 codex_internal_context：
 * - 10 个字段：objective / run_status / progress / budget / stagnant_rounds /
 *   blocked_rounds / fidelity / completion_audit / blocked_audit / work_from_evidence
 * - 转义 XML 字符防 prompt 注入
 * - 在 plan / act 节点系统消息前注入；interactive 模式不注入
 */

import type { GoalChecklistItem, ModelSettings } from '../../shared/ipc'

/** goal_context 注入所需的最小状态（解耦 AgentState） */
export type GoalContextState = {
  goal: string
  runStatus?: string
  checklist: GoalChecklistItem[]
  stagnantRounds: number
  blockedRounds: number
  tokenUsed: number
}

/** 注入所需的设置（包含 blockedAuditRounds） */
export type GoalContextSettings = Pick<ModelSettings, 'tokenBudget' | 'blockedAuditRounds'>

/** 当前工作目录（CWD），用于 work_from_evidence 段 */
export type GoalContextCwd = string

/** XML 字符转义（防 prompt 注入：goal 可能含 `<script>` 之类） */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** 计算 done 数 */
function countDone(items: GoalChecklistItem[]): number {
  return items.filter((c) => c.done).length
}

/** 计算 budget 百分比（tokenBudget=0 时表示禁用） */
function budgetPct(tokenUsed: number, tokenBudget: number): string {
  if (tokenBudget <= 0) return 'unlimited'
  const pct = Math.min(100, Math.round((tokenUsed / tokenBudget) * 100))
  return `${pct}%`
}

/** fidelity 段落 */
const FIDELITY_BLOCK = `<fidelity>
- Optimize each turn for movement toward the requested end state, not for the smallest stable-looking subset or easiest passing change.
- Do not substitute a narrower, safer, smaller, merely compatible, or easier-to-test solution because it is more likely to pass current tests.
- An edit is aligned only if it makes the requested final state more true; useful-looking behavior that preserves a different end state is misaligned.
</fidelity>`

/** completion_audit 段落 */
const COMPLETION_AUDIT_BLOCK = `<completion_audit>
Before declaring a goal complete, run this audit:
- Derive concrete requirements from the objective.
- For each requirement, identify authoritative evidence (command output / file content / test result) that proves it.
- Do NOT mark complete merely because the checklist is done or because work is stopping.
- Do NOT mark complete because the token budget is exhausted.
- Only emit the final result / done event when each requirement has satisfied evidence.
</completion_audit>`

/** blocked_audit 段落 */
const BLOCKED_AUDIT_BLOCK = `<blocked_audit>
If the same blocking condition repeats across verify rounds:
- Same verify failure reason + same checklist item stuck + same root cause -> set blocked.sameCondition = true in verify output.
- The system will increment blockedRounds; when it reaches blockedAuditRounds the run pauses for user intervention.
- Reset blockedRounds to 0 when sameCondition = false.
</blocked_audit>`

/** work_from_evidence 段落（cwd 注入） */
function workFromEvidenceBlock(cwd: string): string {
  return `<work_from_evidence>
Use the current worktree (${escapeXml(cwd)}) and external state as authoritative.
Inspect current files / command output before acting; do not rely on prior memory or assumptions.
</work_from_evidence>`
}

/**
 * 构造结构化 goal_context 块。
 *
 * @returns 完整 markdown 字符串（含 `<goal_context source="goal">…</goal_context>` 包裹）。
 */
export function buildGoalContext(
  state: GoalContextState,
  settings: GoalContextSettings,
  cwd: GoalContextCwd
): string {
  const done = countDone(state.checklist)
  const total = state.checklist.length
  const blockedAuditRounds = settings.blockedAuditRounds ?? 3
  const tokenBudget = settings.tokenBudget ?? 0

  return [
    '<goal_context source="goal">',
    `  <objective>${escapeXml(state.goal || '(未设置)')}</objective>`,
    `  <run_status>${escapeXml(state.runStatus ?? 'running')}</run_status>`,
    `  <progress>${done}/${total} done</progress>`,
    `  <budget>${state.tokenUsed} / ${tokenBudget} tokens (${budgetPct(state.tokenUsed, tokenBudget)})</budget>`,
    `  <stagnant_rounds>${state.stagnantRounds}</stagnant_rounds>`,
    `  <blocked_rounds>${state.blockedRounds}/${blockedAuditRounds}</blocked_rounds>`,
    '',
    `  ${FIDELITY_BLOCK}`,
    '',
    `  ${COMPLETION_AUDIT_BLOCK}`,
    '',
    `  ${BLOCKED_AUDIT_BLOCK}`,
    '',
    `  ${workFromEvidenceBlock(cwd)}`,
    '</goal_context>'
  ].join('\n')
}
