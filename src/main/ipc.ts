import { BrowserWindow, ipcMain } from 'electron'
import { IPC, type AgentMode, type ChatRequest, type ModelSettings } from '../shared/ipc'
import { getSettings, setSettings } from './settings/store'
import { runAgent, cancelAgent } from './agent/service'
import { createConfirmWaiter, registerConfirmIpc } from './confirm'
import { registerBuiltinTools } from './agent/tools/builtin'
import { registerComputerTools } from './agent/tools/computer'
import {
  deleteLongMemory,
  listLongMemory,
  upsertLongMemory,
  compressContext,
  getShortMemory,
  setShortMemory
} from './memory/db'
import { deleteSkill, listSkills, readSkill, writeSkill } from './skills/store'

let mainWindow: BrowserWindow | null = null

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win
}

function emitToRenderer(payload: unknown): void {
  mainWindow?.webContents.send(IPC.events, payload)
}

export function registerCoreIpc(): void {
  registerBuiltinTools()
  registerComputerTools()
  registerConfirmIpc()

  const waitConfirm = createConfirmWaiter(() => mainWindow)

  ipcMain.handle(IPC.ping, async () => 'pong' as const)
  ipcMain.handle(IPC.getPaths, async () => ({
    userData: (await import('electron')).app.getPath('userData'),
    platform: process.platform
  }))

  ipcMain.handle(IPC.settingsGet, async () => getSettings())
  ipcMain.handle(IPC.settingsSet, async (_e, next: ModelSettings) => setSettings(next))

  ipcMain.handle(IPC.memoryList, async () => listLongMemory())
  ipcMain.handle(IPC.memoryUpsert, async (_e, input) =>
    upsertLongMemory({ ...input, source: input.source ?? 'user' })
  )
  ipcMain.handle(IPC.memoryDelete, async (_e, id: string) => {
    deleteLongMemory(id)
    return { ok: true }
  })

  ipcMain.handle(IPC.skillsList, async () => listSkills())
  ipcMain.handle(IPC.skillsRead, async (_e, id: string) => readSkill(id))
  ipcMain.handle(IPC.skillsWrite, async (_e, input) => writeSkill(input))
  ipcMain.handle(IPC.skillsDelete, async (_e, id: string) => {
    await deleteSkill(id)
    return { ok: true }
  })

  ipcMain.handle(IPC.agentCancel, async (_e, sessionId: string) => {
    cancelAgent(sessionId)
    return { ok: true }
  })

  ipcMain.handle(IPC.agentChat, async (_e, req: ChatRequest) => {
    const prior = getShortMemory(req.sessionId)
    const enriched =
      prior.length > 0
        ? `【短期记忆/压缩上下文】\n${prior}\n\n【用户】\n${req.message}`
        : req.message

    void runAgent({
      sessionId: req.sessionId,
      message: enriched,
      mode: req.mode as AgentMode,
      emit: (event) => {
        emitToRenderer({ sessionId: req.sessionId, ...event })
        if (event.type === 'assistant') {
          const next = compressContext([prior, req.message, event.content])
          setShortMemory(req.sessionId, next)
        }
        if (event.type === 'memory') {
          emitToRenderer({
            sessionId: req.sessionId,
            type: 'notify',
            message: `长期记忆已${event.action === 'delete' ? '删除' : '更新'}：${event.title || event.entryId || ''}`
          })
        }
      },
      waitConfirm
    })
    return { ok: true, started: true }
  })
}
