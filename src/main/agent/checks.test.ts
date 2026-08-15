import { describe, expect, it, vi } from 'vitest'
import { EVIDENCE_MAX_CHARS, runCheckCommand } from './checks'

describe('runCheckCommand', () => {
  it('退出码非 0 为失败并截断 output', async () => {
    const long = 'x'.repeat(EVIDENCE_MAX_CHARS + 50)
    const { result } = await runCheckCommand({
      command: 'npm test',
      approved: new Set(),
      pinned: true,
      confirm: async () => true,
      execImpl: async () => ({ stdout: long, stderr: 'boom', exitCode: 1 })
    })
    expect(result.exitCode).toBe(1)
    expect(result.denied).toBe(false)
    expect(result.output.length).toBeLessThanOrEqual(EVIDENCE_MAX_CHARS)
    expect(result.output).toContain('boom')
  })

  it('用户拒绝确认为失败且不加入 approved', async () => {
    const { result, approved } = await runCheckCommand({
      command: 'rm -rf /',
      approved: new Set(),
      pinned: false,
      confirm: async () => false,
      execImpl: async () => {
        throw new Error('should not exec')
      }
    })
    expect(result.denied).toBe(true)
    expect(result.exitCode).not.toBe(0)
    expect(approved.has('rm -rf /')).toBe(false)
  })

  it('已批准的命令不再询问', async () => {
    const confirm = vi.fn(async () => true)
    await runCheckCommand({
      command: 'npm test',
      approved: new Set(['npm test']),
      pinned: false,
      confirm,
      execImpl: async () => ({ stdout: 'ok', stderr: '', exitCode: 0 })
    })
    expect(confirm).not.toHaveBeenCalled()
  })
})
