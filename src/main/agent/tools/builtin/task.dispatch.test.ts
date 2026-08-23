import { describe, it, expect, beforeEach, vi } from 'vitest'

// mock 依赖：settings / store / runner（dispatch_subagent 是薄封装，重点测并发与透传）
const settingsState = { apiKey: 'k' }
vi.mock('../../../settings/store', () => ({
  getSettings: async () => ({ baseURL: 'http://t', apiKey: settingsState.apiKey, model: 'm' })
}))
vi.mock('../../subagent/store', () => ({
  createSubagentTask: ({ prompt, subagentType }: { prompt: string; subagentType: string }) => ({
    id: `sub-${prompt.length}-${subagentType}`,
    prompt,
    subagentType,
    status: 'queued'
  }),
  listSubagentTasks: () => currentRunning,
  getSubagentTask: () => null,
  cancelSubagentTask: () => null
}))
vi.mock('../../subagent/runner', () => ({
  runSubagent: async (id: string, deps: { budget?: { tokenBudget: number } }) => {
    lastRun = { id, budget: deps.budget }
    return currentResult
  }
}))

import { registerTaskTools } from './task'
import { buildTools } from '../registry'

let lastRun: { id: string; budget?: { tokenBudget: number } } | null = null
let currentRunning: Array<{ status: string }> = []
let currentResult: {
  id: string
  status: string
  output: string
  error?: string
  tokenUsed: number
  rounds: number
}

beforeEach(() => {
  lastRun = null
  currentRunning = []
  settingsState.apiKey = 'k'
  currentResult = {
    id: 'sub-1',
    status: 'completed',
    output: '结'.repeat(18_000), // 验证截断到 16k
    tokenUsed: 1234,
    rounds: 3
  }
})

const ctx = {
  emit: () => undefined,
  confirmHighRisk: async () => true,
  sessionId: 'ses-ds',
  workspaceDir: '/tmp/shy-ws'
}

function tool() {
  registerTaskTools()
  return buildTools(ctx as never).find((t) => t.name === 'dispatch_subagent')!
}

describe('dispatch_subagent 工具', () => {
  it('成功路径：创建任务、透传预算、截断输出到 16k', async () => {
    const t = tool()
    const res = JSON.parse(await t.run({ type: 'explore', task: '调研 X', maxTokens: 5000 }))
    expect(res.ok).toBe(true)
    expect(res.type).toBe('explore')
    expect(res.tokenUsed).toBe(1234)
    expect(lastRun?.budget?.tokenBudget).toBe(5000)
    expect(res.output.length).toBeLessThanOrEqual(16_000)
  })

  it('并发上限 3：已有 3 个在跑时直接拒绝', async () => {
    currentRunning = [{ status: 'running' }, { status: 'running' }, { status: 'queued' }]
    const t = tool()
    const res = JSON.parse(await t.run({ type: 'worker', task: 'x' }))
    expect(res.ok).toBe(false)
    expect(res.error).toContain('上限')
    expect(lastRun).toBeNull()
  })

  it('子代理失败：透传 status 与 error', async () => {
    currentResult = {
      ...currentResult,
      status: 'failed',
      output: '',
      error: '达到 token 预算 100'
    }
    const t = tool()
    const res = JSON.parse(await t.run({ type: 'verifier', task: '审计' }))
    expect(res.ok).toBe(false)
    expect(res.status).toBe('failed')
    expect(res.error).toContain('预算')
  })

  it('未配置 apiKey 时直接报错且不创建任务', async () => {
    settingsState.apiKey = ''
    const t = tool()
    const res = JSON.parse(await t.run({ type: 'explore', task: 'x' }))
    expect(res.ok).toBe(false)
    expect(res.error).toContain('apiKey')
    expect(lastRun).toBeNull()
  })
})
