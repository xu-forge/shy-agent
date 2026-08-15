import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GoalChecklistItem, RunStatus } from '../../shared/ipc'
import type { AgentEvent } from './service'
import type { CheckRunResult } from './checks'

vi.mock('electron', () => ({
  app: { getPath: () => process.env.SHY_HOME ?? tmpdir() }
}))

type PersistPatch = {
  goal?: string | null
  checklist?: GoalChecklistItem[]
  verifyCommand?: string | null
  runStatus?: RunStatus
  approvedChecks?: string[]
  paused?: boolean
}

type DriverMod = typeof import('./goal-driver')
type StoreMod = typeof import('../sessions/store')
type ServiceMod = typeof import('./service')

let tmpDir = ''
let driver: DriverMod
let store: StoreMod
let service: ServiceMod

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'shy-goal-driver-'))
  process.env.SHY_HOME = tmpDir
  vi.resetModules()
  store = await import('../sessions/store')
  driver = await import('./goal-driver')
  service = await import('./service')
})

afterEach(() => {
  delete process.env.SHY_HOME
  rmSync(tmpDir, { recursive: true, force: true })
})

function failResult(command: string, output = 'FAILTXT'): CheckRunResult {
  return { command, exitCode: 1, output, timedOut: false, denied: false }
}

function passResult(command: string): CheckRunResult {
  return { command, exitCode: 0, output: 'ok', timedOut: false, denied: false }
}

