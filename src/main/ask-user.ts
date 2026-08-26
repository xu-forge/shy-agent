import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { IPC } from '../shared/ipc'
import { getDefaultBus } from './event-bridge'

type PendingAsk = {
  resolve: (answer: string) => void
  sessionId?: string
  timer: ReturnType<typeof setTimeout>
}

const pending = new Map<string, PendingAsk>()

const ASK_TIMEOUT_MS = 5 * 60_000

function settle(requestId: string, answer: string): void {
  const p = pending.get(requestId)
  if (!p) return
  clearTimeout(p.timer)
  pending.delete(requestId)
  p.resolve(answer)
}

export function registerAskUserIpc(): void {
  ipcMain.handle(IPC.askUserReply, async (_e, requestId: string, answer: string) => {
    settle(requestId, String(answer ?? ''))
    return { ok: true }
  })
}

/** 取消会话时解开仍在等待的 ask_user，避免工具卡住。 */
export function rejectPendingAsks(sessionId?: string): void {
  for (const [id, p] of pending) {
    if (sessionId && p.sessionId && p.sessionId !== sessionId) continue
    settle(id, '')
  }
}

/**
 * 向 renderer 提问并等待用户点选/提交。
 * 不走 autoApproveTools：这是偏好澄清，不是高危放行。
 */
export async function waitAskUser(
  question: string,
  options?: string[],
  sessionId?: string
): Promise<string> {
  const requestId = randomUUID()
  return await new Promise<string>((resolve) => {
    const timer = setTimeout(() => settle(requestId, ''), ASK_TIMEOUT_MS)
    timer.unref?.()
    pending.set(requestId, { resolve, sessionId, timer })
    getDefaultBus().emitSync({
      type: 'ask_user',
      requestId,
      question,
      options: options ?? [],
      sessionId
    })
  })
}
