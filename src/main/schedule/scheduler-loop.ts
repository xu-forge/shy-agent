import { checkCalendarTasks, setScheduleAgentEmit, setScheduleConfirmWaiter, setScheduleEventSink, type ScheduleEventSink } from './runner'
import { listScheduleTasks } from './store'
import type { ScheduleAgentEmit, ScheduleWaitConfirm } from './runner'

const TICK_INTERVAL_MS = 30_000

let timer: NodeJS.Timeout | null = null

/**
 * 启动一个轻量循环，每 30s 调用一次 checkCalendarTasks。
 */
export function startScheduler(
  emitSchedule?: ScheduleEventSink,
  waitConfirm?: ScheduleWaitConfirm,
  emitAgent?: ScheduleAgentEmit
): void {
  setScheduleEventSink(emitSchedule ?? null)
  setScheduleConfirmWaiter(waitConfirm ?? null)
  setScheduleAgentEmit(emitAgent ?? null)
  if (timer) return
  void runTick()
  timer = setInterval(() => {
    void runTick()
  }, TICK_INTERVAL_MS)
  if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
    ;(timer as { unref: () => void }).unref()
  }
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  setScheduleEventSink(null)
  setScheduleConfirmWaiter(null)
  setScheduleAgentEmit(null)
}

async function runTick(): Promise<void> {
  try {
    void listScheduleTasks()
    await checkCalendarTasks()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[shy:schedule] 定时任务 tick 失败：${message}`)
  }
}
