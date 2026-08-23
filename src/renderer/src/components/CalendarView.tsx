import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CreateScheduleTaskInput,
  ScheduleConflictWarning,
  ScheduleOccurrence,
  ScheduleTask,
  ScheduleTaskAction,
  SkillSummary,
  UpdateScheduleTaskInput,
  WorkflowSchedule
} from '../../../shared/ipc'
import { dayKey, groupOccurrencesByDay } from '../lib/calendarOccurrences'
import { ScheduleEditor } from './ScheduleEditor'
import { Field, Input, Modal, Select, TextArea } from './ui'

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

/** 6 周 × 7 天的月历网格，含首尾月溢出的日期 */
function buildGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const gridStart = new Date(year, month, 1 - first.getDay())
  return Array.from(
    { length: 42 },
    (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i)
  )
}

function defaultSchedule(date: Date): WorkflowSchedule {
  return {
    enabled: true,
    frequency: 'weekly',
    time: '09:00',
    weekdays: [date.getDay()],
    dayOfMonth: date.getDate(),
    minute: 0,
    cron: ''
  }
}

type FormState = {
  id?: string
  title: string
  action: ScheduleTaskAction
  message: string
  skillId: string
  schedule: WorkflowSchedule
}

function emptyForm(date: Date, skills: SkillSummary[]): FormState {
  return {
    title: '',
    action: 'remind',
    message: '',
    skillId: skills[0]?.id ?? '',
    schedule: defaultSchedule(date)
  }
}

function formFromTask(task: ScheduleTask): FormState {
  return {
    id: task.id,
    title: task.title,
    action: task.action,
    message: task.action === 'remind' ? task.payload.message : '',
    skillId: task.action === 'run_skill' ? task.payload.skillId : '',
    schedule: task.schedule
  }
}

function buildTaskFields(form: FormState): Pick<ScheduleTask, 'action' | 'payload'> {
  switch (form.action) {
    case 'run_skill':
      return { action: 'run_skill', payload: { skillId: form.skillId } }
    case 'remind':
    default:
      return { action: 'remind', payload: { message: form.message.trim() } }
  }
}

function canSaveForm(form: FormState): boolean {
  if (!form.title.trim()) return false
  if (form.action === 'run_skill') return !!form.skillId
  return form.message.trim().length > 0
}

type MonthData = {
  tasks: ScheduleTask[]
  warnings: ScheduleConflictWarning[]
  occurrences: ScheduleOccurrence[]
}

async function fetchMonthData(year: number, month: number): Promise<MonthData> {
  const g = buildGrid(year, month)
  const rangeStart = g[0]!
  const last = g[g.length - 1]!
  const rangeEnd = new Date(last.getFullYear(), last.getMonth(), last.getDate(), 23, 59, 59, 999)
  const [listResult, occs] = await Promise.all([
    window.shy.scheduleTasksList(),
    window.shy.scheduleTasksExpand({
      rangeStart: rangeStart.toISOString(),
      rangeEnd: rangeEnd.toISOString()
    })
  ])
  return { tasks: listResult.tasks, warnings: listResult.warnings, occurrences: occs }
}

