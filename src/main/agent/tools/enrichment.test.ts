import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { registerBuiltinTools } from './builtin'
import { registerEnrichmentTools } from './enrichment'
import { buildTools, registeredToolNames } from './registry'
import { SUBAGENT_TOOL_ALLOWLIST } from '../subagent/types'
import { McpManager, setMcpManagerForTests } from '../../mcp/manager'

vi.mock('../../memory/db', () => ({
  recordFileOp: () => undefined,
  upsertLongMemory: () => undefined,
  deleteLongMemory: () => undefined,
  listLongMemory: () => []
}))

vi.mock('../../diff/capture', () => ({
  captureWriteDiff: async () => undefined,
  captureDeleteDiff: async () => undefined
}))

vi.mock('../../paths', () => ({
  getShyPaths: () => ({
    artifactsDir: '/tmp/shy-artifacts-test'
  })
}))

let ws: string

beforeEach(async () => {
  ws = await mkdtemp(join(tmpdir(), 'shy-enr-'))
  registerBuiltinTools()
  registerEnrichmentTools()
})

afterAll(async () => {
  await rm(ws, { recursive: true, force: true })
})

function tools(askUser?: (q: string, options?: string[]) => Promise<string>) {
  return buildTools({
    emit: () => undefined,
    confirmHighRisk: async () => true,
    askUser,
    sessionId: 'ses-enr',
    workspaceDir: ws
  })
}

describe('grep / glob / fs_edit / present_artifact', () => {
  it('grep 命中与无匹配', async () => {
    await mkdir(join(ws, 'src'), { recursive: true })
    await writeFile(join(ws, 'src', 'a.ts'), 'const foo = 1\nconst bar = 2\n', 'utf8')
    const grep = tools().find((t) => t.name === 'grep')!
    const hit = JSON.parse(await grep.run({ pattern: 'foo' }))
    expect(hit.matches.length).toBeGreaterThan(0)
    expect(hit.matches[0].text).toContain('foo')
    const miss = JSON.parse(await grep.run({ pattern: 'zzz_no_such' }))
    expect(miss.matches).toEqual([])
  })

  it('glob 命中 ts 文件', async () => {
    await mkdir(join(ws, 'src'), { recursive: true })
    await writeFile(join(ws, 'src', 'a.ts'), 'x', 'utf8')
    const glob = tools().find((t) => t.name === 'glob')!
    const res = JSON.parse(await glob.run({ pattern: '**/*.ts' }))
    expect(res.paths.some((p: string) => p.endsWith('a.ts'))).toBe(true)
  })

  it('fs_edit 唯一替换成功，多次匹配拒绝', async () => {
    await writeFile(join(ws, 'f.ts'), 'aaa\nbbb\naaa\n', 'utf8')
    const edit = tools().find((t) => t.name === 'fs_edit')!
    const multi = JSON.parse(await edit.run({ path: 'f.ts', old_string: 'aaa', new_string: 'zzz' }))
    expect(multi.ok).toBe(false)
    expect(multi.error).toMatch(/多次/)
    const once = JSON.parse(await edit.run({ path: 'f.ts', old_string: 'bbb', new_string: 'ccc' }))
    expect(once.ok).toBe(true)
  })

  it('present_artifact 拒绝越权路径', async () => {
    const present = tools().find((t) => t.name === 'present_artifact')!
    const res = JSON.parse(await present.run({ paths: ['/etc/passwd'] }))
    expect(res.error).toMatch(/越权/)
  })
})

describe('ask_user', () => {
  it('回传选中选项', async () => {
    const ask = tools(async (_q, options) => options?.[1] ?? '')
    const tool = ask.find((t) => t.name === 'ask_user')!
    const res = JSON.parse(
      await tool.run({ question: '预算？', options: ['省钱', '舒适'] })
    )
    expect(res.ok).toBe(true)
    expect(res.answer).toBe('舒适')
  })

  it('未接线时不阻塞，返回 error', async () => {
    const tool = tools().find((t) => t.name === 'ask_user')!
    const res = JSON.parse(await tool.run({ question: '？' }))
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/未接线/)
  })
})

describe('subagent allowlist 无 ghost 工具', () => {
  it('allowlist 中每个名字都已 registerTool（web_search 可由 MCP 动态提供）', () => {
    const names = new Set(registeredToolNames())
    const optionalDynamic = new Set(['web_search'])
    const missing: string[] = []
    for (const set of Object.values(SUBAGENT_TOOL_ALLOWLIST)) {
      for (const n of set) {
        if (!names.has(n) && !optionalDynamic.has(n)) missing.push(n)
      }
    }
    expect(missing).toEqual([])
  })
})

describe('web_search / web_fetch', () => {
  afterEach(() => {
    setMcpManagerForTests(null)
  })

  it('无 MCP 时无内置 web_search，仍有 web_fetch', () => {
    const names = tools().map((t) => t.name)
    expect(names).not.toContain('web_search')
    expect(names).toContain('web_fetch')
  })

  it('mock MCP 导出 web_search 时 buildTools 含该名且走 callTool', async () => {
    const mgr = new McpManager({
      connector: async () => ({
        listTools: async () => [{ name: 'web_search', description: 'search' }],
        callTool: async () => JSON.stringify({ results: [{ title: 'hit', url: 'https://x.test' }] }),
        close: async () => undefined
      })
    })
    setMcpManagerForTests(mgr)
    await mgr.connectAll({
      mcpServers: {
        MiniMax: { command: 'uvx', args: ['-y'], env: {}, enabled: true }
      }
    })
    const search = tools().find((t) => t.name === 'web_search')
    expect(search).toBeTruthy()
    const out = JSON.parse(await search!.run({ query: '广州周末' })) as {
      results: Array<{ title: string }>
    }
    expect(out.results[0]?.title).toBe('hit')
    await mgr.shutdown()
  })
})
