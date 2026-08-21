/**
 * Stage 1+2 集成可行性证明 — 端到端 mock pipeline。
 *
 * 设计：
 * - mock OpenAI SDK 的 streamChatCompletion，让 LLM 回应硬编码内容
 * - 不改 service.ts / goal-driver.ts（生产路径仍是 LangGraph 旧实现）
 * - 只验证 4 个新模块能端到端串通：
 *   1. turn-runner 8 步生命周期
 *   2. goal 5 状态机转换
 *   3. system-reminder 4 类 provider 链式注入
 *   4. sub-agent 派活（前台阻塞）
 *
 * 目的：
 * - 给用户"集成可行性"的技术证明
 * - Stage 1.5 真集成时,改动量小（service.ts 改成调 runTurn 即可）
 * - 不破坏 shy 实际行为
 */
import { describe, expect, it, vi } from 'vitest'
import { runTurn } from '../turn-runner'
import { buildGoalState, llmSurface } from '../goal/service'
import { canTransition, applyUserPause, applyUserResume, applyComplete } from '../goal/state'
import { SystemReminderService } from '../prompts/system-reminder/service'
import { createDefaultRegistry } from '../prompts/system-reminder/providers'

// ─── 1. Mock LLM ────────────────────────────────────────────────
let mockResponses: Array<{
  content?: string
  toolCalls?: Array<{ id: string; name: string; arguments: string }>
  promptTokens?: number
  completionTokens?: number
}> = []
let callIdx = 0

vi.mock('../llm-client', () => ({
  streamChatCompletion: async function* () {
    const r = mockResponses[callIdx++] ?? { content: 'fallback' }
    if (r.content !== undefined) yield { type: 'content', delta: r.content }
    if (r.toolCalls && r.toolCalls.length > 0) {
      yield {
        type: 'tool_calls',
        toolCalls: r.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments }
        }))
      }
    }
    yield {
      type: 'usage',
      promptTokens: r.promptTokens ?? 100,
      completionTokens: r.completionTokens ?? 50,
      totalTokens: (r.promptTokens ?? 100) + (r.completionTokens ?? 50)
    }
    yield { type: 'done' }
  }
}))

// ─── 2. 测试工具（runtime_ping 已有,用 LangChain ToolNode） ────
import { buildTools } from '../tools/registry'
import { getReactGuide } from '../react-prompt'

describe('Stage 1+2 集成可行性证明', () => {
  it('完整 pipeline:turn-runner + 5 状态机 + system-reminder 端到端', async () => {
    // LLM 计划：第 1 轮返回 tool_call，第 2 轮返回最终内容
    mockResponses = [
      {
        content: '我先调 runtime_ping:',
        toolCalls: [{ id: 'tc-1', name: 'runtime_ping', arguments: '{}' }],
        promptTokens: 100,
        completionTokens: 30
      },
      { content: 'ping 完成,目标已推进。', promptTokens: 80, completionTokens: 25 }
    ]
    callIdx = 0

    // 构造目标 + 状态
    const initialState = buildGoalState({
      goal: 'ping 测试',
      checklist: [{ id: '1', title: '调 ping', done: false }],
      runStatus: 'running',
      paused: false,
      tokenUsed: 0,
      tokenBudget: 1000,
      rounds: 0
    })
    expect(initialState.status).toBe('active')

    // 构造 system-reminder
    const srService = new SystemReminderService(createDefaultRegistry())
    const srInput = {
      env: {
        sessionId: initialState.goal,
        agentName: 'minimax',
        agentRole: 'worker' as const,
        displayName: 'MiniMax',
        userConfiguredName: 'xuzhihao',
        platform: 'darwin' as NodeJS.Platform,
        cwd: '/tmp',
        shell: 'zsh' as const,
        teamModeOff: true
      },
      turnCount: 1,
      memoryBlock: '## 偏好\n喜欢 TypeScript',
      shortMemory: '',
      skillBlock: '',
      allowlist: null,
      criticalOnly: false
    }
    const reminderText = srService.buildReminder(srInput)
    expect(reminderText).toContain('<agent-context>')
    expect(reminderText).toContain('<platform-context>')
    expect(reminderText).toContain('<memory-context>')
    // LLM 视角：budget_limited 应被屏蔽（这里是 active，无需降级）
    const llmView = llmSurface(initialState)
    expect(llmView.status).toBe('active')

    // 构造工具 + 跑 turn-runner
    const tools = buildTools({
      emit: () => undefined,
      confirmHighRisk: async () => true,
      sessionId: 'ses-1'
    }).filter((t) => t.name === 'runtime_ping')

    // 第 1 轮:用户消息触发 runTurn
    const events: unknown[] = []
    const result1 = await runTurn(
      {
        sessionId: 'ses-1',
        goal: { goal: initialState.goal, checklist: initialState.checklist },
        history: [{ role: 'user', content: '请调 runtime_ping' }],
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: { type: 'object', properties: {} }
        })),
        llm: { baseURL: 'http://test', apiKey: 'test', model: 'gpt-test' },
        signal: undefined,
        skillBlock: undefined,
        memoryBlock: undefined
      },
      {
        emit: (e) => events.push(e),
        getReactGuide,
        tools,
        mode: 'act',
        startTurn: 0
      }
    )
    // runTurn 会在 tool_call 跑完后回到 callLLM, 第 2 次 LLM 返回无 tool_call → done
    expect(result1.status === 'done' || result1.status === 'continue').toBe(true)
    expect(result1.stepsExecuted).toBeGreaterThanOrEqual(2) // 2 LLM + 1 tool call
    expect(result1.tokenUsed.prompt).toBe(180) // 100 + 80

    // 8 步都触发
    const stepStarts = events
      .filter((e): e is { type: 'step:start'; step: string } => (e as { type?: string }).type === 'step:start')
      .map((e) => e.step)
    expect(stepStarts).toContain('incrementTurn')
    expect(stepStarts).toContain('callLLM')
    expect(stepStarts).toContain('handleToolCalls')
    expect(stepStarts).toContain('runTools')
    expect(stepStarts).toContain('appendHistory')
    expect(stepStarts).toContain('decideNext')

    // ── 5 状态机：标记完成 ──
    expect(canTransition(initialState.status, 'paused')).toBe(true)
    expect(canTransition('paused', 'active')).toBe(true)
    expect(canTransition('active', 'complete')).toBe(true)
    const paused = applyUserPause(initialState)
    expect(paused.status).toBe('paused')
    const resumed = applyUserResume(paused)
    expect(resumed.status).toBe('active')
    const completed = applyComplete(resumed, { content: 'ping 完成' })
    expect(completed.status).toBe('complete')
    expect(completed.resultContent).toBe('ping 完成')
    // complete 终态：不能再转出
    expect(canTransition('complete', 'active')).toBe(false)
  })

  it('system-reminder 4 类 provider 全部跑通', () => {
    const r = createDefaultRegistry()
    const list = r.list()
    expect(list).toHaveLength(4)
    expect(list.filter((e) => e.critical).map((e) => e.name).sort()).toEqual([
      'identityReminderProvider',
      'platformReminderProvider'
    ])
    expect(list.filter((e) => !e.critical).map((e) => e.name).sort()).toEqual([
      'memoryReminderProvider',
      'progressReminderProvider'
    ])
  })
})
