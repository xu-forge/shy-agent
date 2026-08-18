/**
 * Verify LLM — 段尾跑一次 LLM 自检，输出 auditCheck（completion audit）+ blocked（同条件重复判定）。
 *
 * 设计：复用 ChatOpenAI 实例（与 planChecklist 风格一致），保持轻量（不引入 LangGraph 节点）。
 * 时机：goal-driver 的 runCheckRound 之后，isGoalComplete 之前。
 */
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { getSettings } from '../settings/store'
import type { GoalChecklistItem } from '../../shared/ipc'
import { extractVerifyBlocked, nextBlockedRounds, type VerifyBlockedOutput } from './blocked-audit'
import { getReactGuide } from './react-prompt'

/** verify LLM 输出结构 */
export type VerifyLLMOutput = {
  /** completion audit 自检结果 */
  auditCheck: {
    requirements: string[]
    eachSatisfied: boolean
  }
  /** blocked 同条件重复判定 */
  blocked: VerifyBlockedOutput
}

/** verify LLM 调用结果（带错误兜底） */
export type VerifyLLMResult = {
  ok: boolean
  output?: VerifyLLMOutput
  error?: string
}

const VERIFY_SYSTEM_PROMPT = `${getReactGuide('verify')}\n\n你是目标审计器。给定当前目标、已完成的清单项与未完成项，输出 JSON：
{
  "auditCheck": {
    "requirements": ["从 objective 派生的每条具体需求"],
    "eachSatisfied": true/false
  },
  "blocked": {
    "sameCondition": true/false,
    "reason": "若 sameCondition=true，说明同一阻塞条件；否则省略"
  }
}

规则：
1. requirements 必须从 objective 直接派生，逐条具体（不要泛泛）
2. eachSatisfied 仅当每条都有可证证据（命令输出/文件内容/测试结果）时为 true
3. blocked.sameCondition 仅当本轮与上一轮 verify 失败原因完全相同时为 true
4. 只输出 JSON`

/** parseJsonObject（容错） */
function parseJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = (fenced?.[1] ?? text).trim()
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
      } catch {
        return null
      }
    }
    return null
  }
}

/** 从解析后的 JSON 抽取 VerifyLLMOutput（容错） */
export function extractVerifyLLMOutput(value: unknown): VerifyLLMOutput {
  const obj = (value ?? {}) as Record<string, unknown>
  const ac = obj.auditCheck as Record<string, unknown> | undefined
  const requirements = Array.isArray(ac?.requirements)
    ? (ac!.requirements as unknown[]).map((r) => String(r))
    : []
  const eachSatisfied = ac?.eachSatisfied === true
  const blocked = extractVerifyBlocked(obj.blocked) ?? {}
  return {
    auditCheck: { requirements, eachSatisfied },
    blocked: {
      sameCondition: typeof blocked.sameCondition === 'boolean' ? blocked.sameCondition : undefined,
      reason: blocked.reason
    }
  }
}

/**
 * 调用 LLM 跑 verify。
 *
 * 失败兜底：
 * - LLM 不可用 / apiKey 缺失 → 返回 { ok: false, error }，不抛
 * - JSON 解析失败 → 返回 { ok: true, output: { auditCheck: { requirements: [], eachSatisfied: true }, blocked: {} } }
 *   （保守放行 audit，避免 LLM 不可用时整个 goal 永远不 complete）
 */
export async function runVerifyLLM(input: {
  goal: string
  checklist: GoalChecklistItem[]
}): Promise<VerifyLLMResult> {
  const settings = await getSettings()
  if (!settings.apiKey) {
    return { ok: false, error: 'apiKey 未配置' }
  }

  const llm = new ChatOpenAI({
    model: settings.model,
    apiKey: settings.apiKey,
    configuration: { baseURL: settings.baseURL },
    temperature: 0
  })

  const pending = input.checklist.filter((c) => !c.done)
  const done = input.checklist.filter((c) => c.done)
  const humanMsg = `总目标：${input.goal}\n\n已完成：\n${
    done.length === 0
      ? '（无）'
      : done.map((c) => `- [x] ${c.title}${c.check ? `（验收：${c.check}）` : ''}`).join('\n')
  }\n\n未完成：\n${
    pending.length === 0
      ? '（无）'
      : pending.map((c) => `- [ ] ${c.title}${c.check ? `（验收：${c.check}）` : ''}`).join('\n')
  }`

  try {
    const res = await llm.invoke([new SystemMessage(VERIFY_SYSTEM_PROMPT), new HumanMessage(humanMsg)])
    const text = typeof res.content === 'string' ? res.content : JSON.stringify(res.content)
    const parsed = parseJsonObject(text)
    if (!parsed) {
      // JSON 解析失败：保守放行 audit，blocked 默认 false
      return {
        ok: true,
        output: {
          auditCheck: { requirements: [], eachSatisfied: true },
          blocked: { sameCondition: false }
        }
      }
    }
    return { ok: true, output: extractVerifyLLMOutput(parsed) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * 计算下一轮 blockedRounds + 是否触发 blocked 暂停。
 */
export function applyBlockedAudit(input: {
  prevBlockedRounds: number
  blocked: VerifyBlockedOutput
  blockedAuditRounds: number
}): {
  newBlockedRounds: number
  shouldPause: boolean
} {
  const newBlockedRounds = nextBlockedRounds(input.prevBlockedRounds, input.blocked)
  const shouldPause =
    newBlockedRounds > 0 && newBlockedRounds >= input.blockedAuditRounds && input.blocked.sameCondition === true
  return { newBlockedRounds, shouldPause }
}
