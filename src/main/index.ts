import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerCoreIpc, resumeInterruptedGoalSessions, setMainWindow } from './ipc'
import { ensureShyHomeDirs, resolveShyHome } from './paths'
import { dropLegacyWorkflowTables, migrateLegacyUserData } from './migration'

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
    ...(process.platform === 'linux' ? { icon } : {}),
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
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerCoreIpc()
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
