import type { ScheduleOccurrence } from '../../../shared/ipc'

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function groupOccurrencesByDay(
  occurrences: ScheduleOccurrence[]
): Map<string, ScheduleOccurrence[]> {
  const map = new Map<string, ScheduleOccurrence[]>()
  for (const occ of occurrences) {
    const key = dayKey(new Date(occ.at))
    const dayOccurrences = map.get(key)
    if (dayOccurrences) dayOccurrences.push(occ)
    else map.set(key, [occ])
  }
  for (const dayOccurrences of map.values()) {
    dayOccurrences.sort((a, b) => a.at.localeCompare(b.at))
  }
  return map
}
