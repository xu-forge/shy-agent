import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { AgentRunLogWriter, mapAgentEventToLog, truncateField } from './run-log'

describe('run-log', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })

  it('truncateField 截断长字符串', () => {
    const s = 'a'.repeat(20_000)
    const out = truncateField(s, 100) as string
    expect(out.length).toBeLessThan(200)
    expect(out).toContain('truncated')
  })

  it('写入 jsonl 含 llm_turn 与 tool_call', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'shy-logs-'))
    dirs.push(dir)
    const w = new AgentRunLogWriter('sess1', 'run1', dir)
    w.start({ mode: 'interactive' })
    mapAgentEventToLog(w, { type: 'assistant', content: 'hello' })
    mapAgentEventToLog(w, { type: 'tool', name: 'fs_read', detail: 'ok' })
    mapAgentEventToLog(w, { type: 'done', reason: 'completed' })
    await w.flush()
    const text = readFileSync(join(dir, 'run1.jsonl'), 'utf8')
    const kinds = text
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l).kind)
    expect(kinds).toEqual(['run_start', 'llm_turn', 'tool_call', 'run_end'])
  })
})
