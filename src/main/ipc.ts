import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import {
  IPC,
  type AgentMode,
  type ChatRequest,
  type MaterialCanvasState,
  type MaterialThumbGetInput,
  type MaterialThumbPutInput,
  type ModelSettings,
  type McpConfigFile,
  type ProjectFileRenameInput,
  type ProjectType
} from '../shared/ipc'
import { getSettings, setSettings } from './settings/store'
import { parseMcpConfig, readMcpConfig, writeMcpConfig } from './mcp/config'
import { getMcpManager } from './mcp/manager'
import { runAgent, cancelAgent, pauseAgent, resumeAgent } from './agent/service'
import { createConfirmWaiter, registerConfirmIpc } from './confirm'
import { registerAskUserIpc, rejectPendingAsks } from './ask-user'
import { startScheduler } from './schedule/scheduler-loop'
import { registerBuiltinTools } from './agent/tools/builtin'
import { registerComputerTools } from './agent/tools/computer'
import { registerEnrichmentTools } from './agent/tools/enrichment'
import { registeredToolNames } from './agent/tools/registry'
import {
  deleteLongMemory,
  deleteSessionTask,
  listLongMemory,
  listSessionFiles,
  listSessionDiffs,
  listSessionTasks,
  updateSessionTaskDone,
  upsertLongMemory
} from './memory/db'
import { deleteSkill, listSkills, readSkill, writeSkill, setSkillEnabled } from './skills/store'
import {
  createSession,
  deleteSession,
  ensureSessionTables,
  getSession,
  listGoalSessionsByRunStatus,
  listSessions,
  updateSessionRuntime
} from './sessions/store'
import { getShyPaths, resolveShyHome } from './paths'
import { listAgentLogFiles, readAgentLogFile, revealAgentLogsDir } from './logs/agent-logs'
import { registerScheduleIpc } from './schedule/ipc'
import { resumeInterruptedGoals } from './agent/boot-resume'
import { getDefaultBus } from './event-bridge'
import {
  bindSessionProject,
  createProject,
  deleteProject,
  getProject,
  listProjects
} from './projects/store'
import {
  assertInsideRoot,
  deleteMaterial,
  importMaterial,
  listMaterials,
  listProjectTree,
  readFileAsDataUrl,
  renameMaterial
} from './projects/fs-guard'
import {
  asIpcFailure,
  collectProjectMaterialWrites,
  resolveProjectFilePath
} from './projects/ipc-helpers'
import { ensureImageThumb, putVideoThumb } from './materials/thumbs'
import { readCanvasState, writeCanvasState } from './materials/canvas-state'
import {
  ensureDockRoot,
  listDockTree,
  readDockFileDataUrl,
  readDockFileText,
  resolveDockFile
} from './dock/root'

let mainWindow: BrowserWindow | null = null
const waitConfirm = createConfirmWaiter(() => mainWindow)

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win
}

/**
 * Stage 3.2 集成:所有事件走 EventBus,preload-adapter 桥接 → IPC → renderer。
 * 这样 EventLog (renderer 端 useAgentEvent) 和老 onEvent 监听器都自动收到,无双发。
 */
function emitToRenderer(payload: unknown): void {
  // payload 通常是 AgentEvent 类型,但 ipc.ts 里有几个老代码可能传混合对象,
  // 用宽松类型接受,bus 内部有类型守卫(没有 type 字段就被忽略)
  const event = payload as { type?: string } & Record<string, unknown>
  if (!event || typeof event.type !== 'string') {
    // 兼容老 payload(无 type),仍然走老路直接 send
    mainWindow?.webContents.send(IPC.events, payload)
    return
  }
  getDefaultBus().emitSync(event as Parameters<ReturnType<typeof getDefaultBus>['emitSync']>[0])
}

