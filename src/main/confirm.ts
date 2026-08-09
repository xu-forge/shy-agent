import { BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { IPC } from '../shared/ipc'

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

export function createConfirmWaiter(getWindow: () => BrowserWindow | null) {
  return async (action: string, detail: string): Promise<boolean> => {
    const win = getWindow()
    if (!win) return false
    const requestId = randomUUID()
    return await new Promise<boolean>((resolve) => {
      pending.set(requestId, { resolve })
      win.webContents.send(IPC.events, {
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
