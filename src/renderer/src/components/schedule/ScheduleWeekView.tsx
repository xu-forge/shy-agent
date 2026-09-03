import type { ScheduleOccurrence, ScheduleRun, ScheduleTask } from '../../../../shared/ipc'
import { dayKey } from '../../lib/calendarOccurrences'
import {
  WEEKDAY_LABELS_MON,
  formatOccTime,
  occurrenceStatus,
  occurrenceStatusLabel,
  weekDays
} from '../../lib/calendarScheduleUi'

type Props = {
  weekAnchor: Date
  occurrencesByDay: Map<string, ScheduleOccurrence[]>
  tasksById: Map<string, ScheduleTask>
  getRun?: (occ: ScheduleOccurrence) => ScheduleRun | null | undefined
  onSelectOccurrence: (occ: ScheduleOccurrence) => void
  onEmptyDay: (date: Date) => void
}

export function ScheduleWeekView({
  weekAnchor,
  occurrencesByDay,
  tasksById,
  getRun,
  onSelectOccurrence,
  onEmptyDay
}: Props): React.JSX.Element {
  const days = weekDays(weekAnchor)
  const todayKey = dayKey(new Date())
  const now = new Date()

  return (
    <div className="sch-week" aria-label="周视图">
      <div className="sch-week-head">
        {days.map((d, i) => {
          const key = dayKey(d)
          const isToday = key === todayKey
          return (
            <div key={key} className={`sch-week-col-head${isToday ? ' is-today' : ''}`}>
              <span className="sch-week-dow">{WEEKDAY_LABELS_MON[i]}</span>
              <span className="sch-week-dom">{d.getDate()}</span>
            </div>
          )
        })}
      </div>
      <div className="sch-week-body">
        {days.map((d) => {
          const key = dayKey(d)
          const isToday = key === todayKey
          const occs = occurrencesByDay.get(key) ?? []
          return (
            <div
              key={key}
              className={`sch-week-col${isToday ? ' is-today' : ''}`}
              onClick={() => onEmptyDay(d)}
            >
              {occs.map((occ) => {
                const task = tasksById.get(occ.taskId)
                const status = occurrenceStatus(occ, task, now, getRun?.(occ))
                return (
                  <button
                    key={`${occ.taskId}-${occ.at}`}
                    type="button"
                    className={`sch-week-card status-${status}`}
                    title={occ.title}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectOccurrence(occ)
                    }}
                  >
                    <div className="sch-week-card-top">
                      <span className="sch-week-card-time">{formatOccTime(occ.at)}</span>
                      <span className="sch-badge-local">本地</span>
                    </div>
                    <div className="sch-week-card-title">{occ.title}</div>
                    <div className={`sch-week-card-status status-${status}`}>
                      <span className="sch-status-dot" aria-hidden="true" />
                      {occurrenceStatusLabel(status)}
                    </div>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
