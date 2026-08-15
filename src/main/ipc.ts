import { BrowserWindow, ipcMain, shell } from 'electron'
import { IPC, type AgentMode, type ChatRequest, type ModelSettings } from '../shared/ipc'
import { getSettings, setSettings } from './settings/store'
import { runAgent, cancelAgent, pauseAgent, resumeAgent } from './agent/service'
import { createConfirmWaiter, registerConfirmIpc } from './confirm'
import { deleteWorkflow, getWorkflow, listWorkflows, saveWorkflow, listRuns } from './workflows/db'
import { startScheduler, runWorkflowNow } from './workflows/manager'
import { compileCron } from './workflows/scheduler'
import { defaultWorkflow } from './workflows/engine'
import { registerBuiltinTools } from './agent/tools/builtin'
import { registerComputerTools } from './agent/tools/computer'
import {
  deleteLongMemory,
  deleteSessionTask,
  listLongMemory,
  listSessionFiles,
  listSessionTasks,
  updateSessionTaskDone,
  upsertLongMemory
} from './memory/db'
import { deleteSkill, listSkills, readSkill, writeSkill } from './skills/store'
import {
  createSession,
  deleteSession,
  ensureSessionTables,
  getSession,
  listGoalSessionsByRunStatus,
  listSessions,
  updateSessionRuntime
} from './sessions/store'
import { getShyPaths } from './paths'
import { listAgentLogFiles, readAgentLogFile, revealAgentLogsDir } from './logs/agent-logs'
import { registerScheduleIpc } from './schedule/ipc'
import { resumeInterruptedGoals } from './agent/boot-resume'

let mainWindow: BrowserWindow | null = null
const waitConfirm = createConfirmWaiter(() => mainWindow)

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win
}

function emitToRenderer(payload: unknown): void {
  mainWindow?.webContents.send(IPC.events, payload)
}

export function resumeInterruptedGoalSessions(): void {
  const running = listGoalSessionsByRunStatus('running')
  resumeInterruptedGoals(running, {
    pause: (sessionId) => updateSessionRuntime(sessionId, { runStatus: 'paused', paused: true }),
    resume: (sessionId) =>
      resumeAgent(sessionId, (event) => emitToRenderer({ sessionId, ...event }), waitConfirm)
  })
}

