import { describe, expect, it } from 'vitest'
import { formatAgentLogView } from './agent-log-view'

const html = `<!DOCTYPE html>\n<html>${'x'.repeat(4000)}</html>`

function line(kind: string, payload: Record<string, unknown>): string {
  return JSON.stringify({
    ts: '2026-08-27T03:49:24.188Z',
    runId: 'r1',
    sessionId: 's1',
    kind,
    payload
  })
}

describe('formatAgentLogView', () => {
  it('把 llm_turn 的可见正文单独标出，不被超长 fs_write 淹没', () => {
    const raw = [
      line('run_start', { mode: 'interactive' }),
      line('tool_call', { name: 'fs_write', input: { path: '攻略.html', content: html } }),
      line('llm_turn', {
        content: '<think>文件写好了，给个总结。</think>\n\n攻略已生成 → `佛山周末攻略.html`'
      }),
      line('run_end', { reason: 'completed' })
    ].join('\n')

    const out = formatAgentLogView(raw)

    expect(out).toContain('【正文】')
    expect(out).toContain('攻略已生成 → `佛山周末攻略.html`')
    expect(out).toContain('【思考】')
    expect(out).toContain('文件写好了')
    expect(out).toContain('fs_write')
    // 超长 HTML 只留摘要，不把整页塞进视图
    expect(out).not.toContain(html)
    expect(out.length).toBeLessThan(raw.length)
  })

  it('没有可见正文时明确写出，避免把思考当成回复', () => {
    const raw = line('llm_turn', { content: '<think>只想了没说。</think>' })
    const out = formatAgentLogView(raw)
    expect(out).toContain('【正文】（无）')
    expect(out).toContain('只想了没说')
  })
})
