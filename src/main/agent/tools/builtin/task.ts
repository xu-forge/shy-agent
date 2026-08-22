/**
 * 4 个 sub-agent 派活工具：task / task_output / task_query / task_stop。
 *
 * 严格对齐 minimax mavis-09 §1.6 的 8 段式 prompt 设计：
 * - what 工具做什么
 * - when 什么时候用 / 什么时候不用
 * - foreground vs background 行为
 * - 参数详细说明（含 subagent_type + run_in_background）
 */
import { z } from 'zod'
import { registerTool, type ToolContext } from '../registry'
import {
  createSubagentTask,
  getSubagentTask,
  listSubagentTasks,
  cancelSubagentTask
} from '../../subagent/store'
import { runSubagent, type SubagentRunDeps } from '../../subagent/runner'
import { SUBAGENT_MAX_CONCURRENT, DEFAULT_SUBAGENT_BUDGET, type SubagentType } from '../../subagent/types'
import { getSettings } from '../../../settings/store'

const TASK_TOOL_DESCRIPTION = `启动一个 sub-agent 自主处理复杂、多步骤任务。

用于广度调研、可并行的调查、委托实现。**不要**用于定点文件读取、grep 式代码搜索,或更简单、可以直接完成的工作。

前台调用是无状态的、一次性的任务,最终结果只返回给你。后台调用会立刻返回一个 task id,用后台任务控制工具(task_query/task_output/task_stop)查询、读输出或停止。`

const TASK_OUTPUT_DESCRIPTION = `读取一个后台 sub-agent 任务的当前状态或输出。

用于主 agent 派了 run_in_background=true 后,稍后回来拉结果。可以反复调用,直到 status 是 completed/failed/cancelled/budget_exceeded。
- status 是 running/queued: 返回当前进度摘要（不阻塞）
- status 是 completed: 返回完整 output
- 其他终态: 返回 error 字段`

const TASK_QUERY_DESCRIPTION = `查询后台 sub-agent 任务的元信息（id/status/description/tokenUsed/rounds 等）。

用于在调 task_output 之前先确认任务是否结束,或排查任务卡在哪里。**不要**用这个读完整 output——调 task_output 即可。`

const TASK_STOP_DESCRIPTION = `主动停止一个正在跑的 sub-agent 任务。

仅对 status 是 queued/running 的任务有效；已结束的任务直接忽略。停止后状态变 cancelled,可以再调 task_query 确认。`

