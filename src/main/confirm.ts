import { BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { IPC } from '../shared/ipc'
import { getDefaultBus } from './event-bridge'

type Pending = {
  resolve: (ok: boolean) => void
}

const pending = new Map<string, Pending>()

export function registerConfirmIpc(): void {
  ipcMain.handle(IPC.toolConfirm, async (_e, requestId: string, approved: boolean) => {
    pending.get(requestId)?.resolve(Boolean(approved))
    pending.delete(requestId)
    return { ok: true }
  })
}

export function createConfirmWaiter(_getWindow: () => BrowserWindow | null) {
  return async (action: string, detail: string): Promise<boolean> => {
    // Stage 3.2 集成:走 EventBus → preload-adapter → IPC,统一通路
    void _getWindow // 不再直接 send,由 bus 推
    const requestId = randomUUID()
    return await new Promise<boolean>((resolve) => {
      pending.set(requestId, { resolve })
      getDefaultBus().emitSync({
        type: 'confirm_required',
        action,
        detail,
        requestId
      })
      setTimeout(() => {
        if (pending.has(requestId)) {
          pending.delete(requestId)
          resolve(false)
        }
      }, 120_000)
    })
  }
}
