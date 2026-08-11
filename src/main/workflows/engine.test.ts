import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

vi.mock('electron', () => ({
  app: { getPath: () => process.env.SHY_HOME ?? tmpdir() }
}))

vi.mock('../settings/store', () => ({
  getSettings: () =>
    Promise.resolve({
      baseURL: 'http://mock',
      apiKey: 'test-key',
      model: 'gpt-test',
      stagnationRounds: 20,
      tokenBudget: 0,
      segmentSteps: 60
    })
}))

vi.mock('@langchain/openai', () => {
  class MockChatOpenAI {
    async invoke(
      messages: { content: unknown }[]
    ): Promise<{ content: string; usage_metadata?: { total_tokens?: number } }> {
      const last = messages[messages.length - 1]
      const text = typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content)
      return {
        content: `MOCK_SUMMARY:${String(text).slice(0, 40)}`,
        usage_metadata: { total_tokens: 10 }
      }
    }
  }
  return { ChatOpenAI: MockChatOpenAI }
})

let tmpDir = ''

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'my-agent-wf-'))
  process.env.SHY_HOME = tmpDir
  vi.resetModules()
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

function baseWf(id: string): {
  id: string
  name: string
  description: string
  nodes: {
    id: string
    type: 'trigger' | 'summarize' | 'write_doc'
    label: string
    x: number
    y: number
    config: Record<string, unknown>
  }[]
  edges: { id: string; source: string; target: string }[]
  schedule: {
    enabled: boolean
    frequency: 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'hourly'
    time: string
    weekdays: number[]
    dayOfMonth: number
    minute: number
    cron: string
  }
  outputConfig: Record<string, unknown>
  createdAt: string
  updatedAt: string
} {
  return {
    id,
    name: '晨报',
    description: '',
    nodes: [
      { id: 't', type: 'trigger', label: '触发', x: 0, y: 0, config: {} },
      { id: 's', type: 'summarize', label: '总结', x: 200, y: 0, config: {} },
      {
        id: 'w',
        type: 'write_doc',
        label: '写文档',
        x: 400,
        y: 0,
        config: { filename: 'report.md', dir: join(tmpDir, 'reports') }
      }
    ],
    edges: [
      { id: 'e1', source: 't', target: 's' },
      { id: 'e2', source: 's', target: 'w' }
    ],
    schedule: {
      enabled: false,
      frequency: 'daily',
      time: '09:00',
      weekdays: [],
      dayOfMonth: 1,
      minute: 0,
      cron: ''
    },
    outputConfig: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

describe('runWorkflow', () => {
  it('执行 trigger -> summarize -> write_doc 流程并落盘文档', async () => {
    const engine = await import('./engine')
    const dbMod = await import('./db')
    dbMod.saveWorkflow(baseWf('wf1'))

    const events: unknown[] = []
    const run = await engine.runWorkflow('wf1', 'manual', (r) => events.push(r))

    expect(run.status).toBe('success')
    expect(run.trigger).toBe('manual')
    expect(run.logs.length).toBeGreaterThan(0)
    const doc = readFileSync(join(tmpDir, 'reports', 'report.md'), 'utf8')
    expect(doc).toContain('# 每日晨报')
    expect(doc).toContain('MOCK_SUMMARY')
    expect(events.length).toBeGreaterThan(0)
  })

  it('defaultWorkflow 生成完整晨报场景模板', async () => {
    const engine = await import('./engine')
    const wf = engine.defaultWorkflow('股票每日晨报')
    const types = wf.nodes.map((n) => n.type)
    expect(types).toEqual(['trigger', 'fetch', 'summarize', 'recommend', 'write_doc'])
    expect(wf.edges).toHaveLength(4)
    // 边串成一条链 trigger->fetch->summarize->recommend->write_doc
    const first = wf.edges[0]
    expect(first.source).toBe('trigger')
    expect(first.target).toBe('fetch')
    expect(wf.schedule.cron).toBe('0 9 * * *')
    // write_doc 有默认文件名
    const doc = wf.nodes.find((n) => n.type === 'write_doc')
    expect(doc?.config.filename).toBe('daily-morning-report.md')
  })

  it('模型凭证为空时，LLM 节点失败并写明与对话共用设置', async () => {
    const settingsMod = await import('../settings/store')
    settingsMod.getSettings = vi.fn().mockResolvedValue({
      baseURL: 'http://mock',
      apiKey: '',
      model: 'gpt-test',
      stagnationRounds: 20,
      tokenBudget: 0,
      segmentSteps: 60
    })
    const engine = await import('./engine')
    const dbMod = await import('./db')
    dbMod.saveWorkflow(baseWf('wf2'))
    const run = await engine.runWorkflow('wf2', 'manual', () => undefined)
    expect(run.status).toBe('failed')
    expect(run.error).toMatch(/设置/)
    expect(run.error).toMatch(/对话共用/)
  })
})
