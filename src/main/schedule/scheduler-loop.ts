import { checkCalendarTasks, setScheduleEventSink, type ScheduleEventSink } from './runner'
import { listScheduleTasks } from './store'

const TICK_INTERVAL_MS = 30_000

let timer: NodeJS.Timeout | null = null

/**
 * 启动一个轻量循环，每 30s 调用一次 checkCalendarTasks。
 * workflow 砍掉后不再做工作流调度——只剩 calendar task 检查。
 */
export function startScheduler(emitSchedule?: ScheduleEventSink): void {
  setScheduleEventSink(emitSchedule ?? null)
  if (timer) return
  // 启动时立即跑一次；后续每 30s 一次。
  void runTick()
  timer = setInterval(() => {
    void runTick()
  }, TICK_INTERVAL_MS)
  // 防止 Node 退出时悬挂 timer。
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
}

async function runTick(): Promise<void> {
  try {
    // 触发一次列表读取确保 store 已初始化，并喂给 runner。
    void listScheduleTasks()
    await checkCalendarTasks()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[shy:schedule] 定时任务 tick 失败：${message}`)
  }
}
