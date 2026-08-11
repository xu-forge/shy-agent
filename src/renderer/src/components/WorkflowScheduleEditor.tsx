import type { WorkflowSchedule } from '../../../shared/ipc'

type Props = {
  schedule: WorkflowSchedule
  onChange: (s: WorkflowSchedule) => void
}

const WEEKDAYS = [
  { v: 0, label: '日' },
  { v: 1, label: '一' },
  { v: 2, label: '二' },
  { v: 3, label: '三' },
  { v: 4, label: '四' },
  { v: 5, label: '五' },
  { v: 6, label: '六' }
]

export function WorkflowScheduleEditor({ schedule, onChange }: Props): React.JSX.Element {
  const set = (patch: Partial<WorkflowSchedule>): void => {
    onChange({ ...schedule, ...patch })
  }

  const toggleDay = (d: number): void => {
    const cur = schedule.weekdays ?? []
    const next = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()
    set({ weekdays: next })
  }

  return (
    <div className="schedule-editor">
      <label className="row-check">
        <input
          type="checkbox"
          checked={!!schedule.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
        />
        启用定时执行
      </label>

      <label>
        频率
        <select
          value={schedule.frequency}
          onChange={(e) => set({ frequency: e.target.value as WorkflowSchedule['frequency'] })}
        >
          <option value="hourly">每小时</option>
          <option value="daily">每天</option>
          <option value="weekdays">工作日</option>
          <option value="weekly">每周（选星期）</option>
          <option value="monthly">每月（选日）</option>
        </select>
      </label>

      {(schedule.frequency === 'daily' ||
        schedule.frequency === 'weekdays' ||
        schedule.frequency === 'weekly' ||
        schedule.frequency === 'monthly') && (
        <label>
          时间
          <input
            type="time"
            value={schedule.time ?? '09:00'}
            onChange={(e) => set({ time: e.target.value || '09:00' })}
          />
        </label>
      )}

      {schedule.frequency === 'hourly' && (
        <label>
          每小时第几分钟
          <input
            type="number"
            min={0}
            max={59}
            value={schedule.minute ?? 0}
            onChange={(e) => set({ minute: Number(e.target.value) || 0 })}
          />
        </label>
      )}

      {(schedule.frequency === 'weekly' || schedule.frequency === 'weekdays') && (
        <div className="day-picker">
          <div className="day-label">选择星期</div>
          <div className="day-buttons">
            {WEEKDAYS.map((d) => (
              <button
                key={d.v}
                type="button"
                className={`day-btn${(schedule.weekdays ?? []).includes(d.v) ? ' active' : ''}`}
                onClick={() => toggleDay(d.v)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {schedule.frequency === 'monthly' && (
        <label>
          每月几号
          <input
            type="number"
            min={1}
            max={31}
            value={schedule.dayOfMonth ?? 1}
            onChange={(e) => set({ dayOfMonth: Number(e.target.value) || 1 })}
          />
        </label>
      )}

      {schedule.frequency === 'weekdays' && (
        <p className="muted">工作日默认周一至周五；如需自定义，改用「每周」并勾选。</p>
      )}
    </div>
  )
}
