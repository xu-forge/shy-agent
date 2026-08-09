import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type AppPaths } from '../shared/ipc'

const myAgent = {
  ping: (): Promise<'pong'> => ipcRenderer.invoke(IPC.ping),
  getPaths: (): Promise<AppPaths> => ipcRenderer.invoke(IPC.getPaths)
}

contextBridge.exposeInMainWorld('myAgent', myAgent)
