import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '../shared/ipc'

const invoke = vi.fn()
const on = vi.fn()
const removeListener = vi.fn()
let exposed: Record<string, (...args: never[]) => unknown>

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, api: Record<string, (...args: never[]) => unknown>) => {
      exposed = api
    }
  },
  ipcRenderer: { invoke, on, removeListener }
}))

describe('schedule task preload API', () => {
  beforeEach(async () => {
    vi.resetModules()
    invoke.mockReset()
    on.mockReset()
    removeListener.mockReset()
    await import('./index')
  })

  it('暴露任务 CRUD、展开与提醒订阅', () => {
    const input = { rangeStart: 1, rangeEnd: 2 }
    exposed.scheduleTasksList()
    exposed.scheduleTasksGet('task-1' as never)
    exposed.scheduleTasksCreate({ title: '提醒' } as never)
    exposed.scheduleTasksUpdate({ id: 'task-1', patch: { title: '更新' } } as never)
    exposed.scheduleTasksDelete('task-1' as never)
    exposed.scheduleTasksExpand(input as never)

    expect(invoke.mock.calls).toEqual([
      [IPC.scheduleTasksList],
      [IPC.scheduleTasksGet, 'task-1'],
      [IPC.scheduleTasksCreate, { title: '提醒' }],
      [IPC.scheduleTasksUpdate, { id: 'task-1', patch: { title: '更新' } }],
      [IPC.scheduleTasksDelete, 'task-1'],
      [IPC.scheduleTasksExpand, input]
    ])

    const handler = vi.fn()
    const unsubscribe = exposed.onScheduleRemind(handler as never) as () => void
    const listener = on.mock.calls[0][1]
    listener({}, { type: 'schedule_remind', taskId: 'task-1' })
    expect(on).toHaveBeenCalledWith(IPC.scheduleRemind, listener)
    expect(handler).toHaveBeenCalledWith({ type: 'schedule_remind', taskId: 'task-1' })

    unsubscribe()
    expect(removeListener).toHaveBeenCalledWith(IPC.scheduleRemind, listener)
  })
})

describe('mcp preload API', () => {
  beforeEach(async () => {
    vi.resetModules()
    invoke.mockReset()
    on.mockReset()
    removeListener.mockReset()
    await import('./index')
  })

  it('暴露 get/set/status', () => {
    const cfg = { mcpServers: { MiniMax: { command: 'uvx', args: ['-y'], env: {}, enabled: true } } }
    exposed.getMcpConfig()
    exposed.setMcpConfig(cfg as never)
    exposed.getMcpStatus()
    expect(invoke.mock.calls).toEqual([
      [IPC.mcpGet],
      [IPC.mcpSet, cfg],
      [IPC.mcpStatus]
    ])
  })
})

describe('project preload API', () => {
  beforeEach(async () => {
    vi.resetModules()
    invoke.mockReset()
    on.mockReset()
    removeListener.mockReset()
    await import('./index')
  })

  it('exposes project CRUD, bind, folder picker, tree, files, and materials', () => {
    const createInput = { type: 'code' as const, rootPath: '/tmp/repo' }
    const bindInput = { sessionId: 's1', projectId: 'p1' }
    const fileInput = { projectId: 'p1', relativePath: 'src/a.ts', content: 'x' }
    const importInput = { projectId: 'p1', sourceAbsPath: '/tmp/x.png' }

    exposed.listProjects()
    exposed.createProject(createInput as never)
    exposed.deleteProject('p1' as never)
    exposed.bindSessionProject(bindInput as never)
    exposed.pickFolder()
    exposed.projectTreeList('p1' as never)
    exposed.projectFileRead({ projectId: 'p1', relativePath: 'src/a.ts' } as never)
    exposed.projectFileWrite(fileInput as never)
    exposed.projectMaterialsList('p1' as never)
    exposed.projectMaterialsImport(importInput as never)

    expect(invoke.mock.calls).toEqual([
      [IPC.projectsList],
      [IPC.projectsCreate, createInput],
      [IPC.projectsDelete, 'p1'],
      [IPC.sessionsBindProject, bindInput],
      [IPC.projectPickFolder],
      [IPC.projectTreeList, 'p1'],
      [IPC.projectFileRead, { projectId: 'p1', relativePath: 'src/a.ts' }],
      [IPC.projectFileWrite, fileInput],
      [IPC.projectMaterialsList, 'p1'],
      [IPC.projectMaterialsImport, importInput]
    ])
  })

  it('exposes file picker, reveal, and binary data-url read', () => {
    const revealInput = { projectId: 'p1', absPath: '/proj/a.png' }
    const dataUrlInput = { projectId: 'p1', relativePath: 'a.png' }

    exposed.pickFile()
    exposed.projectReveal(revealInput as never)
    exposed.projectFileReadDataUrl(dataUrlInput as never)

    expect(invoke.mock.calls).toEqual([
      [IPC.projectPickFile],
      [IPC.projectReveal, revealInput],
      [IPC.projectFileReadDataUrl, dataUrlInput]
    ])
  })
})
