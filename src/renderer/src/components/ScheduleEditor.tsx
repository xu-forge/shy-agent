import type { WorkflowSchedule } from '../../../shared/ipc'
import { Field, NumberInput, Select, Switch, TimePicker } from './ui'

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

const FREQUENCY_OPTIONS = [
  { value: 'hourly', label: '每小时' },
  { value: 'daily', label: '每天' },
  { value: 'weekdays', label: '工作日' },
  { value: 'weekly', label: '每周（选星期）' },
  { value: 'monthly', label: '每月（选日）' }
]

export function ScheduleEditor({ schedule, onChange }: Props): React.JSX.Element {
  const set = (patch: Partial<WorkflowSchedule>): void => {
    onChange({ ...schedule, ...patch })
  }

  const toggleDay = (d: number): void => {
    const cur = schedule.weekdays ?? []
    const next = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()
    set({ weekdays: next })
  }

  const showTime =
    schedule.frequency === 'daily' ||
    schedule.frequency === 'weekdays' ||
    schedule.frequency === 'weekly' ||
    schedule.frequency === 'monthly'

  return (
    <div className="schedule-editor ui-form-section">
      <div className="schedule-editor-top">
        <Switch
          checked={!!schedule.enabled}
          onChange={(enabled) => set({ enabled })}
          label="启用定时执行"
        />
        <span className={`schedule-state-chip${schedule.enabled ? '' : ' off'}`}>
          {schedule.enabled ? '到点自动触发' : '已暂停，不会触发'}
        </span>
      </div>

      <div className="ui-form-grid">
        <Field label="频率">
          <Select
            value={schedule.frequency}
            options={FREQUENCY_OPTIONS}
            onChange={(frequency) => set({ frequency: frequency as WorkflowSchedule['frequency'] })}
            ariaLabel="重复频率"
          />
        </Field>

        {showTime ? (
          <Field label="时间">
            <TimePicker
              value={schedule.time ?? '09:00'}
              onChange={(time) => set({ time: time || '09:00' })}
              ariaLabel="触发时间"
            />
          </Field>
        ) : null}

        {schedule.frequency === 'hourly' ? (
          <Field label="每小时第几分钟">
            <NumberInput
              value={schedule.minute ?? 0}
              min={0}
              max={59}
              ariaLabel="每小时第几分钟"
              onChange={(minute) => set({ minute })}
            />
          </Field>
        ) : null}

        {schedule.frequency === 'monthly' ? (
          <Field label="每月几号" hint="2 月等短月不存在该日期时，当月跳过。">
            <NumberInput
              value={schedule.dayOfMonth ?? 1}
              min={1}
              max={31}
              ariaLabel="每月几号"
              onChange={(dayOfMonth) => set({ dayOfMonth })}
            />
          </Field>
        ) : null}

        {schedule.frequency === 'weekly' || schedule.frequency === 'weekdays' ? (
          <div className="ui-field-full">
            <Field
              label="选择星期"
              hint={
                schedule.frequency === 'weekdays'
                  ? '工作日默认周一至周五；如需自定义，改用「每周」并勾选。'
                  : undefined
              }
            >
              <div className="ui-days" role="group" aria-label="选择星期">
                {WEEKDAYS.map((d) => (
                  <button
                    key={d.v}
                    type="button"
                    className={`ui-day${(schedule.weekdays ?? []).includes(d.v) ? ' on' : ''}`}
                    aria-pressed={(schedule.weekdays ?? []).includes(d.v)}
                    onClick={() => toggleDay(d.v)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        ) : null}
      </div>
    </div>
  )
}
