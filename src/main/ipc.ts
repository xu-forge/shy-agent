import { app, ipcMain } from 'electron'
import { IPC, type AppPaths } from '../shared/ipc'

export function registerCoreIpc(): void {
  ipcMain.handle(IPC.ping, async () => 'pong' as const)
  ipcMain.handle(IPC.getPaths, async (): Promise<AppPaths> => ({
    userData: app.getPath('userData'),
    platform: process.platform
  }))
}
