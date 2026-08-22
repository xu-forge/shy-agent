/**
 * 技能目录（catalog）渲染 — system prompt 注入用。
 * 移植自 MiniMaxCode local-runtime/src/skills/catalog.ts，小型化。
 *
 * 预算：min(2% × contextWindow, 5000) tokens；单条描述 ≤1024 字符；超预算截断并附溢出提示。
 */
import type { SkillEntry } from './registry'
import { estimateTextTokens } from '../agent/compaction/token-estimator'

export const SKILL_CATALOG_MAX_BUDGET_TOKENS = 5000
export const SKILL_DESCRIPTION_MAX_CHARS = 1024

export const SKILL_SELECTION_INSTRUCTION = `以上为可用技能目录。需要某个技能时，调用 skill 工具（参数 name）读取其完整说明后再按说明操作。`

export type CatalogRenderResult = {
  text: string
  included: number
  truncated: boolean
}

export function renderSkillCatalog(
  entries: SkillEntry[],
  budgetTokens: number
): CatalogRenderResult {
  const budget = Math.max(0, Math.min(budgetTokens, SKILL_CATALOG_MAX_BUDGET_TOKENS))
  if (!entries.length || budget <= 0) return { text: '', included: 0, truncated: false }

  const lines: string[] = ['## 可用技能', '']
  let used = estimateTextTokens(lines.join('\n'))
  let included = 0
  let truncated = false

  for (const e of entries) {
    const desc = e.description.slice(0, SKILL_DESCRIPTION_MAX_CHARS)
    const line = `- ${e.name}${e.title && e.title !== e.name ? `（${e.title}）` : ''}${desc ? `：${desc}` : ''}`
    const cost = estimateTextTokens(line)
    if (used + cost > budget) {
      truncated = true
      break
    }
    lines.push(line)
    used += cost
    included++
  }

  if (truncated) {
    lines.push('', `（技能较多，已按预算截断；完整列表可用 skill 工具或技能视图查看）`)
  }
  lines.push('', SKILL_SELECTION_INSTRUCTION)
  return { text: lines.join('\n'), included, truncated }
}
