import type { ScheduleOccurrence, ScheduleRun, ScheduleTask } from '../../../../shared/ipc'
import { dayKey } from '../../lib/calendarOccurrences'
import {
  WEEKDAY_LABELS_MON,
  buildMondayGrid,
  formatOccTime,
  occurrenceStatus
} from '../../lib/calendarScheduleUi'

type Props = {
  year: number
  month: number
  occurrencesByDay: Map<string, ScheduleOccurrence[]>
  tasksById: Map<string, ScheduleTask>
  getRun?: (occ: ScheduleOccurrence) => ScheduleRun | null | undefined
  dragOverKey: string | null
  onSelectOccurrence: (occ: ScheduleOccurrence) => void
  onEmptyDay: (date: Date) => void
  onDragStart: (e: React.DragEvent<HTMLButtonElement>, taskId: string) => void
  onDragOverKey: (key: string | null) => void
  onDrop: (e: React.DragEvent<HTMLDivElement>, date: Date) => void
}

export function ScheduleMonthView({
  year,
  month,
  occurrencesByDay,
  tasksById,
  getRun,
  dragOverKey,
  onSelectOccurrence,
  onEmptyDay,
  onDragStart,
  onDragOverKey,
  onDrop
}: Props): React.JSX.Element {
  const grid = buildMondayGrid(year, month)
  const todayKey = dayKey(new Date())
  const now = new Date()

  return (
    <div className="sch-month" aria-label="月视图">
      <div className="sch-month-weekdays">
        {WEEKDAY_LABELS_MON.map((label) => (
          <div key={label} className="sch-month-weekday">
            {label}
          </div>
        ))}
      </div>
      <div className="sch-month-grid">
        {grid.map((date) => {
          const key = dayKey(date)
          const inMonth = date.getMonth() === month
          const isToday = key === todayKey
          const dayOccs = occurrencesByDay.get(key) ?? []
          return (
            <div
              key={key}
              className={`sch-month-cell${inMonth ? '' : ' is-outside'}${isToday ? ' is-today' : ''}${
                dragOverKey === key ? ' is-dragover' : ''
              }`}
              onClick={() => onEmptyDay(date)}
              onDragOver={(e) => {
                e.preventDefault()
                onDragOverKey(key)
              }}
              onDragLeave={() => onDragOverKey(dragOverKey === key ? null : dragOverKey)}
              onDrop={(e) => onDrop(e, date)}
            >
              <div className="sch-month-date">{date.getDate()}</div>
              <div className="sch-month-chips">
                {dayOccs.map((occ) => {
                  const task = tasksById.get(occ.taskId)
                  const status = occurrenceStatus(occ, task, now, getRun?.(occ))
                  return (
                    <button
                      key={`${occ.taskId}-${occ.at}`}
                      type="button"
                      draggable
                      className={`sch-month-chip status-${status}${task && !task.enabled ? ' is-disabled' : ''}`}
                      title={occ.title}
                      onDragStart={(e) => onDragStart(e, occ.taskId)}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectOccurrence(occ)
                      }}
                    >
                      <span className="sch-month-chip-time">{formatOccTime(occ.at)}</span>
                      <span className="sch-month-chip-title">{occ.title}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
