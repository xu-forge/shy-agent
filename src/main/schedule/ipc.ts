import { ipcMain } from 'electron'
import {
  IPC,
  type CreateScheduleTaskInput,
  type ScheduleOccurrence,
  type ScheduleTask,
  type ScheduleTasksExpandInput,
  type UpdateScheduleTaskInput,
  type Workflow
} from '../../shared/ipc'
import { listWorkflows } from '../workflows/db'
import { detectWorkflowScheduleConflicts, expandOccurrences } from './expand'
import {
  createScheduleTask,
  deleteScheduleTask,
  getScheduleTask,
  listScheduleTasks,
  updateScheduleTask
} from './store'

export type ScheduleIpcDependencies = {
  listTasks: () => ScheduleTask[]
  getTask: (id: string) => ScheduleTask | null
  createTask: (input: CreateScheduleTaskInput) => ScheduleTask
  updateTask: (id: string, patch: UpdateScheduleTaskInput) => ScheduleTask | null
  deleteTask: (id: string) => boolean
  expand: (tasks: ScheduleTask[], rangeStart: Date, rangeEnd: Date) => ScheduleOccurrence[]
  listWorkflows: () => Workflow[]
}

const defaultDependencies: ScheduleIpcDependencies = {
  listTasks: listScheduleTasks,
  getTask: getScheduleTask,
  createTask: createScheduleTask,
  updateTask: updateScheduleTask,
  deleteTask: deleteScheduleTask,
  expand: expandOccurrences,
  listWorkflows
}

export function registerScheduleIpc(
  dependencies: ScheduleIpcDependencies = defaultDependencies
): void {
  const warningsFor = (tasks: ScheduleTask[]) =>
    detectWorkflowScheduleConflicts(tasks, dependencies.listWorkflows())

  ipcMain.handle(IPC.scheduleTasksList, async () => {
    const tasks = dependencies.listTasks()
    return { tasks, warnings: warningsFor(tasks) }
  })
  ipcMain.handle(IPC.scheduleTasksGet, async (_event, id: string) => dependencies.getTask(id))
  ipcMain.handle(
    IPC.scheduleTasksCreate,
    async (_event, input: CreateScheduleTaskInput) => {
      const task = dependencies.createTask(input)
      return { task, warnings: warningsFor([task]) }
    }
  )
  ipcMain.handle(
    IPC.scheduleTasksUpdate,
    async (_event, input: { id: string; patch: UpdateScheduleTaskInput }) => {
      const task = dependencies.updateTask(input.id, input.patch)
      return { task, warnings: task ? warningsFor([task]) : [] }
    }
  )
  ipcMain.handle(IPC.scheduleTasksDelete, async (_event, id: string) => ({
    ok: dependencies.deleteTask(id)
  }))
  ipcMain.handle(
    IPC.scheduleTasksExpand,
    async (_event, input: ScheduleTasksExpandInput) =>
      dependencies.expand(
        dependencies.listTasks(),
        new Date(input.rangeStart),
        new Date(input.rangeEnd)
      )
  )
}