describe('runGoalDriver', () => {
  it('子项失败回灌：第二次 burst 含 evidence，且不勾完成', async () => {
    const session = store.createSession('goal', 't')
    const bursts: Array<{ goal: string; checklist: GoalChecklistItem[]; feedback?: string }> = []
    const events: AgentEvent[] = []
    const patches: PersistPatch[] = []

    await driver.runGoalDriver({
      sessionId: session.id,
      message: '做完 t',
      emit: (e) => events.push(e),
      waitConfirm: async () => true,
      persist: (patch) => patches.push(patch),
      planChecklist: async () => ({
        goal: 'g',
        checklist: [{ id: '1', title: 't', check: 'false', done: false }]
      }),
      runBurst: async (input) => {
        bursts.push(input)
        if (bursts.length >= 2) {
          service.cancelAgent(session.id)
          throw new Error('stop-test')
        }
        return { tokenUsed: 0, round: 1 }
      },
      runCheck: async ({ command }) => ({
        result: failResult(command, 'FAILTXT'),
        approved: new Set([command])
      })
    })

    expect(bursts.length).toBeGreaterThanOrEqual(2)
    expect(bursts[1].feedback).toContain('FAILTXT')
    expect(bursts[1].feedback).toContain('不要修改验收命令')
    expect(bursts[1].checklist[0].done).toBe(false)
    expect(patches.some((p) => p.checklist?.[0]?.done === true)).toBe(false)
    expect(patches.some((p) => p.checklist?.[0]?.evidence?.includes('FAILTXT'))).toBe(true)
    expect(patches.some((p) => p.checklist?.[0]?.lastExitCode === 1)).toBe(true)
  })

  it('总验收失败：子项 check 0、overall 1 → 不 completed', async () => {
    const session = store.createSession('goal', 't')
    const patches: PersistPatch[] = []
    const bursts: Array<{ feedback?: string }> = []

    await driver.runGoalDriver({
      sessionId: session.id,
      message: '做完 t',
      verifyCommand: 'overall',
      emit: () => undefined,
      waitConfirm: async () => true,
      persist: (patch) => patches.push(patch),
      planChecklist: async () => ({
        goal: 'g',
        checklist: [{ id: '1', title: 't', check: 'item', done: false }]
      }),
      runBurst: async (input) => {
        bursts.push(input)
        if (bursts.length >= 2) {
          service.cancelAgent(session.id)
          throw new Error('stop-test')
        }
        return { tokenUsed: 0, round: 1 }
      },
      runCheck: async ({ command }) => ({
        result: command === 'overall' ? failResult(command, 'OVERALL_FAIL') : passResult(command),
        approved: new Set([command])
      })
    })

    expect(patches.some((p) => p.runStatus === 'completed')).toBe(false)
    expect(bursts[1]?.feedback).toContain('OVERALL_FAIL')
    expect(bursts[1]?.feedback).toContain('总验收')
  })

  it('无检查拒绝开工：不调用 runBurst，并 emit error', async () => {
    const session = store.createSession('goal', 't')
    const events: AgentEvent[] = []
    const runBurst = vi.fn(async () => ({ tokenUsed: 0, round: 1 }))
    const patches: PersistPatch[] = []

    await driver.runGoalDriver({
      sessionId: session.id,
      message: '做完 t',
      emit: (e) => events.push(e),
      waitConfirm: async () => true,
      persist: (patch) => patches.push(patch),
      planChecklist: async () => ({
        goal: 'g',
        checklist: [{ id: '1', title: 't', done: false }]
      }),
      runBurst
    })

    expect(runBurst).not.toHaveBeenCalled()
    expect(events.some((e) => e.type === 'error')).toBe(true)
    expect(patches.some((p) => p.runStatus === 'idle')).toBe(true)
  })

  it('完成路径：check 0 且无 overall → persist completed', async () => {
    const session = store.createSession('goal', 't')
    const patches: PersistPatch[] = []

    await driver.runGoalDriver({
      sessionId: session.id,
      message: '做完 t',
      emit: () => undefined,
      waitConfirm: async () => true,
      persist: (patch) => patches.push(patch),
      planChecklist: async () => ({
        goal: 'g',
        checklist: [{ id: '1', title: 't', check: 'true', done: false }]
      }),
      runBurst: async () => ({ tokenUsed: 0, round: 1 }),
      runCheck: async ({ command }) => ({
        result: passResult(command),
        approved: new Set([command])
      })
    })

    expect(patches.at(-1)?.runStatus).toBe('completed')
  })

  it('检查期间暂停时持久化 paused，不写 completed', async () => {
    const session = store.createSession('goal', 't')
    const patches: PersistPatch[] = []

    await driver.runGoalDriver({
      sessionId: session.id,
      message: '做完 t',
      emit: () => undefined,
      waitConfirm: async () => true,
      persist: (patch) => patches.push(patch),
      planChecklist: async () => ({
        goal: 'g',
        checklist: [{ id: '1', title: 't', check: 'true', done: false }]
      }),
      runBurst: async () => ({ tokenUsed: 0, round: 1 }),
      runCheck: async ({ command }) => {
        service.pauseAgent(session.id)
        return {
          result: passResult(command),
          approved: new Set([command])
        }
      }
    })

    expect(patches.some((p) => p.runStatus === 'completed')).toBe(false)
    expect(patches.at(-1)?.runStatus).toBe('paused')
    expect(patches.at(-1)?.paused).toBe(true)
  })

  it('burst 抛错时恢复 idle 并发出 error', async () => {
    const session = store.createSession('goal', 't')
    const events: AgentEvent[] = []
    const patches: PersistPatch[] = []

    await driver.runGoalDriver({
      sessionId: session.id,
      message: '做完 t',
      emit: (event) => events.push(event),
      waitConfirm: async () => true,
      persist: (patch) => patches.push(patch),
      planChecklist: async () => ({
        goal: 'g',
        checklist: [{ id: '1', title: 't', check: 'true', done: false }]
      }),
      runBurst: async () => {
        throw new Error('burst failed')
      }
    })

    expect(patches.at(-1)?.runStatus).toBe('idle')
    expect(events).toContainEqual({ type: 'error', message: 'burst failed' })
    expect(events).toContainEqual({ type: 'done', reason: 'error' })
  })

  it('resume 且已有清单时先跑一轮验收再 burst', async () => {
    const session = store.createSession('goal', 't')
    store.updateSessionRuntime(session.id, {
      goal: 'g',
      checklist: [{ id: '1', title: 't', check: 'true', done: false }]
    })
    const order: string[] = []
    let checks = 0

    await driver.runGoalDriver({
      sessionId: session.id,
      message: '继续',
      resume: true,
      emit: () => undefined,
      waitConfirm: async () => true,
      persist: () => undefined,
      runBurst: async () => {
        order.push('burst')
        return { tokenUsed: 0, round: 1 }
      },
      runCheck: async ({ command }) => {
        order.push('check')
        checks += 1
        return {
          result: checks === 1 ? failResult(command, 'not yet') : passResult(command),
          approved: new Set([command])
        }
      }
    })

    expect(order[0]).toBe('check')
    expect(order).toContain('burst')
  })

  it('已有 verifyCommand 不被后续请求覆盖', async () => {
    const session = store.createSession('goal', 't')
    store.updateSessionRuntime(session.id, { verifyCommand: 'pinned' })
    const patches: PersistPatch[] = []

    await driver.runGoalDriver({
      sessionId: session.id,
      message: '做完 t',
      verifyCommand: 'hijack',
      emit: () => undefined,
      waitConfirm: async () => true,
      persist: (patch) => patches.push(patch),
      planChecklist: async () => ({
        goal: 'g',
        checklist: [{ id: '1', title: 't', check: 'true', done: false }]
      }),
      runBurst: async () => ({ tokenUsed: 0, round: 1 }),
      runCheck: async ({ command }) => ({
        result: passResult(command),
        approved: new Set([command])
      })
    })

    expect(patches.some((p) => p.verifyCommand === 'hijack')).toBe(false)
  })

  it('仅总验收也可完成：空清单且 overall 退出 0', async () => {
    const session = store.createSession('goal', 't')
    const patches: PersistPatch[] = []

    await driver.runGoalDriver({
      sessionId: session.id,
      message: '做完 t',
      verifyCommand: 'overall',
      emit: () => undefined,
      waitConfirm: async () => true,
      persist: (patch) => patches.push(patch),
      planChecklist: async () => ({ goal: 'g', checklist: [] }),
      runBurst: async () => ({ tokenUsed: 0, round: 1 }),
      runCheck: async ({ command }) => ({
        result: passResult(command),
        approved: new Set([command])
      })
    })

    expect(patches.at(-1)?.runStatus).toBe('completed')
  })

  it('工作段有活动但验收无进展时按停滞上限暂停', async () => {
    mkdirSync(join(tmpDir, 'config'), { recursive: true })
    writeFileSync(join(tmpDir, 'config', 'settings.json'), JSON.stringify({ stagnationRounds: 1 }))
    const session = store.createSession('goal', 't')
    const patches: PersistPatch[] = []

    await driver.runGoalDriver({
      sessionId: session.id,
      message: '做完 t',
      emit: () => undefined,
      waitConfirm: async () => true,
      persist: (patch) => patches.push(patch),
      planChecklist: async () => ({
        goal: 'g',
        checklist: [{ id: '1', title: 't', check: 'false', done: false }]
      }),
      runBurst: async () => ({ tokenUsed: 0, round: 1 }),
      runCheck: async ({ command }) => ({
        result: failResult(command, 'still failing'),
        approved: new Set([command])
      })
    })

    expect(patches.some((p) => p.runStatus === 'completed')).toBe(false)
    expect(patches.at(-1)?.runStatus).toBe('paused')
  })

  it('首次带 verifyCommand 时在任何 burst 前确认一次', async () => {
    const session = store.createSession('goal', 't')
    const order: string[] = []
    const waitConfirm = vi.fn(async () => {
      order.push('confirm')
      return true
    })
    const runBurst = vi.fn(async () => {
      order.push('burst')
      return { tokenUsed: 0, round: 1 }
    })

    await driver.runGoalDriver({
      sessionId: session.id,
      message: '做完 t',
      verifyCommand: 'overall',
      emit: () => undefined,
      waitConfirm,
      persist: () => undefined,
      planChecklist: async () => ({
        goal: 'g',
        checklist: [{ id: '1', title: 't', check: 'item', done: false }]
      }),
      runBurst,
      runCheck: async ({ command }) => ({
        result: passResult(command),
        approved: new Set([command])
      })
    })

    expect(order[0]).toBe('confirm')
    expect(order).toContain('burst')
    expect(waitConfirm).toHaveBeenCalledWith('执行验收命令', 'overall')
    expect(waitConfirm.mock.invocationCallOrder[0]).toBeLessThan(runBurst.mock.invocationCallOrder[0])
  })

  it('拒绝钉死的 verifyCommand 则 idle 且不 burst', async () => {
    const session = store.createSession('goal', 't')
    const events: AgentEvent[] = []
    const patches: PersistPatch[] = []
    const runBurst = vi.fn(async () => ({ tokenUsed: 0, round: 1 }))

    await driver.runGoalDriver({
      sessionId: session.id,
      message: '做完 t',
      verifyCommand: 'overall',
      emit: (e) => events.push(e),
      waitConfirm: async () => false,
      persist: (patch) => patches.push(patch),
      planChecklist: async () => ({
        goal: 'g',
        checklist: [{ id: '1', title: 't', check: 'item', done: false }]
      }),
      runBurst,
      runCheck: async () => {
        throw new Error('should not check')
      }
    })

    expect(runBurst).not.toHaveBeenCalled()
    expect(patches.some((p) => p.runStatus === 'running')).toBe(false)
    expect(patches.at(-1)?.runStatus).toBe('idle')
    expect(events.some((e) => e.type === 'error')).toBe(true)
  })

  it('approvedChecks 已含 verifyCommand 时启动不再确认', async () => {
    const session = store.createSession('goal', 't')
    store.updateSessionRuntime(session.id, {
      goal: 'g',
      checklist: [{ id: '1', title: 't', check: 'item', done: false }],
      verifyCommand: 'overall',
      approvedChecks: ['overall']
    })
    const waitConfirm = vi.fn(async () => true)

    await driver.runGoalDriver({
      sessionId: session.id,
      message: '做完 t',
      emit: () => undefined,
      waitConfirm,
      persist: () => undefined,
      runBurst: async () => ({ tokenUsed: 0, round: 1 }),
      runCheck: async ({ command }) => ({
        result: passResult(command),
        approved: new Set([command])
      })
    })

    expect(waitConfirm).not.toHaveBeenCalled()
  })

  it('验收后 emit goal 事件反映检查结果', async () => {
    const session = store.createSession('goal', 't')
    const events: AgentEvent[] = []
    let bursts = 0

    await driver.runGoalDriver({
      sessionId: session.id,
      message: '做完 t',
      emit: (e) => events.push(e),
      waitConfirm: async () => true,
      persist: () => undefined,
      planChecklist: async () => ({
        goal: 'g',
        checklist: [{ id: '1', title: 't', check: 'false', done: false }]
      }),
      runBurst: async () => {
        bursts += 1
        if (bursts >= 2) {
          service.cancelAgent(session.id)
          throw new Error('stop-test')
        }
        return { tokenUsed: 0, round: 1 }
      },
      runCheck: async ({ command }) => ({
        result: failResult(command, 'FAILTXT'),
        approved: new Set([command])
      })
    })

    const afterCheck = events.find(
      (e) =>
        e.type === 'goal' &&
        e.checklist?.some((item) => item.done === false && item.evidence?.includes('FAILTXT'))
    )
    expect(afterCheck).toBeTruthy()
  })

  it('burst 内 pause 后 resume 走 waiter，不二次规划', async () => {
    const session = store.createSession('goal', 't')
    const planChecklist = vi.fn(async () => ({
      goal: 'g',
      checklist: [{ id: '1', title: 't', check: 'true', done: false }]
    }))
    let notifyParked!: () => void
    const parked = new Promise<void>((resolve) => {
      notifyParked = resolve
    })
    const owner: { rt?: ReturnType<typeof service.getAgentRuntime> } = {}

    const running = driver.runGoalDriver({
      sessionId: session.id,
      message: '做完 t',
      emit: () => undefined,
      waitConfirm: async () => true,
      persist: () => undefined,
      planChecklist,
      runBurst: async () => {
        owner.rt = service.getAgentRuntime(session.id)
        service.pauseAgent(session.id)
        const waiting = service.waitIfPaused(session.id, () => undefined)
        notifyParked()
        await waiting
        expect(service.getAgentRuntime(session.id)).toBe(owner.rt)
        return { tokenUsed: 0, round: 1 }
      },
      runCheck: async ({ command }) => ({
        result: passResult(command),
        approved: new Set([command])
      })
    })

    await parked
    expect(owner.rt?.paused).toBe(true)
    expect(owner.rt?.pauseWaiters.length).toBeGreaterThan(0)

    service.resumeAgent(session.id, () => undefined, async () => true)
    await running

    expect(owner.rt?.paused).toBe(false)
    expect(owner.rt?.pauseWaiters.length).toBe(0)
    expect(planChecklist).toHaveBeenCalledOnce()
    expect(service.getAgentRuntime(session.id)).toBe(owner.rt)
  })
})

describe('parsePlanOutput', () => {
  it('忽略模型给出的 verifyCommand，且不把声称完成写成 done', () => {
    const planned = driver.parsePlanOutput(
      JSON.stringify({
        goal: 'g',
        verifyCommand: 'hijack',
        checklist: [{ id: '1', title: 't', done: true, check: 'true' }]
      }),
      'fallback'
    )

    expect(planned).not.toHaveProperty('verifyCommand')
    expect(planned.goal).toBe('g')
    expect(planned.checklist[0]?.done).toBe(false)
    expect(planned.checklist[0]?.check).toBe('true')
  })
})
