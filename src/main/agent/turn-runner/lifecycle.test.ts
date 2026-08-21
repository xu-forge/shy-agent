import { describe, expect, it } from 'vitest'
import {
  incrementTurn,
  collectInput,
  buildContext,
  handleToolCalls,
  appendHistory,
  decideNext,
  emitToolResult,
  newTurnId
} from './lifecycle'
import type { TurnStepEvent } from './types'

const silentEmit = (): void => undefined

describe('lifecycle/8 steps — 纯函数单测', () => {
  it('1. incrementTurn 自增 + emit step:start/step:end', () => {
    const events: TurnStepEvent[] = []
    const out = incrementTurn(3, (e) => events.push(e), 't-1')
    expect(out.turn).toBe(4)
    expect(events).toHaveLength(2)
    expect(events[0]?.type).toBe('step:start')
    expect(events[1]?.type).toBe('step:end')
    expect(events[1] && 'ok' in events[1] ? events[1].ok : null).toBe(true)
  })

  it('2. collectInput 三种 input 模式', () => {
    const user = collectInput({ userMessage: '你好' }, silentEmit, 't-1')
    expect(user).toEqual({ prompt: '你好', isResume: false })

    const resume = collectInput({ resumeHint: '继续上次的' }, silentEmit, 't-1')
    expect(resume).toEqual({ prompt: '继续上次的', isResume: true })

    const autoSeg = collectInput(
      { userMessage: 'XXX', autoSegmentContinue: true },
      silentEmit,
      't-1'
    )
    expect(autoSeg.prompt).toContain('继续推进')
    expect(autoSeg.prompt).not.toBe('XXX') // 续段信号优先
  })

  it('3. buildContext 拼接 4 段 system prompt', () => {
    const out = buildContext(
      {
        skillBlock: '【skill】',
        memoryBlock: '【memory】',
        reactGuide: '【react】',
        goalBlock: '【goal】'
      },
      silentEmit,
      't-1'
    )
    expect(out.systemPrompt).toContain('【goal】')
    expect(out.systemPrompt).toContain('【react】')
    expect(out.systemPrompt).toContain('【skill】')
    expect(out.systemPrompt).toContain('【memory】')
  })

  it('5. handleToolCalls 解析 tool_calls + emit turn:tool_call', () => {
    const events: TurnStepEvent[] = []
    const llmResponse = {
      content: '我先查一下',
      toolCalls: [
        { id: 'tc-1', name: 'shell_exec', args: '{"command":"ls"}' },
        { id: 'tc-2', name: 'fs_read', args: '{"path":"/etc/hosts"}' }
      ]
    }
    handleToolCalls(llmResponse, (e) => events.push(e), 't-1')
    const toolCalls = events.filter((e) => e.type === 'turn:tool_call')
    expect(toolCalls).toHaveLength(2)
    expect(toolCalls[0] && 'name' in toolCalls[0] ? toolCalls[0].name : null).toBe('shell_exec')
    expect(toolCalls[0] && 'input' in toolCalls[0] ? toolCalls[0].input : null).toEqual({ command: 'ls' })
  })

  it('6. emitToolResult 透出 tool_result', () => {
    const events: TurnStepEvent[] = []
    emitToolResult(
      { id: 'tc-1', output: 'result' },
      (e) => events.push(e),
      't-1'
    )
    expect(events[0]?.type).toBe('turn:tool_result')
    expect(events[0] && 'id' in events[0] ? events[0].id : null).toBe('tc-1')
  })

  it('7. appendHistory 追加不修改原数组', () => {
    const before = [{ role: 'user' as const, content: 'hi' }]
    const added = [{ role: 'assistant' as const, content: 'hello' }]
    const out = appendHistory(before, added, silentEmit, 't-1')
    expect(before).toHaveLength(1) // 原数组未变
    expect(out.history).toHaveLength(2)
  })

  it('8. decideNext — 有 tool_call → continue + runTools;无 → done', () => {
    const withCall = decideNext({ hasToolCalls: true }, silentEmit, 't-1')
    expect(withCall.status).toBe('continue')
    expect(withCall.nextStep).toBe('runTools')

    const noCall = decideNext({ hasToolCalls: false }, silentEmit, 't-1')
    expect(noCall.status).toBe('done')

    const autoSeg = decideNext(
      { hasToolCalls: false, autoSegmentContinue: true },
      silentEmit,
      't-1'
    )
    expect(autoSeg.status).toBe('continue')
    expect(autoSeg.nextStep).toBe('callLLM')
  })

  it('newTurnId 每次唯一', () => {
    const a = newTurnId()
    const b = newTurnId()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^turn_[0-9a-f]{8}$/)
  })
})