export function registerCoreIpc(): void {
  ensureSessionTables()
  registerBuiltinTools()
  registerComputerTools()
  registerConfirmIpc()
  registerScheduleIpc()

  ipcMain.handle(IPC.ping, async () => 'pong' as const)
  ipcMain.handle(IPC.getPaths, async () => {
    const p = getShyPaths()
    return {
      userData: p.shyHome,
      shyHome: p.shyHome,
      configDir: p.configDir,
      dbPath: p.dbPath,
      skillsDir: p.skillsDir,
      logsAgentDir: p.logsAgentDir,
      artifactsDir: p.artifactsDir,
      platform: process.platform
    }
  })
  ipcMain.handle(IPC.logsAgentList, async () => listAgentLogFiles())
  ipcMain.handle(IPC.logsAgentRead, async (_e, input) => readAgentLogFile(input))
  ipcMain.handle(IPC.logsAgentReveal, async () => revealAgentLogsDir())

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

  ipcMain.handle(IPC.sessionsList, async () => listSessions())
  ipcMain.handle(IPC.sessionsGet, async (_e, id: string) => getSession(id))
  ipcMain.handle(IPC.sessionsCreate, async (_e, input?: { mode?: AgentMode; title?: string }) =>
    createSession(input?.mode ?? 'interactive', input?.title)
  )
  ipcMain.handle(IPC.sessionsDelete, async (_e, id: string) => {
    cancelAgent(id)
    deleteSession(id)
    return { ok: true }
  })

  // shell-session-side-panel: 会话文件追踪
  ipcMain.handle(IPC.sessionFilesList, async (_e, sessionId: string) => listSessionFiles(sessionId))
  ipcMain.handle(IPC.sessionFilesReveal, async (_e, _sessionId: string, filePath: string) => {
    if (process.platform === 'win32') {
      // explorer /select, 在资源管理器中选中文件（需转义逗号）
      await shell.openPath(filePath).catch(() => undefined)
      // 退化为 openPath 已能打开所在目录；如需严格 /select 走子进程：
      const { spawn } = await import('child_process')
      spawn('explorer.exe', [`/select,${filePath.replace(/\//g, '\\')}`], { detached: true })
    } else if (process.platform === 'darwin') {
      const { spawn } = await import('child_process')
      spawn('open', ['-R', filePath], { detached: true })
    } else {
      // Linux 暂不支持 reveal，回退到打开所在目录
      const { dirname } = await import('path')
      await shell.openPath(dirname(filePath))
    }
    return { ok: true }
  })

  // shell-session-side-panel: 会话任务
  ipcMain.handle(IPC.sessionTasksList, async (_e, sessionId: string) => listSessionTasks(sessionId))
  ipcMain.handle(
    IPC.sessionTasksUpdate,
    async (_e, input: { sessionId: string; id: string; done: boolean; evidence?: string }) => {
      const updated = updateSessionTaskDone(input.sessionId, input.id, input.done, input.evidence)
      if (!updated) return { ok: false, error: '任务不存在' }
      return { ok: true, task: updated }
    }
  )
  ipcMain.handle(IPC.sessionTasksDelete, async (_e, input: { sessionId: string; id: string }) => {
    const removed = deleteSessionTask(input.sessionId, input.id)
    return { ok: removed }
  })

  ipcMain.handle(IPC.agentCancel, async (_e, sessionId: string) => {
    cancelAgent(sessionId)
    return { ok: true }
  })

  ipcMain.handle(IPC.agentPause, async (_e, sessionId: string) => {
    pauseAgent(sessionId)
    emitToRenderer({ sessionId, type: 'status', message: '已请求暂停…' })
    return { ok: true }
  })

  ipcMain.handle(IPC.agentResume, async (_e, sessionId: string) => {
    resumeAgent(sessionId, (event) => emitToRenderer({ sessionId, ...event }), waitConfirm)
    return { ok: true, started: true }
  })

  ipcMain.handle(IPC.agentChat, async (_e, req: ChatRequest) => {
    if (!getSession(req.sessionId)) {
      createSession(req.mode as AgentMode, req.message.slice(0, 40), req.sessionId)
    } else {
      updateSessionRuntime(req.sessionId, { mode: req.mode as AgentMode })
    }

    void runAgent({
      sessionId: req.sessionId,
      message: req.message,
      mode: req.mode as AgentMode,
      verifyCommand: req.verifyCommand,
      emit: (event) => {
        emitToRenderer({ sessionId: req.sessionId, ...event })
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

  // workflows
  ipcMain.handle(IPC.workflowList, async () => listWorkflows())
  ipcMain.handle(IPC.workflowGet, async (_e, id: string) => getWorkflow(id))
  ipcMain.handle(IPC.workflowSave, async (_e, wf) => {
    // 每次保存都从交互参数重新编译 cron
    if (wf?.schedule) {
      wf = { ...wf, schedule: { ...wf.schedule, cron: compileCron(wf.schedule) } }
    }
    return saveWorkflow(wf)
  })
  ipcMain.handle(IPC.workflowDelete, async (_e, id: string) => {
    deleteWorkflow(id)
    return { ok: true }
  })
  ipcMain.handle(IPC.workflowRun, async (_e, id: string) => {
    try {
      const run = await runWorkflowNow(id, (event) => emitToRenderer(event))
      return {
        ok: run.status === 'success',
        run,
        error: run.status === 'failed' ? run.error : undefined
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      return { ok: false, error }
    }
  })
  ipcMain.handle(IPC.workflowRunsList, async (_e, id?: string) => listRuns(id))
  ipcMain.handle(IPC.workflowTemplate, async () => defaultWorkflow('股票每日晨报'))

  // 调度器：每次事件发到 renderer
  startScheduler(
    (event) => emitToRenderer(event),
    (event) => mainWindow?.webContents.send(IPC.scheduleRemind, event)
  )
}
