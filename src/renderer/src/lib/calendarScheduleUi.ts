import type { ScheduleOccurrence, ScheduleTask, WorkflowSchedule } from '../../../shared/ipc'

export type ScheduleViewMode = 'week' | 'month'

export type OccurrenceStatus = 'pending' | 'paused' | 'past'

export const WEEKDAY_LABELS_MON = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** JS getDay(): 0=Sun … 6=Sat → Monday-based index 0=Mon … 6=Sun */
export function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7
}

/** 含 date 的那一周的周一 00:00 */
export function startOfWeekMonday(date: Date): Date {
  const d = startOfDay(date)
  d.setDate(d.getDate() - mondayIndex(d))
  return d
}

export function endOfWeekSunday(date: Date): Date {
  const start = startOfWeekMonday(date)
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59, 999)
}

/** 周一至周日共 7 天（各为本地 00:00） */
export function weekDays(date: Date): Date[] {
  const start = startOfWeekMonday(date)
  return Array.from(
    { length: 7 },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
  )
}

/** 6×7 月历网格，周一为一周之始 */
export function buildMondayGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const gridStart = new Date(year, month, 1 - mondayIndex(first))
  return Array.from(
    { length: 42 },
    (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i)
  )
}

export function occurrenceStatus(
  occ: Pick<ScheduleOccurrence, 'at'>,
  task: Pick<ScheduleTask, 'enabled'> | undefined,
  now: Date = new Date()
): OccurrenceStatus {
  if (task && !task.enabled) return 'paused'
  const t = Date.parse(occ.at)
  if (!Number.isNaN(t) && t < now.getTime()) return 'past'
  return 'pending'
}

export function occurrenceStatusLabel(status: OccurrenceStatus): string {
  switch (status) {
    case 'paused':
      return '已暂停'
    case 'past':
      return '已过期'
    default:
      return '待执行'
  }
}

const WEEKDAY_SHORT = ['日', '一', '二', '三', '四', '五', '六']

export function formatScheduleLabel(schedule: WorkflowSchedule): string {
  const time = schedule.time?.trim() || '09:00'
  switch (schedule.frequency) {
    case 'hourly':
      return `每小时 第 ${schedule.minute ?? 0} 分`
    case 'daily':
      return `每天 ${time}`
    case 'weekdays':
      return `工作日 ${time}`
    case 'weekly': {
      const days = [...(schedule.weekdays ?? [])].sort((a, b) => a - b)
      if (days.length === 0) return `每周 ${time}`
      const labels = days.map((d) => WEEKDAY_SHORT[d] ?? String(d)).join('、')
      return `每周${labels} ${time}`
    }
    case 'monthly':
      return `每月 ${schedule.dayOfMonth || 1} 日 ${time}`
    default:
      return time
  }
}

export function formatOccTime(at: string): string {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return ''
  const h = d.getHours()
  const m = d.getMinutes()
  return `${h < 10 ? `0${h}` : h}:${m < 10 ? `0${m}` : m}`
}

export function formatRangeTitle(viewMode: ScheduleViewMode, anchor: Date): string {
  if (viewMode === 'month') {
    return `${anchor.getFullYear()}年${anchor.getMonth() + 1}月`
  }
  const days = weekDays(anchor)
  const a = days[0]!
  const b = days[6]!
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
  if (sameMonth) {
    return `${a.getFullYear()}年${a.getMonth() + 1}月${a.getDate()}日 - ${b.getDate()}日`
  }
  if (a.getFullYear() === b.getFullYear()) {
    return `${a.getFullYear()}年${a.getMonth() + 1}月${a.getDate()}日 - ${b.getMonth() + 1}月${b.getDate()}日`
  }
  return `${a.getFullYear()}年${a.getMonth() + 1}月${a.getDate()}日 - ${b.getFullYear()}年${b.getMonth() + 1}月${b.getDate()}日`
}

export function rangeBounds(
  viewMode: ScheduleViewMode,
  year: number,
  month: number,
  weekAnchor: Date
): { start: Date; end: Date } {
  if (viewMode === 'week') {
    return { start: startOfWeekMonday(weekAnchor), end: endOfWeekSunday(weekAnchor) }
  }
  const grid = buildMondayGrid(year, month)
  const first = grid[0]!
  const last = grid[grid.length - 1]!
  return {
    start: startOfDay(first),
    end: new Date(last.getFullYear(), last.getMonth(), last.getDate(), 23, 59, 59, 999)
  }
}
