import { describe, expect, it } from 'vitest'
import { SystemReminderService } from './service'
import { SystemReminderRegistry } from './registry'
import { createDefaultRegistry } from './providers'
import type { ReminderInput } from './types'

function baseInput(overrides: Partial<ReminderInput> = {}): ReminderInput {
  return {
    env: {
      sessionId: 'ses-1',
      agentName: 'minimax',
      agentRole: 'worker',
      displayName: 'MiniMax',
      userConfiguredName: 'xuzhihao',
      platform: 'darwin',
      cwd: '/tmp',
      shell: 'zsh',
      teamModeOff: true
    },
    turnCount: 1,
    memoryBlock: '## 偏好\n喜欢 TypeScript',
    shortMemory: '',
    skillBlock: '',
    allowlist: null,
    criticalOnly: false,
    ...overrides
  }
}

describe('SystemReminderService', () => {
  it('buildReminder 拼出 <system-reminder>...</system-reminder>', () => {
    const svc = new SystemReminderService(createDefaultRegistry())
    const out = svc.buildReminder(baseInput())
    expect(out).toContain('<system-reminder>')
    expect(out).toContain('</system-reminder>')
    expect(out).toContain('<agent-context>')
    expect(out).toContain('<platform-context>')
    expect(out).toContain('<memory-context>')
  })

  it('criticalOnly=true 时只跑 critical provider（identity + platform）', () => {
    const svc = new SystemReminderService(createDefaultRegistry())
    const out = svc.buildReminder(
      baseInput({
        criticalOnly: true,
        env: { ...baseInput().env, activeView: { kind: 'code', relativePath: 'src/a.ts' } }
      })
    )
    expect(out).toContain('<agent-context>')
    expect(out).toContain('<platform-context>')
    // 进度 + 记忆 + 当前查看文件 是 non-critical,criticalOnly 时不跑
    expect(out).not.toContain('<goal-progress>')
    expect(out).not.toContain('<memory-context>')
    expect(out).not.toContain('<active-file>')
  })

  it('有 activeView 且非 criticalOnly 时注入 <active-file>', () => {
    const svc = new SystemReminderService(createDefaultRegistry())
    const out = svc.buildReminder(
      baseInput({
        env: { ...baseInput().env, activeView: { kind: 'material', relativePath: 'notes/a.md' } }
      })
    )
    expect(out).toContain('<active-file>')
    expect(out).toContain('notes/a.md')
    expect(out).toContain('material')
  })

  it('allowlist 只放 identity 时,其他 provider 全被过滤', () => {
    const svc = new SystemReminderService(createDefaultRegistry())
    const out = svc.buildReminder(
      baseInput({
        allowlist: new Set(['identityReminder'])
      })
    )
    expect(out).toContain('<agent-context>')
    expect(out).not.toContain('<platform-context>')
    expect(out).not.toContain('<goal-progress>')
  })

  it('registry.resolve 顺序：critical 在前', () => {
    const r = new SystemReminderRegistry()
    r.append('zOptional', () => 'opt')
    r.appendCritical('aCritical', () => 'crit')
    r.append('yOptional', () => 'opt2')
    const out = r.resolve(null, false)
    expect(out[0]?.name).toBe('aCritical')
  })

  it('provider 抛错不影响其他(fail-open)', () => {
    const r = new SystemReminderRegistry()
    r.appendCritical('throws', () => {
      throw new Error('boom')
    })
    r.appendCritical('works', () => 'ok-block')
    const svc = new SystemReminderService(r)
    const out = svc.buildReminder(baseInput())
    expect(out).toContain('ok-block')
    expect(out).not.toContain('boom')
  })

  it('空 registry 返回 null（caller 不注入 block）', () => {
    const svc = new SystemReminderService(new SystemReminderRegistry())
    expect(svc.buildReminder(baseInput())).toBeNull()
  })

  it('stripProviderSuffix：注册名带 Provider 后缀,allowlist 短名也能匹配', () => {
    const r = new SystemReminderRegistry()
    r.append('identityReminderProvider', () => 'identity-block')
    const out = r.resolve(new Set(['identityReminder']), false)
    expect(out).toHaveLength(1) // 短名匹配
  })
})
