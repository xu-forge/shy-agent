/**
 * Sub-agent runner：执行一个 sub-agent 任务。
 *
 * 设计参考 minimax mavis-09 §1.6 + mavis-12 task 子系统：
 * - 工具白名单按 subagent_type 过滤（explore/worker/verifier 各自能调的工具集）
 * - 单 LLM 循环：system + history → 调 LLM → 解析 tool_calls → 跑 tools → 写回 history
 * - 进度事件 emit 给上层（service.ts / renderer）
 * - 应用 budget：token / step / timeout
 * - 并发上限 SUBAGENT_MAX_CONCURRENT=3（防 token 烧穿）
 *
 * 这一版实现「能跑」最小集；Stage 1.4 换成 8 步 turn-runner 后会替换。
 */
import { invokeChatCompletion, type LLMMessage } from '../llm-client'
import { buildTools, type ToolContext } from '../tools/registry'
import { runToolCalls, toOpenAITools } from '../tools/dispatcher'
import {
  type SubagentTask,
  type SubagentEvent,
  type SubagentBudget,
  DEFAULT_SUBAGENT_BUDGET,
  SUBAGENT_TOOL_ALLOWLIST
} from './types'
import { getSubagentTask, updateSubagentTask } from './store'

export type SubagentRunDeps = {
  /** LLM 配置（baseURL/apiKey/model） */
  llmConfig: { baseURL: string; apiKey: string; model: string }
  /** 工具上下文：emit / confirmHighRisk / sessionId */
  toolCtx: ToolContext
  /** budget（0=无限） */
  budget?: SubagentBudget
  /** 事件 sink（runner → service → renderer） */
  emit: (event: SubagentEvent) => void
  /** AbortSignal（用户取消） */
  signal?: AbortSignal
}

const SUBAGENT_SYSTEM_PROMPT: Record<SubagentTask['subagentType'], string> = {
  explore: `你是 shy 的 explore sub-agent。只读模式，可调 search/read/grep/memory_list/skill_list/web_fetch 等工具。

你的任务：调研并返回结构化结论。
- 不修改任何文件、不写记忆、不创建任务。
- 收到 prompt 后用工具充分调研，最后给一段简洁 markdown 结论（关键发现 + 引用源）。
- 结论要具体、有数据支撑；不要"建议进一步研究"这类空话。`,

  worker: `你是 shy 的 worker sub-agent。全工具模式，可读可写。
（提示：当前 stage 1.2 暂未实现 tool filtering 集成，工具可用集同 explore；后续 stage 1.4 接入完整 allowlist。）`,

  verifier: `你是 shy 的 verifier sub-agent。只读 + LLM 自检，产出结构化 auditCheck。

你的任务：给定目标/计划/已完成证据，输出 JSON 审计结论。
- 严格基于证据，不臆测。
- 审计字段：{eachSatisfied: bool, requirements: [string], unsatisfied: [string]}。
- 简洁，不要寒暄。`
}

/**
 * 跑一个 sub-agent 任务。返回最终 SubagentTask（含 status / output / tokenUsed）。
 *
 * 失败兜底：所有 throw 都被 catch，转 SubagentEvent 'failed'，返回 task。
 */
export async function runSubagent(taskId: string, deps: SubagentRunDeps): Promise<SubagentTask> {
  const task = getSubagentTask(taskId)
  if (!task) {
    throw new Error(`sub-agent task ${taskId} 不存在`)
  }
  if (task.status === 'cancelled') {
    deps.emit({ type: 'failed', taskId, error: '已取消', status: 'cancelled' })
    return task
  }

  const budget: SubagentBudget = { ...DEFAULT_SUBAGENT_BUDGET, ...deps.budget }
  const allowlist = SUBAGENT_TOOL_ALLOWLIST[task.subagentType]

  // 1. 标 started
  const started = updateSubagentTask(taskId, {
    status: 'running',
    startedAt: Date.now()
  })
  deps.emit({ type: 'started', taskId })

  // 2. 工具构造（ctx 复用父 session 的 emit / confirm；sessionId 用父 session）
  const allTools = buildTools(deps.toolCtx)
  const tools = allTools.filter((t) => allowlist.has(t.name))
  const openaiTools = toOpenAITools(tools)

  // 3-4. 单循环：system + user prompt → 调 LLM → 跑 tool → 写回 → 终止
  const messages: LLMMessage[] = [
    { role: 'system', content: SUBAGENT_SYSTEM_PROMPT[task.subagentType] },
    { role: 'user', content: task.prompt }
  ]
  let tokenUsed = task.tokenUsed
  let rounds = task.rounds
  let finalOutput = ''
  let lastError: string | undefined
  let finalStatus: SubagentTask['status'] = 'completed'

  const startMs = Date.now()
  try {
    while (true) {
      if (deps.signal?.aborted) {
        finalStatus = 'cancelled'
        lastError = '用户取消'
        break
      }
      // budget: steps
      if (budget.maxSteps > 0 && rounds >= budget.maxSteps) {
        finalStatus = 'budget_exceeded'
        lastError = `达到 step 上限 ${budget.maxSteps}`
        break
      }
      // budget: timeout
      if (budget.timeoutMs > 0 && Date.now() - startMs > budget.timeoutMs) {
        finalStatus = 'budget_exceeded'
        lastError = `达到 timeout ${budget.timeoutMs}ms`
        break
      }

      rounds += 1
      const res = await invokeChatCompletion(deps.llmConfig, messages, {
        signal: deps.signal,
        temperature: 0.2,
        tools: openaiTools
      })
      tokenUsed += res.usage.promptTokens + res.usage.completionTokens
      messages.push({ role: 'assistant', content: res.content, tool_calls: res.toolCalls })

      // budget: token
      if (budget.tokenBudget > 0 && tokenUsed >= budget.tokenBudget) {
        finalStatus = 'budget_exceeded'
        lastError = `达到 token 预算 ${budget.tokenBudget}`
        finalOutput = res.content
        break
      }

      const toolCalls = res.toolCalls.map((tc) => ({
        id: tc.id,
        name: (tc as { function?: { name?: string } }).function?.name ?? '',
        args: (tc as { function?: { arguments?: string } }).function?.arguments ?? ''
      }))
      if (toolCalls.length === 0) {
        finalOutput = res.content
        break
      }

      deps.emit({
        type: 'progress',
        taskId,
        message: `执行 ${toolCalls.length} 个工具调用`,
        rounds,
        tokenUsed
      })
      const toolResults = await runToolCalls(tools, toolCalls, `sub_${taskId}`, () => {})
      for (const tr of toolResults) {
        messages.push({ role: 'tool', content: tr.content, tool_call_id: tr.tool_call_id })
      }
    }
  } catch (err) {
    finalStatus = 'failed'
    lastError = err instanceof Error ? err.message : String(err)
  }

  // 5. 落最终状态
  const completedAt = Date.now()
  const final = updateSubagentTask(taskId, {
    status: finalStatus,
    output: finalOutput,
    error: lastError,
    tokenUsed,
    rounds,
    completedAt
  })
  if (finalStatus === 'completed') {
    deps.emit({ type: 'completed', taskId, output: finalOutput, tokenUsed, rounds })
  } else {
    deps.emit({ type: 'failed', taskId, error: lastError ?? finalStatus, status: finalStatus })
  }
  return final ?? started ?? task
}

/**
 * 取消一个 sub-agent 任务。正在跑的任务需要依赖 deps.signal 联动才能真正停下。
 * 实际改 DB 状态的逻辑放在 store.cancelSubagentTask，这里仅做 import 转发。
 */
export { cancelSubagentTask } from './store'
