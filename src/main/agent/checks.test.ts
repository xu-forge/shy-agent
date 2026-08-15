import { describe, expect, it, vi } from 'vitest'
import { EVIDENCE_MAX_CHARS, runCheckCommand } from './checks'

describe('runCheckCommand', () => {
  it('退出码非 0 为失败并截断 output', async () => {
    const long = 'x'.repeat(EVIDENCE_MAX_CHARS + 50)
    const { result } = await runCheckCommand({
      command: 'npm test',
      approved: new Set(),
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
      confirm,
      execImpl: async () => ({ stdout: 'ok', stderr: '', exitCode: 0 })
    })
    expect(confirm).not.toHaveBeenCalled()
  })

  it('超长 stdout 保留尾部特征后缀', async () => {
    const suffix = 'UNIQUE_TAIL_SENTINEL'
    const stdout = `${'H'.repeat(EVIDENCE_MAX_CHARS)}${suffix}`
    const { result } = await runCheckCommand({
      command: 'npm test',
      approved: new Set(['npm test']),
      confirm: async () => true,
      execImpl: async () => ({ stdout, stderr: '', exitCode: 1 })
    })
    expect(result.output.length).toBeLessThanOrEqual(EVIDENCE_MAX_CHARS)
    expect(result.output).toContain(suffix)
    expect(result.output.startsWith('…[truncated]…\n')).toBe(true)
  })

  it('将 Node exec 的终止信号错误识别为超时并截断输出', async () => {
    const stdout = 'x'.repeat(EVIDENCE_MAX_CHARS + 50)
    const { result } = await runCheckCommand({
      command: 'npm test',
      approved: new Set(['npm test']),
      confirm: async () => true,
      execImpl: async () => {
        throw {
          killed: true,
          signal: 'SIGTERM',
          code: null,
          stdout,
          stderr: 'timed out'
        }
      }
    })

    expect(result.timedOut).toBe(true)
    expect(result.exitCode).toBe(-2)
    expect(result.denied).toBe(false)
    expect(result.output.length).toBeLessThanOrEqual(EVIDENCE_MAX_CHARS)
    expect(result.output).toContain('timed out')
  })
})
