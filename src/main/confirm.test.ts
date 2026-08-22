import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '../shared/ipc'

const { getSettingsMock, emitSyncMock, ipcMainHandleMock } = vi.hoisted(() => ({
  getSettingsMock: vi.fn(),
  emitSyncMock: vi.fn(),
  ipcMainHandleMock: vi.fn()
}))

vi.mock('electron', () => ({
  BrowserWindow: class {},
  ipcMain: { handle: ipcMainHandleMock }
}))

vi.mock('./settings/store', () => ({ getSettings: getSettingsMock }))

vi.mock('./event-bridge', () => ({
  getDefaultBus: () => ({ emitSync: emitSyncMock })
}))

// 需在 vi.mock 之后再引用被模块
import { createConfirmWaiter, registerConfirmIpc } from './confirm'

describe('confirm waiter', () => {
  beforeEach(() => {
    getSettingsMock.mockReset()
    emitSyncMock.mockReset()
    ipcMainHandleMock.mockReset()
  })

  it('auto-approves when autoApproveTools=true (仍会放行,不弹确认)', async () => {
    getSettingsMock.mockResolvedValue({ autoApproveTools: true })
    const wait = createConfirmWaiter(() => null)
    await expect(wait('delete', 'del /tmp')).resolves.toBe(true)
    expect(emitSyncMock).not.toHaveBeenCalled()
  })

  it('emits confirm when autoApproveTools=false 并等待 toolConfirm 决议', async () => {
    getSettingsMock.mockResolvedValue({ autoApproveTools: false })
    registerConfirmIpc()

    // 取出 ipcMain.handle(IPC.toolConfirm, ...) 注册的 handler
    const toolConfirmCall = ipcMainHandleMock.mock.calls.find(([ch]) => ch === IPC.toolConfirm) as
      [string, (...a: unknown[]) => unknown] | undefined
    expect(toolConfirmCall).toBeDefined()

    const wait = createConfirmWaiter(() => null)
    const promise = wait('write', 'write src/x.ts')

    // 等 emitSync 收到 confirm_required,取 requestId
    await vi.waitFor(() => expect(emitSyncMock).toHaveBeenCalled())
    const payload = emitSyncMock.mock.calls[0][0] as {
      type: string
      action: string
      requestId: string
    }
    expect(payload.type).toBe('confirm_required')
    expect(payload.action).toBe('write')

    // 模拟 renderer 同意
    await (toolConfirmCall![1] as (...a: unknown[]) => Promise<unknown>)(
      null,
      payload.requestId,
      true
    )
    await expect(promise).resolves.toBe(true)
  })

  it('autoApproveTools 缺失时回退到逐条确认', async () => {
    getSettingsMock.mockResolvedValue({})
    registerConfirmIpc()
    const wait = createConfirmWaiter(() => null)
    const promise = wait('del', 'x')
    await vi.waitFor(() => expect(emitSyncMock).toHaveBeenCalled())
    // 不决议则命中 120s 超时,这里用短超时不可行;改为验证已弹确认
    expect(emitSyncMock).toHaveBeenCalled()
    // 立即决议,避免挂起
    const payload = emitSyncMock.mock.calls[0][0] as { requestId: string }
    const toolConfirmCall = ipcMainHandleMock.mock.calls.find(([ch]) => ch === IPC.toolConfirm) as [
      string,
      (...a: unknown[]) => unknown
    ]
    await (toolConfirmCall[1] as (...a: unknown[]) => Promise<unknown>)(
      null,
      payload.requestId,
      false
    )
    await expect(promise).resolves.toBe(false)
  })
})