export function CalendarView(): React.JSX.Element {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [tasks, setTasks] = useState<ScheduleTask[]>([])
  const [occurrences, setOccurrences] = useState<ScheduleOccurrence[]>([])
  const [warnings, setWarnings] = useState<ScheduleConflictWarning[]>([])
  const [skills, setSkills] = useState<SkillSummary[]>([])
  const [form, setForm] = useState<FormState | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)

  const grid = useMemo(() => buildGrid(year, month), [year, month])
  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])

  const occurrencesByDay = useMemo(() => groupOccurrencesByDay(occurrences), [occurrences])

  const applyMonthData = (data: MonthData): void => {
    setTasks(data.tasks)
    setWarnings(data.warnings)
    setOccurrences(data.occurrences)
  }

  const load = useCallback(async () => {
    applyMonthData(await fetchMonthData(year, month))
  }, [year, month])

  useEffect(() => {
    let alive = true
    void fetchMonthData(year, month).then((data) => {
      if (alive) applyMonthData(data)
    })
    return () => {
      alive = false
    }
  }, [year, month])

  useEffect(() => {
    void window.shy.listSkills().then(setSkills)
  }, [])

  const flashNote = (text: string): void => {
    setNote(text)
    setTimeout(() => setNote((cur) => (cur === text ? '' : cur)), 6000)
  }

  const goPrevMonth = (): void => {
    if (month === 0) {
      setYear((y) => y - 1)
      setMonth(11)
    } else {
      setMonth((m) => m - 1)
    }
  }

  const goNextMonth = (): void => {
    if (month === 11) {
      setYear((y) => y + 1)
      setMonth(0)
    } else {
      setMonth((m) => m + 1)
    }
  }

  const goToday = (): void => {
    const t = new Date()
    setYear(t.getFullYear())
    setMonth(t.getMonth())
  }

  const openCreate = (date: Date): void => {
    setForm(emptyForm(date, skills))
  }

  const openEdit = (taskId: string): void => {
    const task = tasksById.get(taskId)
    if (task) setForm(formFromTask(task))
  }

  const saveForm = async (): Promise<void> => {
    if (!form || !canSaveForm(form)) return
    const fields = buildTaskFields(form)
    const schedule: WorkflowSchedule = { ...form.schedule, cron: '' }
    const title = form.title.trim()
    const enabled = schedule.enabled

    if (form.id) {
      const patch: UpdateScheduleTaskInput = { title, enabled, schedule, ...fields }
      await window.shy.scheduleTasksUpdate({ id: form.id, patch })
    } else {
      const input: CreateScheduleTaskInput = { title, enabled, schedule, ...fields }
      await window.shy.scheduleTasksCreate(input)
    }
    setForm(null)
    await load()
  }

  const deleteTask = async (id: string): Promise<void> => {
    await window.shy.scheduleTasksDelete(id)
    setConfirmDeleteId(null)
    setForm(null)
    await load()
  }

  const handleDragStart = (e: React.DragEvent<HTMLButtonElement>, taskId: string): void => {
    e.dataTransfer.setData('text/plain', taskId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, date: Date): Promise<void> => {
    e.preventDefault()
    setDragOverKey(null)
    const taskId = e.dataTransfer.getData('text/plain')
    const task = tasksById.get(taskId)
    if (!task) return

    if (task.schedule.frequency !== 'weekly' && task.schedule.frequency !== 'monthly') {
      flashNote('每天 / 工作日 / 每小时类型按固定周期重复，拖拽不会改变落点。')
      return
    }

    const schedule: WorkflowSchedule = { ...task.schedule, cron: '' }
    if (schedule.frequency === 'weekly') schedule.weekdays = [date.getDay()]
    if (schedule.frequency === 'monthly') schedule.dayOfMonth = date.getDate()

    await window.shy.scheduleTasksUpdate({ id: taskId, patch: { schedule } })
    flashNote(
      `已将「${task.title}」的调度更新为落在 ${date.getMonth() + 1} 月 ${date.getDate()} 日对应的规律——拖拽会改变整个重复系列，而不仅是这一天。`
    )
    await load()
  }

  const todayKey = dayKey(new Date())

  return (
    <div className="main pane calendar-view">
      <div className="pane-frame calendar-frame">
        <div className="pane-header">
          <h1>定时任务</h1>
          <p className="muted">
            按月查看定时任务的展开实例；点击空白日期新建，点击任务卡片编辑，拖拽卡片可调整整个系列的落点。
          </p>
        </div>

        <div className="calendar-toolbar">
          <div className="calendar-nav">
            <button
              type="button"
              className="cal-nav-btn"
              aria-label="上一月"
              onClick={goPrevMonth}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span className="calendar-title">
              {year} 年 {month + 1} 月
            </span>
            <button
              type="button"
              className="cal-nav-btn"
              aria-label="下一月"
              onClick={goNextMonth}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button type="button" className="btn btn-ghost" onClick={goToday}>
              回到今天
            </button>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => openCreate(new Date())}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            新建任务
          </button>
        </div>

        <p className="calendar-hint">
          提示：拖拽任务卡片到其他日期会更新整个重复系列的调度时间，而非仅当天这一次。
        </p>

        {warnings.length > 0 ? (
          <div className="calendar-warning-banner" role="status">
            <span className="calendar-warning-icon" aria-hidden="true">
              ⚠
            </span>
            <ul>
              {warnings.map((w, i) => (
                <li key={`${w.taskId}-${i}`}>{w.message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {note ? (
          <p className="calendar-note" role="status">
            {note}
          </p>
        ) : null}

        <div className="calendar-grid" aria-label="月历网格">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="calendar-weekday">
              {label}
            </div>
          ))}
          {grid.map((date) => {
            const key = dayKey(date)
            const inMonth = date.getMonth() === month
            const isToday = key === todayKey
            const dayOccs = occurrencesByDay.get(key) ?? []
            return (
              <div
                key={key}
                className={`calendar-cell${inMonth ? '' : ' calendar-cell-outside'}${isToday ? ' calendar-cell-today' : ''}${dragOverKey === key ? ' calendar-cell-dragover' : ''}`}
                onClick={() => openCreate(date)}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOverKey(key)
                }}
                onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
                onDrop={(e) => void handleDrop(e, date)}
              >
                <div className="calendar-cell-date">{date.getDate()}</div>
                <div className="calendar-cell-chips">
                  {dayOccs.map((occ) => {
                    const task = tasksById.get(occ.taskId)
                    return (
                      <button
                        key={`${occ.taskId}-${occ.at}`}
                        type="button"
                        draggable
                        className={`calendar-chip calendar-chip-${occ.action}${task && !task.enabled ? ' calendar-chip-disabled' : ''}`}
                        onDragStart={(e) => handleDragStart(e, occ.taskId)}
                        onClick={(e) => {
                          e.stopPropagation()
                          openEdit(occ.taskId)
                        }}
                        title={occ.title}
                      >
                        <span className="calendar-chip-time">
                          {new Date(occ.at).toLocaleTimeString('zh-CN', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                        <span className="calendar-chip-title">{occ.title}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {form ? (
        <Modal
          title={form.id ? '编辑任务' : '新建任务'}
          subtitle={form.id ? '调整后从下一次触发开始生效。' : '到点后按下面的动作自动执行。'}
          onClose={() => setForm(null)}
          footer={
            <>
              {form.id ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => setConfirmDeleteId(form.id!)}
                >
                  删除
                </button>
              ) : null}
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canSaveForm(form)}
                onClick={() => void saveForm()}
              >
                保存
              </button>
            </>
          }
        >
          <div className="ui-form-section">
            <Field label="标题">
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="例如：每周晨报"
                autoFocus
              />
            </Field>
            <Field label="到点动作">
              <Select
                value={form.action}
                options={[
                  { value: 'remind', label: '提醒（应用内通知）' },
                  { value: 'run_skill', label: '运行技能' }
                ]}
                onChange={(action) =>
                  setForm({ ...form, action: action as ScheduleTaskAction })
                }
                ariaLabel="到点动作"
              />
            </Field>
            {form.action === 'remind' ? (
              <Field label="提醒内容">
                <TextArea
                  rows={3}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="到点后会在应用中看到该文案"
                />
              </Field>
            ) : null}
            {form.action === 'run_skill' ? (
              <Field
                label="选择技能"
                hint={skills.length === 0 ? '还没有技能，可先去「技能」页创建。' : undefined}
              >
                <Select
                  value={form.skillId}
                  placeholder="请选择…"
                  options={skills.map((s) => ({ value: s.id, label: s.name }))}
                  onChange={(skillId) => setForm({ ...form, skillId })}
                  ariaLabel="选择技能"
                />
              </Field>
            ) : null}
          </div>
          <div className="ui-form-section">
            <div className="ui-form-section-title">重复规则</div>
            <ScheduleEditor
              schedule={form.schedule}
              onChange={(schedule) => setForm({ ...form, schedule })}
            />
          </div>
        </Modal>
      ) : null}

      {confirmDeleteId ? (
        <Modal
          danger
          title="删除任务"
          subtitle="删除后不可恢复，日历将不再展示该任务的实例。"
          closeOnBackdrop={false}
          onClose={() => setConfirmDeleteId(null)}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setConfirmDeleteId(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void deleteTask(confirmDeleteId)}
              >
                删除
              </button>
            </>
          }
        >
          <p className="calendar-confirm-text">
            确认删除「{tasksById.get(confirmDeleteId)?.title ?? confirmDeleteId}」？
          </p>
        </Modal>
      ) : null}
    </div>
  )
}