export function registerTaskTools(): void {
  registerTool('task', (ctx) => ({
    name: 'task',
    description: TASK_TOOL_DESCRIPTION,
    schema: z.object({
      description: z.string().describe('一句话任务描述(3-5 词)'),
      prompt: z.string().describe('给 sub-agent 的完整 prompt'),
      subagent_type: z
        .enum(['explore', 'worker', 'verifier'])
        .describe(
          'explore = 只读调研(可调 search/read/grep/memory_list/skill_list/web_fetch);worker = 全工具(可改文件,默认);verifier = 只读 + LLM 自检,产出结构化 auditCheck'
        ),
      run_in_background: z
        .boolean()
        .optional()
        .describe(
          'true=后台跑,立即返回 task id;false(默认)=前台阻塞直到结束。开放性/预计 > 1 分钟的任务用 true'
        )
    }),
    run: async (input: {
      description: string
      prompt: string
      subagent_type: SubagentType
      run_in_background?: boolean
    }) => {
      // 1. 并发上限检查
      const running = listSubagentTasks().filter(
        (t) => t.status === 'queued' || t.status === 'running'
      )
      if (running.length >= SUBAGENT_MAX_CONCURRENT) {
        return JSON.stringify({
          ok: false,
          error: `已有 ${running.length} 个 sub-agent 在跑,达到并发上限 ${SUBAGENT_MAX_CONCURRENT}。等其中之一结束再派活。`
        })
      }

      // 2. 拿 settings
      const settings = await getSettings()
      if (!settings.apiKey) {
        return JSON.stringify({ ok: false, error: '尚未配置 apiKey' })
      }
      const task = createSubagentTask({
        parentSessionId: ctx.sessionId,
        description: input.description,
        prompt: input.prompt,
        subagentType: input.subagent_type
      })

      const deps: SubagentRunDeps = {
        llmConfig: {
          baseURL: settings.baseURL,
          apiKey: settings.apiKey,
          model: settings.model
        },
        toolCtx: ctx,
        emit: (event) => {
          ctx.emit('subagent', event)
        }
      }

      if (input.run_in_background) {
        // 后台：fire-and-forget，立刻返回 task id
        void runSubagentInBackground(task.id, deps)
        return JSON.stringify({
          ok: true,
          task_id: task.id,
          status: 'queued',
          hint: '任务已在后台启动。用 task_query 查状态,task_output 拉结果,task_stop 取消。'
        })
      }

      // 前台：阻塞跑完返回
      const result = await runSubagent(task.id, deps)
      if (result.status === 'completed') {
        return JSON.stringify({
          ok: true,
          task_id: result.id,
          status: 'completed',
          output: result.output,
          token_used: result.tokenUsed,
          rounds: result.rounds
        })
      }
      return JSON.stringify({
        ok: false,
        task_id: result.id,
        status: result.status,
        error: result.error
      })
    }
  }))

  // minimax-feature-port：dispatch_subagent — 同步派发（spec 命名 + 预算参数）
  registerTool('dispatch_subagent', (ctx) => ({
    name: 'dispatch_subagent',
    description:
      '同步派发一个子代理任务并等待其结论。\n\n' +
      '何时用：可并行的独立调研/执行单元（如"搜索所有用到 X 的文件"）或独立验证。\n' +
      '何时不用：需要与用户多轮交互的任务；预计超过 1 分钟的开放任务（用 task 工具后台跑）。\n' +
      '参数：`type`（explore/worker/verifier）与 `task`（完整任务说明）必填；`maxTokens` 可选（0=不限），返回结论截断至 16k 字符。并发上限 3。',
    schema: z.object({
      type: z.enum(['explore', 'worker', 'verifier']),
      task: z.string(),
      maxTokens: z.number().min(0).max(1_000_000).optional()
    }),
    run: async (input: { type: SubagentType; task: string; maxTokens?: number }) => {
      const running = listSubagentTasks().filter(
        (t) => t.status === 'queued' || t.status === 'running'
      )
      if (running.length >= SUBAGENT_MAX_CONCURRENT) {
        return JSON.stringify({
          ok: false,
          error: `已有 ${running.length} 个子代理在跑（上限 ${SUBAGENT_MAX_CONCURRENT}）`
        })
      }
      const settings = await getSettings()
      if (!settings.apiKey) {
        return JSON.stringify({ ok: false, error: '尚未配置 apiKey' })
      }
      const sub = createSubagentTask({
        parentSessionId: ctx.sessionId,
        description: input.task.slice(0, 60),
        prompt: input.task,
        subagentType: input.type
      })
      ctx.emit('tool', { name: 'dispatch_subagent', subagentType: input.type, taskId: sub.id })
      const result = await runSubagent(sub.id, {
        llmConfig: {
          baseURL: settings.baseURL,
          apiKey: settings.apiKey,
          model: settings.model
        },
        toolCtx: ctx,
        budget: { ...DEFAULT_SUBAGENT_BUDGET, tokenBudget: input.maxTokens ?? 0 },
        emit: (event) => ctx.emit('subagent', event)
      })
      const output = (result.output ?? '').slice(0, 16_000)
      return JSON.stringify(
        result.status === 'completed'
          ? { ok: true, type: input.type, taskId: result.id, tokenUsed: result.tokenUsed, rounds: result.rounds, output }
          : { ok: false, type: input.type, taskId: result.id, status: result.status, error: result.error }
      )
    }
  }))

  registerTool('task_output', (ctx) => ({
    name: 'task_output',
    description: TASK_OUTPUT_DESCRIPTION,
    schema: z.object({
      task_id: z.string().describe('sub-agent 任务 id'),
      blocking: z
        .boolean()
        .optional()
        .describe('true=阻塞直到任务结束（最多等 5 分钟）；false（默认）=立刻返回当前状态')
    }),
    run: async (input: { task_id: string; blocking?: boolean }) => {
      const cur = getSubagentTask(input.task_id)
      if (!cur) {
        return JSON.stringify({ ok: false, error: `task_id ${input.task_id} 不存在` })
      }
      if (input.blocking && (cur.status === 'queued' || cur.status === 'running')) {
        // 简单轮询：每 2s 一次，最多 5 分钟
        const deadline = Date.now() + 5 * 60_000
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 2_000))
          const next = getSubagentTask(input.task_id)
          if (!next) {
            return JSON.stringify({ ok: false, error: '任务已消失' })
          }
          if (
            next.status === 'completed' ||
            next.status === 'failed' ||
            next.status === 'cancelled' ||
            next.status === 'budget_exceeded'
          ) {
            return JSON.stringify(taskToResult(next))
          }
        }
        return JSON.stringify({ ok: false, error: 'blocking 等待超时(5 分钟)' })
      }
      return JSON.stringify(taskToResult(cur))
      // 引用 ctx 防止 lint 误报未用参数（ctx 用于未来扩展，例如 sub-session）
      void ctx
    }
  }))

  registerTool('task_query', (ctx) => ({
    name: 'task_query',
    description: TASK_QUERY_DESCRIPTION,
    schema: z.object({
      task_id: z.string().optional().describe('单查：sub-agent 任务 id'),
      parent_session_id: z.string().optional().describe('列查：父 session id（默认当前 session）')
    }),
    run: async (input: { task_id?: string; parent_session_id?: string }) => {
      if (input.task_id) {
        const t = getSubagentTask(input.task_id)
        if (!t) return JSON.stringify({ ok: false, error: '任务不存在' })
        return JSON.stringify({
          ok: true,
          task: {
            id: t.id,
            status: t.status,
            description: t.description,
            subagent_type: t.subagentType,
            token_used: t.tokenUsed,
            rounds: t.rounds,
            created_at: t.createdAt,
            started_at: t.startedAt,
            completed_at: t.completedAt,
            error: t.error
          }
        })
      }
      const parent = input.parent_session_id ?? ctx.sessionId
      const tasks = listSubagentTasks(parent, 20)
      return JSON.stringify({
        ok: true,
        parent_session_id: parent,
        tasks: tasks.map((t) => ({
          id: t.id,
          status: t.status,
          description: t.description,
          subagent_type: t.subagentType,
          token_used: t.tokenUsed,
          rounds: t.rounds,
          created_at: t.createdAt
        }))
      })
    }
  }))

  registerTool('task_stop', () => ({
    name: 'task_stop',
    description: TASK_STOP_DESCRIPTION,
    schema: z.object({ task_id: z.string().describe('要停止的 sub-agent 任务 id') }),
    run: async (input: { task_id: string }) => {
      const stopped = cancelSubagentTask(input.task_id)
      if (!stopped) {
        return JSON.stringify({ ok: false, error: '任务不存在' })
      }
      if (stopped.status !== 'cancelled') {
        return JSON.stringify({
          ok: true,
          task_id: stopped.id,
          status: stopped.status,
          hint: '任务已结束,无需停止'
        })
      }
      return JSON.stringify({
        ok: true,
        task_id: stopped.id,
        status: 'cancelled'
      })
    }
  }))
}

function taskToResult(t: NonNullable<ReturnType<typeof getSubagentTask>>): Record<string, unknown> {
  return {
    ok: t.status === 'completed',
    task_id: t.id,
    status: t.status,
    description: t.description,
    subagent_type: t.subagentType,
    output: t.output,
    error: t.error,
    token_used: t.tokenUsed,
    rounds: t.rounds,
    created_at: t.createdAt,
    started_at: t.startedAt,
    completed_at: t.completedAt
  }
}

async function runSubagentInBackground(taskId: string, deps: SubagentRunDeps): Promise<void> {
  try {
    await runSubagent(taskId, deps)
  } catch (err) {
    // 静默：失败已在 updateSubagentTask + emit 'failed' 处理
    console.error(`[shy:subagent] 后台 task ${taskId} 异常退出:`, err)
  }
}

// 引用 ToolContext 防止 import 误报
export type { ToolContext }
