import { useEffect, useState } from 'react'
import type { Project, ScheduleAgentMode, WorkflowSchedule } from '../../../shared/ipc'
import { Field, NumberInput, Select, Switch, TimePicker } from './ui'

type Props = {
  schedule: WorkflowSchedule
  onChange: (s: WorkflowSchedule) => void
  agentMode: ScheduleAgentMode
  allowAutoConfirm: boolean
  projectId: string | null
  onPolicyChange: (patch: {
    agentMode?: ScheduleAgentMode
    allowAutoConfirm?: boolean
    projectId?: string | null
  }) => void
  /** 可选；不传则编辑器内自行 listProjects */
  projects?: Project[]
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

const AGENT_MODE_OPTIONS = [
  { value: 'goal', label: '目标模式' },
  { value: 'normal', label: '普通模式' }
]

export function ScheduleEditor({
  schedule,
  onChange,
  agentMode,
  allowAutoConfirm,
  projectId,
  onPolicyChange,
  projects: projectsProp
}: Props): React.JSX.Element {
  const [projectsLocal, setProjectsLocal] = useState<Project[]>([])
  const projects = projectsProp ?? projectsLocal

  useEffect(() => {
    if (projectsProp) return
    let alive = true
    void window.shy.listProjects().then((list) => {
      if (alive) setProjectsLocal(list)
    })
    return () => {
      alive = false
    }
  }, [projectsProp])

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

  const projectOptions = [
    { value: '', label: '未选择项目' },
    ...projects.map((p) => ({ value: p.id, label: p.name }))
  ]

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

      <div className="ui-form-section-title schedule-editor-policy-title">
        执行策略
      </div>
      <div className="ui-form-grid">
        <Field label="模式">
          <Select
            value={agentMode}
            options={AGENT_MODE_OPTIONS}
            onChange={(value) =>
              onPolicyChange({ agentMode: value as ScheduleAgentMode })
            }
            ariaLabel="Agent 模式"
          />
        </Field>
        <Field label="所属项目">
          <Select
            value={projectId ?? ''}
            options={projectOptions}
            onChange={(value) => onPolicyChange({ projectId: value || null })}
            ariaLabel="所属项目"
          />
        </Field>
        <div className="ui-field-full">
          <Field
            label="高危确认"
            hint="关闭时，删除等操作仍会弹窗确认；开启后定时跑技能可自动通过确认闸门。"
          >
            <Switch
              checked={allowAutoConfirm}
              onChange={(checked) => onPolicyChange({ allowAutoConfirm: checked })}
              label="允许自动确认高危"
            />
          </Field>
        </div>
      </div>
    </div>
  )
}