function asDockIoFailure(err: unknown): { ok: false; error: 'path_escape' | 'not_found' } | null {
  const mapped = asIpcFailure(err)
  if (mapped?.error === 'path_escape') return { ok: false as const, error: 'path_escape' as const }
  if (
    err &&
    typeof err === 'object' &&
    'code' in err &&
    (err as NodeJS.ErrnoException).code === 'ENOENT'
  ) {
    return { ok: false, error: 'not_found' }
  }
  if (mapped) return { ok: false, error: 'not_found' }
  return null
}

async function revealInFileManager(filePath: string): Promise<void> {
  if (process.platform === 'win32') {
    await shell.openPath(filePath).catch(() => undefined)
    const { spawn } = await import('child_process')
    spawn('explorer.exe', [`/select,${filePath.replace(/\//g, '\\')}`], { detached: true })
  } else if (process.platform === 'darwin') {
    const { spawn } = await import('child_process')
    spawn('open', ['-R', filePath], { detached: true })
  } else {
    const { dirname } = await import('path')
    await shell.openPath(dirname(filePath))
  }
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
  registerEnrichmentTools()
  getMcpManager().setOccupiedNames(() => registeredToolNames())
  registerConfirmIpc()
  registerAskUserIpc()
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

  ipcMain.handle(IPC.mcpGet, async () => readMcpConfig(resolveShyHome()))
  ipcMain.handle(IPC.mcpSet, async (_e, next: McpConfigFile) => {
    const cfg = parseMcpConfig(next)
    await writeMcpConfig(cfg, resolveShyHome())
    await getMcpManager().applyConfig(cfg)
    return { config: cfg, status: getMcpManager().getStatus() }
  })
  ipcMain.handle(IPC.mcpStatus, async () => getMcpManager().getStatus())

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
  ipcMain.handle(IPC.skillsSetEnabled, async (_e, input: { name: string; enabled: boolean }) => {
    await setSkillEnabled(input.name, input.enabled)
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
  // inspector-func-panel: 会话文件改动 diff
  ipcMain.handle(IPC.sessionDiffsList, async (_e, sessionId: string) => listSessionDiffs(sessionId))
  ipcMain.handle(IPC.sessionFilesReveal, async (_e, _sessionId: string, filePath: string) => {
    await revealInFileManager(filePath)
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

  ipcMain.handle(IPC.projectsList, async () => listProjects())
  ipcMain.handle(
    IPC.projectsCreate,
    async (_e, input: { type: ProjectType; rootPath: string; name?: string }) => {
      try {
        return { ok: true as const, project: createProject(input) }
      } catch (err) {
        const mapped = asIpcFailure(err)
        if (mapped) return mapped
        throw err
      }
    }
  )
  ipcMain.handle(IPC.projectsDelete, async (_e, id: string) => deleteProject(id))
  ipcMain.handle(
    IPC.sessionsBindProject,
    async (_e, input: { sessionId: string; projectId: string }) =>
      bindSessionProject(input.sessionId, input.projectId)
  )
  ipcMain.handle(IPC.projectPickFolder, async () => {
    if (!mainWindow) return { ok: false as const }
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return { ok: false as const }
    return { ok: true as const, path: result.filePaths[0] }
  })
  ipcMain.handle(IPC.projectPickFile, async () => {
    if (!mainWindow) return { ok: false as const }
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'] })
    if (result.canceled || result.filePaths.length === 0) return { ok: false as const }
    return { ok: true as const, path: result.filePaths[0] }
  })
  ipcMain.handle(IPC.projectReveal, async (_e, input: { projectId: string; absPath: string }) => {
    const project = getProject(input.projectId)
    if (!project) return { ok: false as const, error: 'not_found' as const }
    try {
      const abs = assertInsideRoot(project.rootPath, input.absPath)
      await shell.openPath(abs)
      return { ok: true as const }
    } catch (err) {
      const mapped = asIpcFailure(err)
      if (mapped) return mapped
      throw err
    }
  })
  ipcMain.handle(
    IPC.projectFileReadDataUrl,
    async (_e, input: { projectId: string; relativePath: string }) => {
      const project = getProject(input.projectId)
      if (!project) return { ok: false as const, error: 'not_found' as const }
      try {
        const dataUrl = readFileAsDataUrl(project.rootPath, input.relativePath)
        return { ok: true as const, dataUrl }
      } catch (err) {
        const mapped = asIpcFailure(err)
        if (mapped) return mapped
        throw err
      }
    }
  )
  ipcMain.handle(IPC.projectTreeList, async (_e, projectId: string) => {
    const project = getProject(projectId)
    if (!project) return { ok: false as const, error: 'not_found' as const }
    const { tree, truncated } = listProjectTree(project.rootPath)
    return { ok: true as const, tree, truncated }
  })
  ipcMain.handle(
    IPC.projectFileRead,
    async (_e, input: { projectId: string; relativePath: string }) => {
      const project = getProject(input.projectId)
      if (!project) return { ok: false as const, error: 'not_found' as const }
      try {
        const absPath = resolveProjectFilePath(project.rootPath, input.relativePath)
        const content = await readFile(absPath, 'utf8')
        return { ok: true as const, content }
      } catch (err) {
        const mapped = asIpcFailure(err)
        if (mapped) return mapped
        throw err
      }
    }
  )
  ipcMain.handle(
    IPC.projectFileWrite,
    async (_e, input: { projectId: string; relativePath: string; content: string }) => {
      const project = getProject(input.projectId)
      if (!project) return { ok: false as const, error: 'not_found' as const }
      try {
        const absPath = resolveProjectFilePath(project.rootPath, input.relativePath)
        await writeFile(absPath, input.content, 'utf8')
        return { ok: true as const }
      } catch (err) {
        const mapped = asIpcFailure(err)
        if (mapped) return mapped
        throw err
      }
    }
  )
  ipcMain.handle(IPC.projectMaterialsList, async (_e, projectId: string) => {
    const project = getProject(projectId)
    if (!project) return { ok: false as const, error: 'not_found' as const }
    const writes = collectProjectMaterialWrites(listSessions(), projectId, listSessionFiles)
    const { items, truncated } = listMaterials(project.rootPath, writes)
    return { ok: true as const, items, truncated }
  })
  ipcMain.handle(
    IPC.projectMaterialsImport,
    async (_e, input: { projectId: string; sourceAbsPath: string }) => {
      const project = getProject(input.projectId)
      if (!project) return { ok: false as const, error: 'not_found' as const }
      try {
        const item = importMaterial(project.rootPath, input.sourceAbsPath)
        return { ok: true as const, item }
      } catch (err) {
        const mapped = asIpcFailure(err)
        if (mapped) return mapped
        throw err
      }
    }
  )

  ipcMain.handle(IPC.materialThumbGet, async (_e, input: MaterialThumbGetInput) => {
    const project = getProject(input.projectId)
    if (!project) return { ok: false as const, reason: 'not_found' as const }
    try {
      assertInsideRoot(project.rootPath, input.absPath)
    } catch {
      return { ok: false as const, reason: 'path_escape' as const }
    }
    return ensureImageThumb(input)
  })

  ipcMain.handle(IPC.materialThumbPut, async (_e, input: MaterialThumbPutInput) => {
    const project = getProject(input.projectId)
    if (!project) return { ok: false as const, reason: 'invalid_data' as const }
    try {
      assertInsideRoot(project.rootPath, input.absPath)
    } catch {
      return { ok: false as const, reason: 'path_escape' as const }
    }
    return putVideoThumb(input)
  })

  ipcMain.handle(IPC.materialCanvasStateGet, async (_e, projectId: string) => {
    if (!getProject(projectId)) return { ok: false as const, error: 'not_found' as const }
    return { ok: true as const, state: readCanvasState(projectId) }
  })

  ipcMain.handle(
    IPC.materialCanvasStateSet,
    async (_e, input: { projectId: string; state: MaterialCanvasState }) => {
      if (!getProject(input.projectId)) return { ok: false as const, error: 'not_found' as const }
      writeCanvasState(input.projectId, input.state)
      return { ok: true as const }
    }
  )

  ipcMain.handle(IPC.projectFileOpen, async (_e, input: { projectId: string; absPath: string }) => {
    const project = getProject(input.projectId)
    if (!project) return { ok: false as const, error: 'not_found' as const }
    try {
      const abs = assertInsideRoot(project.rootPath, input.absPath)
      const message = await shell.openPath(abs)
      if (message) return { ok: false as const, error: 'open_failed' as const }
      return { ok: true as const }
    } catch (err) {
      const mapped = asIpcFailure(err)
      if (mapped) return mapped
      return { ok: false as const, error: 'open_failed' as const }
    }
  })

  ipcMain.handle(IPC.projectFileRename, async (_e, input: ProjectFileRenameInput) => {
    const project = getProject(input.projectId)
    if (!project) return { ok: false as const, error: 'not_found' as const }
    return renameMaterial(project.rootPath, input.absPath, input.newName)
  })

  ipcMain.handle(IPC.projectFileDelete, async (_e, input: { projectId: string; absPath: string }) => {
    const project = getProject(input.projectId)
    if (!project) return { ok: false as const, error: 'not_found' as const }
    return deleteMaterial(project.rootPath, input.absPath)
  })

  ipcMain.handle(IPC.dockOpenRoot, async (_e, sessionId: string) => {
    try {
      const path = ensureDockRoot(sessionId)
      const message = await shell.openPath(path)
      if (message) return { ok: false as const, error: 'open_failed' as const }
      return { ok: true as const, path }
    } catch (err) {
      const mapped = asDockIoFailure(err)
      if (mapped?.error === 'not_found') return mapped
      return { ok: false as const, error: 'open_failed' as const }
    }
  })
  ipcMain.handle(IPC.dockTreeList, async (_e, sessionId: string) => {
    try {
      const { tree, truncated, rootPath } = listDockTree(sessionId)
      return { ok: true as const, tree, truncated, rootPath }
    } catch (err) {
      const mapped = asDockIoFailure(err)
      if (mapped) return mapped
      throw err
    }
  })
  ipcMain.handle(
    IPC.dockFileRead,
    async (_e, input: { sessionId: string; relativePath: string }) => {
      try {
        const { content, truncated } = readDockFileText(input.sessionId, input.relativePath)
        return { ok: true as const, content, truncated }
      } catch (err) {
        const mapped = asDockIoFailure(err)
        if (mapped) return mapped
        throw err
      }
    }
  )
  ipcMain.handle(
    IPC.dockFileReadDataUrl,
    async (_e, input: { sessionId: string; relativePath: string }) => {
      try {
        const dataUrl = readDockFileDataUrl(input.sessionId, input.relativePath)
        return { ok: true as const, dataUrl }
      } catch (err) {
        const mapped = asDockIoFailure(err)
        if (mapped) return mapped
        throw err
      }
    }
  )
  ipcMain.handle(
    IPC.dockFileReveal,
    async (_e, input: { sessionId: string; relativePath: string }) => {
      try {
        const abs = resolveDockFile(input.sessionId, input.relativePath)
        await revealInFileManager(abs)
        return { ok: true as const }
      } catch (err) {
        const mapped = asDockIoFailure(err)
        if (mapped) return mapped
        throw err
      }
    }
  )
  ipcMain.handle(
    IPC.dockFileOpen,
    async (_e, input: { sessionId: string; relativePath: string }) => {
      try {
        const abs = resolveDockFile(input.sessionId, input.relativePath)
        const message = await shell.openPath(abs)
        if (message) return { ok: false as const, error: 'open_failed' as const }
        return { ok: true as const }
      } catch (err) {
        const mapped = asDockIoFailure(err)
        if (mapped) return mapped
        throw err
      }
    }
  )

  ipcMain.handle(IPC.agentCancel, async (_e, sessionId: string) => {
    cancelAgent(sessionId)
    rejectPendingAsks(sessionId)
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

  // 调度器：每 30s 检查一次 calendar task
  startScheduler((event) => mainWindow?.webContents.send(IPC.scheduleRemind, event))
}
