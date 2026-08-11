import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CreateScheduleTaskInput,
  ScheduleConflictWarning,
  ScheduleOccurrence,
  ScheduleReminderEvent,
  ScheduleTask,
  ScheduleTaskAction,
  SkillSummary,
  UpdateScheduleTaskInput,
  Workflow,
  WorkflowSchedule
} from '../../../shared/ipc'
import { WorkflowScheduleEditor } from './WorkflowScheduleEditor'

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

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
  workflowId: string
  message: string
  skillId: string
  schedule: WorkflowSchedule
}

function emptyForm(date: Date, workflows: Workflow[], skills: SkillSummary[]): FormState {
  return {
    title: '',
    action: 'remind',
    workflowId: workflows[0]?.id ?? '',
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
    workflowId: task.action === 'run_workflow' ? task.payload.workflowId : '',
    message: task.action === 'remind' ? task.payload.message : '',
    skillId: task.action === 'run_skill' ? task.payload.skillId : '',
    schedule: task.schedule
  }
}

function buildTaskFields(form: FormState): Pick<ScheduleTask, 'action' | 'payload'> {
  switch (form.action) {
    case 'run_workflow':
      return { action: 'run_workflow', payload: { workflowId: form.workflowId } }
    case 'run_skill':
      return { action: 'run_skill', payload: { skillId: form.skillId } }
    case 'remind':
    default:
      return { action: 'remind', payload: { message: form.message.trim() } }
  }
}

function canSaveForm(form: FormState): boolean {
  if (!form.title.trim()) return false
  if (form.action === 'run_workflow') return !!form.workflowId
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
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [skills, setSkills] = useState<SkillSummary[]>([])
  const [form, setForm] = useState<FormState | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const [reminders, setReminders] = useState<{ id: string; title: string; message: string }[]>([])

  const grid = useMemo(() => buildGrid(year, month), [year, month])
  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])

  const occurrencesByDay = useMemo(() => {
    const map = new Map<string, Map<string, ScheduleOccurrence>>()
    for (const occ of occurrences) {
      const key = dayKey(new Date(occ.at))
      let inner = map.get(key)
      if (!inner) {
        inner = new Map()
        map.set(key, inner)
      }
      const existing = inner.get(occ.taskId)
      if (!existing || occ.at < existing.at) inner.set(occ.taskId, occ)
    }
    return map
  }, [occurrences])

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
    void window.shy.listWorkflows().then(setWorkflows)
    void window.shy.listSkills().then(setSkills)
  }, [])

  useEffect(() => {
    return window.shy.onScheduleRemind((ev: ScheduleReminderEvent) => {
      const id = `${ev.taskId}-${ev.at}`
      setReminders((list) => [...list, { id, title: ev.title, message: ev.message }])
      setTimeout(() => setReminders((list) => list.filter((r) => r.id !== id)), 8000)
    })
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
    setForm(emptyForm(date, workflows, skills))
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
          <h1>日历</h1>
          <p className="muted">
            按月查看定时任务的展开实例；点击空白日期新建，点击任务卡片编辑，拖拽卡片可调整整个系列的落点。
          </p>
        </div>

        <div className="calendar-toolbar">
          <div className="calendar-nav">
            <button type="button" className="btn btn-ghost" onClick={goPrevMonth}>
              ‹ 上月
            </button>
            <span className="calendar-title">
              {year} 年 {month + 1} 月
            </span>
            <button type="button" className="btn btn-ghost" onClick={goNextMonth}>
              下月 ›
            </button>
            <button type="button" className="btn btn-outline" onClick={goToday}>
              回到今天
            </button>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => openCreate(new Date())}>
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
                <li key={`${w.taskId}-${w.workflowId}-${i}`}>{w.message}</li>
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
            const dayOccs = Array.from(occurrencesByDay.get(key)?.values() ?? []).sort((a, b) =>
              a.at.localeCompare(b.at)
            )
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
                        key={occ.taskId}
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
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setForm(null)
          }}
        >
          <div className="modal" role="dialog" aria-labelledby="calendar-form-title">
            <h2 id="calendar-form-title">{form.id ? '编辑任务' : '新建任务'}</h2>
            <label>
              标题
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="例如：每周晨报"
                autoFocus
              />
            </label>
            <label>
              到点动作
              <select
                value={form.action}
                onChange={(e) => setForm({ ...form, action: e.target.value as ScheduleTaskAction })}
              >
                <option value="remind">提醒</option>
                <option value="run_workflow">运行工作流</option>
                <option value="run_skill">运行技能</option>
              </select>
            </label>

            {form.action === 'remind' ? (
              <label>
                提醒内容
                <textarea
                  rows={3}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="到点后会在日历页面看到该文案"
                />
              </label>
            ) : null}

            {form.action === 'run_workflow' ? (
              <label>
                选择工作流
                <select
                  value={form.workflowId}
                  onChange={(e) => setForm({ ...form, workflowId: e.target.value })}
                >
                  <option value="">请选择…</option>
                  {workflows.map((wf) => (
                    <option key={wf.id} value={wf.id}>
                      {wf.name}
                    </option>
                  ))}
                </select>
                {workflows.length === 0 ? (
                  <p className="calendar-form-hint">还没有工作流，可先去「工作流」创建。</p>
                ) : null}
              </label>
            ) : null}

            {form.action === 'run_skill' ? (
              <label>
                选择技能
                <select
                  value={form.skillId}
                  onChange={(e) => setForm({ ...form, skillId: e.target.value })}
                >
                  <option value="">请选择…</option>
                  {skills.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {skills.length === 0 ? (
                  <p className="calendar-form-hint">还没有技能，可先去「技能」创建。</p>
                ) : null}
              </label>
            ) : null}

            <div className="section-divider">
              <h3>重复规则</h3>
            </div>
            <WorkflowScheduleEditor
              schedule={form.schedule}
              onChange={(schedule) => setForm({ ...form, schedule })}
            />

            <div className="modal-actions">
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
            </div>
          </div>
        </div>
      ) : null}

      {confirmDeleteId ? (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>删除任务</h3>
            <p>删除后不可恢复，日历将不再展示该任务的实例。</p>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setConfirmDeleteId(null)}>
                取消
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void deleteTask(confirmDeleteId)}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="calendar-toast-stack">
        {reminders.map((r) => (
          <div key={r.id} className="toast calendar-toast" role="status">
            <div>
              <strong>{r.title}</strong>
              <div className="calendar-toast-msg">{r.message}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
