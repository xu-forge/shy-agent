import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '../shared/ipc'

const { emitSyncMock, ipcMainHandleMock } = vi.hoisted(() => ({
  emitSyncMock: vi.fn(),
  ipcMainHandleMock: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: { handle: ipcMainHandleMock }
}))

vi.mock('./event-bridge', () => ({
  getDefaultBus: () => ({ emitSync: emitSyncMock })
}))

import { registerAskUserIpc, rejectPendingAsks, waitAskUser } from './ask-user'

describe('ask_user waiter', () => {
  beforeEach(() => {
    emitSyncMock.mockReset()
    ipcMainHandleMock.mockReset()
    rejectPendingAsks()
  })

  it('emit ask_user 并在 reply 后返回选中值', async () => {
    registerAskUserIpc()
    const replyCall = ipcMainHandleMock.mock.calls.find(([ch]) => ch === IPC.askUserReply) as
      | [string, (...a: unknown[]) => unknown]
      | undefined
    expect(replyCall).toBeDefined()

    const promise = waitAskUser('预算？', ['省钱', '舒适'], 'ses-1')
    await vi.waitFor(() => expect(emitSyncMock).toHaveBeenCalled())
    const payload = emitSyncMock.mock.calls[0][0] as {
      type: string
      question: string
      options: string[]
      requestId: string
      sessionId?: string
    }
    expect(payload.type).toBe('ask_user')
    expect(payload.question).toBe('预算？')
    expect(payload.options).toEqual(['省钱', '舒适'])
    expect(payload.sessionId).toBe('ses-1')

    await (replyCall![1] as (...a: unknown[]) => Promise<unknown>)(null, payload.requestId, '舒适')
    await expect(promise).resolves.toBe('舒适')
  })

  it('rejectPendingAsks 解开等待（取消会话）', async () => {
    registerAskUserIpc()
    const promise = waitAskUser('还在吗？', ['是'], 'ses-2')
    await vi.waitFor(() => expect(emitSyncMock).toHaveBeenCalled())
    rejectPendingAsks('ses-2')
    await expect(promise).resolves.toBe('')
  })
})
