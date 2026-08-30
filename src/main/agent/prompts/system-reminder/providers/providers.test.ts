import { describe, expect, it, beforeEach } from 'vitest'
import { identityReminderProvider } from './identity'
import { platformReminderProvider } from './platform'
import { progressReminderProvider } from './progress'
import { memoryReminderProvider, _resetMemoryCooldownForTests } from './memory'
import { activeFileReminderProvider } from './active-file'
import type { ReminderInput } from '../types'

function baseInput(overrides: Partial<ReminderInput> = {}): ReminderInput {
  return {
    env: {
      sessionId: 'ses-1',
      agentName: 'minimax',
      agentRole: 'worker',
      displayName: 'MiniMax',
      userConfiguredName: 'xuzhihao',
      platform: 'darwin',
      cwd: '/Users/xuzhihao/Projects/my-agent',
      shell: 'zsh',
      teamModeOff: true
    },
    turnCount: 1,
    memoryBlock: '[]',
    shortMemory: '',
    skillBlock: '',
    allowlist: null,
    criticalOnly: false,
    ...overrides
  }
}

describe('identityReminderProvider', () => {
  it('turn 1 输出 full block（含 displayName / user / agentName / role / session）', () => {
    const out = identityReminderProvider(baseInput({ turnCount: 1 }))
    expect(out).toContain('<agent-context>')
    expect(out).toContain('MiniMax')
    expect(out).toContain('xuzhihao')
    expect(out).toContain('agentName: minimax')
    expect(out).toContain('agentRole: worker')
    expect(out).toContain('ses-1')
    expect(out).toContain('</agent-context>')
  })

  it('turn 2+ 输出 slim block', () => {
    const out = identityReminderProvider(baseInput({ turnCount: 3 }))
    expect(out).toContain('<agent-context>')
    expect(out).toContain('继续推进')
    expect(out).not.toContain('agentName:')
    expect(out).not.toContain('agentRole:')
  })
})

describe('platformReminderProvider', () => {
  it('macOS 输出 zsh + / 路径提示', () => {
    const out = platformReminderProvider(baseInput({ env: { ...baseInput().env, platform: 'darwin', shell: 'zsh' } }))
    expect(out).toContain('macOS')
    expect(out).toContain('zsh')
    expect(out).toContain('chmod')
  })

  it('Windows 输出 PowerShell + \\ 路径提示', () => {
    const out = platformReminderProvider(
      baseInput({
        env: { ...baseInput().env, platform: 'win32', shell: 'powershell' }
      })
    )
    expect(out).toContain('Windows')
    expect(out).toContain('PowerShell')
    expect(out).toContain('C:\\')
  })

  it('Linux 输出 apt/yum', () => {
    const out = platformReminderProvider(baseInput({ env: { ...baseInput().env, platform: 'linux', shell: 'bash' } }))
    expect(out).toContain('Linux')
    expect(out).toContain('apt')
  })
})

describe('progressReminderProvider', () => {
  it('无 goal → undefined', () => {
    expect(progressReminderProvider(baseInput())).toBeUndefined()
  })

  it('空 checklist → undefined', () => {
    expect(
      progressReminderProvider(
        baseInput({
          goal: { goal: 'X', checklist: [], progress: { done: 0, total: 0, pct: 0 }, budget: { tokenUsed: 0, tokenBudget: 0, pct: 0, disabled: true }, stagnantRounds: 0, blockedRounds: 0 }
        })
      )
    ).toBeUndefined()
  })

  it('goal + checklist 输出进度 + pending', () => {
    const out = progressReminderProvider(
      baseInput({
        goal: {
          goal: '调研 A 股',
          checklist: [
            { id: '1', title: '收盘', done: true },
            { id: '2', title: '新闻', done: false },
            { id: '3', title: '推荐', done: false }
          ],
          progress: { done: 1, total: 3, pct: 33 },
          budget: { tokenUsed: 100, tokenBudget: 1000, pct: 10, disabled: false },
          stagnantRounds: 0,
          blockedRounds: 0
        }
      })
    )
    expect(out).toContain('<goal-progress>')
    expect(out).toContain('调研 A 股')
    expect(out).toContain('1/3 (33%)')
    expect(out).toContain('新闻 / 推荐') // pending 2 项
    expect(out).toContain('token: 100/1000 (10%)')
    expect(out).toContain('</goal-progress>')
  })

  it('pending > 3 不展开（避免 context 爆炸）', () => {
    const out = progressReminderProvider(
      baseInput({
        goal: {
          goal: 'X',
          checklist: [
            { id: '1', title: 'A', done: true },
            { id: '2', title: 'B', done: false },
            { id: '3', title: 'C', done: false },
            { id: '4', title: 'D', done: false },
            { id: '5', title: 'E', done: false }
          ],
          progress: { done: 1, total: 5, pct: 20 },
          budget: { tokenUsed: 0, tokenBudget: 0, pct: 0, disabled: true },
          stagnantRounds: 0,
          blockedRounds: 0
        }
      })
    )
    expect(out).not.toContain('pending:')
  })
})

describe('memoryReminderProvider', () => {
  beforeEach(() => _resetMemoryCooldownForTests())

  it('首次调用输出 long_memory', () => {
    const out = memoryReminderProvider(
      baseInput({ memoryBlock: '## user 偏好\n喜欢 TypeScript', shortMemory: '' })
    )
    expect(out).toContain('<memory-context>')
    expect(out).toContain('long_memory:')
    expect(out).toContain('喜欢 TypeScript')
  })

  it('cooldown 命中时只显示 short_memory + "略"', () => {
    // 第一次：注入
    memoryReminderProvider(baseInput({ memoryBlock: 'A', shortMemory: 'B' }))
    // 第二次（6h 内）：只 short
    const out = memoryReminderProvider(baseInput({ memoryBlock: 'A', shortMemory: 'recent context' }))
    expect(out).toContain('recent context')
    expect(out).toContain('略')
  })

  it('memory 与 shortMemory 都空 → undefined', () => {
    expect(memoryReminderProvider(baseInput({ memoryBlock: '', shortMemory: '' }))).toBeUndefined()
  })
})

describe('activeFileReminderProvider', () => {
  it('有 env.activeView 时输出路径，并提示用户正在查看该文件、须自行 fs_read', () => {
    const out = activeFileReminderProvider(
      baseInput({
        env: { ...baseInput().env, activeView: { kind: 'code', relativePath: 'src/a.ts' } }
      })
    )
    expect(out).toContain('<active-file>')
    expect(out).toContain('kind: code')
    expect(out).toContain('src/a.ts')
    expect(out).toMatch(/用户正在查看/)
    expect(out).toContain('fs_read')
    expect(out).toMatch(/对话历史/)
    expect(out).toMatch(/禁止因为/)
    expect(out).toContain('ignore-only-if')
    expect(out).not.toContain('<excerpt')
    expect(out).toContain('</active-file>')
  })

  it('无 activeView 字段 → undefined', () => {
    expect(activeFileReminderProvider(baseInput())).toBeUndefined()
  })

  it('空 relativePath → undefined', () => {
    expect(
      activeFileReminderProvider(
        baseInput({
          env: { ...baseInput().env, activeView: { kind: 'code', relativePath: '' } }
        })
      )
    ).toBeUndefined()
  })
})
