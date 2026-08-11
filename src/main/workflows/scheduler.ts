import type { WorkflowSchedule } from '../../shared/ipc'

/** 把交互式 schedule 编译成 cron 表达式 */
export function compileCron(s: WorkflowSchedule): string {
  switch (s.frequency) {
    case 'hourly':
      return `${s.minute ?? 0} * * * *`
    case 'daily':
      return `${minuteOf(s.time)} ${hourOf(s.time)} * * *`
    case 'weekdays': {
      const days = s.weekdays?.length ? s.weekdays.join(',') : '1-5'
      return `${minuteOf(s.time)} ${hourOf(s.time)} * * ${days}`
    }
    case 'weekly': {
      const days = s.weekdays?.length ? s.weekdays.join(',') : '1'
      return `${minuteOf(s.time)} ${hourOf(s.time)} * * ${days}`
    }
    case 'monthly':
      return `${minuteOf(s.time)} ${hourOf(s.time)} ${s.dayOfMonth ?? 1} * *`
    default:
      return `0 9 * * *`
  }
}

function minuteOf(time: string): number {
  const m = Number(time?.split(':')[1])
  return Number.isFinite(m) ? m : 0
}
function hourOf(time: string): number {
  const h = Number(time?.split(':')[0])
  return Number.isFinite(h) ? h : 9
}

/** 是否匹配当前时间（分钟级精度） */
export function cronMatches(cron: string, date = new Date()): boolean {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return false
  const [min, hour, dom, mon, dow] = parts
  const m = date.getMinutes()
  const h = date.getHours()
  const d = date.getDate()
  const mo = date.getMonth() + 1
  const dw = date.getDay()
  return (
    fieldMatch(min, m) &&
    fieldMatch(hour, h) &&
    fieldMatch(dom, d) &&
    fieldMatch(mon, mo) &&
    fieldMatch(dow, dw)
  )
}

function fieldMatch(pattern: string, value: number): boolean {
  if (pattern === '*') return true
  return pattern.split(',').some((p) => {
    if (p.includes('-')) {
      const [a, b] = p.split('-').map(Number)
      return value >= a && value <= b
    }
    if (p.includes('/')) {
      const [base, step] = p.split('/')
      if (base === '*' || base === '') return value % Number(step) === 0
      const start = Number(base)
      return value >= start && (value - start) % Number(step) === 0
    }
    return Number(p) === value
  })
}

/** 计算距下一次匹配的毫秒数（最多扫 8 天） */
export function msUntilNext(cron: string, from = new Date()): number {
  for (let i = 1; i <= 60 * 24 * 8; i++) {
    const d = new Date(from.getTime() + i * 60_000)
    if (cronMatches(cron, d)) return i * 60_000
  }
  return -1
}
