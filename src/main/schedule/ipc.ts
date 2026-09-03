import { ipcMain } from 'electron'
import {
  IPC,
  type CreateScheduleTaskInput,
  type ScheduleConflictWarning,
  type ScheduleOccurrence,
  type ScheduleRunsGetInput,
  type ScheduleRunsListInput,
  type ScheduleTask,
  type ScheduleTasksExpandInput,
  type UpdateScheduleTaskInput
} from '../../shared/ipc'
import { detectWorkflowScheduleConflicts, expandOccurrences } from './expand'
import {
  getScheduleRunByTaskAt,
  listScheduleRunsInRange
} from './runs-store'
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
  getRunByTaskAt: typeof getScheduleRunByTaskAt
  listRunsInRange: typeof listScheduleRunsInRange
}

const defaultDependencies: ScheduleIpcDependencies = {
  listTasks: listScheduleTasks,
  getTask: getScheduleTask,
  createTask: createScheduleTask,
  updateTask: updateScheduleTask,
  deleteTask: deleteScheduleTask,
  expand: expandOccurrences,
  getRunByTaskAt: getScheduleRunByTaskAt,
  listRunsInRange: listScheduleRunsInRange
}

export function registerScheduleIpc(
  dependencies: ScheduleIpcDependencies = defaultDependencies
): void {
  const warningsFor = (tasks: ScheduleTask[]): ScheduleConflictWarning[] =>
    detectWorkflowScheduleConflicts(tasks)

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
  ipcMain.handle(IPC.scheduleRunsGet, async (_event, input: ScheduleRunsGetInput) =>
    dependencies.getRunByTaskAt(input.taskId, input.scheduledAt)
  )
  ipcMain.handle(IPC.scheduleRunsList, async (_event, input: ScheduleRunsListInput) =>
    dependencies.listRunsInRange(new Date(input.rangeStart), new Date(input.rangeEnd))
  )
}
