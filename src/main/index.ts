import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerCoreIpc, resumeInterruptedGoalSessions, setMainWindow } from './ipc'
import { startSkillWatch } from './skills/store'
import { registerBrowserIpc, setBrowserWindowProvider, getEmbeddedBrowserManager } from './browser'
import { shouldBlockRendererNavigation } from './browser/renderer-navigation'
import { setBrowserManagerGetter } from './agent/tools/browser'
import { protocol } from 'electron'
import { respondFileWithRange } from './net/file-response'
import { PRIVILEGED_SCHEMES } from './net/privileged-schemes'

// minimax-feature-port：shy-asset:// 协议 — 渲染层展示 ~/.shy 下的产物（浏览器截图等）
// material-canvas：shy-material:// 协议 — 按项目根校验后读取素材原文件（缩略图/播放/截帧源）
protocol.registerSchemesAsPrivileged(PRIVILEGED_SCHEMES)
import { ensureShyHomeDirs, resolveShyHome } from './paths'
import { dropLegacyWorkflowTables, migrateLegacyUserData } from './migration'
import { bridgeEventBusToIpc, getDefaultBus } from './event-bridge'
import { readMcpConfig } from './mcp/config'
import { getMcpManager } from './mcp/manager'
import { getProject } from './projects/store'
import { assertInsideRoot } from './projects/fs-guard'

let bootResumeAttempted = false

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'shy',
    backgroundColor: '#f4f4f2',
    // macOS：隐藏系统标题栏，红绿灯嵌入自绘 header（Codex/ChatGPT 式）
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 18, y: 13 }
        }
      : {}),
    ...(process.platform !== 'darwin' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  setMainWindow(mainWindow)
  mainWindow.on('closed', () => {
    setMainWindow(null)
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    if (!bootResumeAttempted) {
      bootResumeAttempted = true
      resumeInterruptedGoalSessions()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (shouldBlockRendererNavigation(mainWindow.webContents.getURL(), url)) {
      event.preventDefault()
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // 必须在任何业务读写之前：缓存旧 userData → 切到 ~/.shy → 迁移 → ensure
  const legacyUserData = app.getPath('userData')
  const shyHome = resolveShyHome()
  app.setPath('userData', shyHome)
  const paths = ensureShyHomeDirs(shyHome)
  const migration = migrateLegacyUserData(legacyUserData, paths)
  if (migration.status === 'success') {
    console.log('[shy] migrated legacy data from', migration.source, migration.files)
  }

  // 砍掉 workflow 引擎：先备份旧表内容到 ~/.shy/migration-backup/，再 DROP。
  // 必须在 registerCoreIpc 之前——老 IPC 通道已移除，但旧表若残留会让备份不完整。
  const dropped = dropLegacyWorkflowTables(paths)
  if (dropped.status === 'dropped') {
    console.log(
      `[shy] dropped legacy workflow tables: ${dropped.workflowCount} workflows, ${dropped.runCount} runs → ${dropped.backupPath}`
    )
  }

  electronApp.setAppUserModelId('com.local.shy')
  if (process.platform === 'darwin') {
    app.dock?.setIcon(icon)
  }
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerCoreIpc()
  // minimax-feature-port：技能注册表热重载 + 内嵌浏览器 IPC
  startSkillWatch()
  registerBrowserIpc()
  setBrowserWindowProvider(() => BrowserWindow.getAllWindows()[0] ?? null)
  setBrowserManagerGetter(() => getEmbeddedBrowserManager())

  void readMcpConfig(shyHome)
    .then((cfg) => getMcpManager().connectAll(cfg))
    .catch((err) => console.error('[shy] mcp connectAll', err))

  // shy-asset://<首段>/<相对路径> → ~/.shy/<首段>/<相对路径>
  // 注意：standard scheme 中首段是 URL host（会被小写化），须并入相对路径
  protocol.handle('shy-asset', async (request) => {
    try {
      const u = new URL(request.url)
      const rel = decodeURIComponent(`${u.host}${u.pathname}`).replace(/^\/+/, '')
      const home = resolveShyHome()
      const file = join(home, rel)
      if (!file.startsWith(home)) return new Response('forbidden', { status: 403 })
      return await respondFileWithRange(file, request)
    } catch {
      return new Response('bad request', { status: 400 })
    }
  })
  // shy-material://m/<projectId>/<encodeURIComponent(absPath)> → 项目 rootPath 内的素材原文件
  protocol.handle('shy-material', async (request) => {
    try {
      const u = new URL(request.url)
      const segments = decodeURIComponent(u.pathname).replace(/^\/+/, '').split('/')
      const projectId = segments[0] ?? ''
      const absPath = segments.slice(1).join('/')
      const project = getProject(projectId)
      if (!project) return new Response('not found', { status: 404 })
      const abs = assertInsideRoot(project.rootPath, absPath)
      return await respondFileWithRange(abs, request)
    } catch {
      return new Response('bad request', { status: 400 })
    }
  })
  // Stage 3.2: 把 EventBus 桥接到 IPC,让 main emit 的事件自动推到 renderer
  // 通过 getMainWindow 闭包动态拿最新 mainWindow(支持重开窗口)
  bridgeEventBusToIpc(getDefaultBus(), () => {
    const wins = BrowserWindow.getAllWindows()
    return wins[0] ?? null
  })
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

let mcpQuitting = false
app.on('before-quit', (event) => {
  if (mcpQuitting) return
  event.preventDefault()
  mcpQuitting = true
  const cap = new Promise<void>((resolve) => {
    setTimeout(resolve, 3000)
  })
  void Promise.race([getMcpManager().shutdown(), cap])
    .catch((err) => console.error('[shy] mcp shutdown', err))
    .finally(() => app.quit())
})
