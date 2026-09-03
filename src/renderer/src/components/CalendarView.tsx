import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CreateScheduleTaskInput,
  ScheduleAgentMode,
  ScheduleConflictWarning,
  ScheduleOccurrence,
  ScheduleRun,
  ScheduleTask,
  ScheduleTaskAction,
  SkillSummary,
  UpdateScheduleTaskInput,
  WorkflowSchedule
} from '../../../shared/ipc'
import { groupOccurrencesByDay } from '../lib/calendarOccurrences'
import {
  type ScheduleViewMode,
  formatRangeTitle,
  rangeBounds,
  scheduleRunKey
} from '../lib/calendarScheduleUi'
import { ScheduleEditor } from './ScheduleEditor'
import { ScheduleMonthView } from './schedule/ScheduleMonthView'
import { ScheduleOccurrenceDetail } from './schedule/ScheduleOccurrenceDetail'
import { ScheduleRunResultModal } from './schedule/ScheduleRunResultModal'
import { ScheduleWeekView } from './schedule/ScheduleWeekView'
import { Field, Input, Modal, Select, TextArea } from './ui'

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
  agentMode: ScheduleAgentMode
  allowAutoConfirm: boolean
  projectId: string | null
  model: string | null
}

function emptyForm(date: Date, skills: SkillSummary[]): FormState {
  return {
    title: '',
    action: 'remind',
    message: '',
    skillId: skills[0]?.id ?? '',
    schedule: defaultSchedule(date),
    agentMode: 'goal',
    allowAutoConfirm: false,
    projectId: null,
    model: null
  }
}

function formFromTask(task: ScheduleTask): FormState {
  return {
    id: task.id,
    title: task.title,
    action: task.action,
    message: task.action === 'remind' ? task.payload.message : '',
    skillId: task.action === 'run_skill' ? task.payload.skillId : '',
    schedule: task.schedule,
    agentMode: task.agentMode ?? 'goal',
    allowAutoConfirm: Boolean(task.allowAutoConfirm),
    projectId: task.projectId ?? null,
    model: task.model ?? null
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

type RangeData = {
  tasks: ScheduleTask[]
  warnings: ScheduleConflictWarning[]
  occurrences: ScheduleOccurrence[]
  runs: ScheduleRun[]
}

async function fetchRangeData(start: Date, end: Date): Promise<RangeData> {
  const [listResult, occs, runs] = await Promise.all([
    window.shy.scheduleTasksList(),
    window.shy.scheduleTasksExpand({
      rangeStart: start.toISOString(),
      rangeEnd: end.toISOString()
    }),
    window.shy.scheduleRunsList({
      rangeStart: start.toISOString(),
      rangeEnd: end.toISOString()
    })
  ])
  return {
    tasks: listResult.tasks,
    warnings: listResult.warnings,
    occurrences: occs,
    runs
  }
}

type Props = {
  onContinueSession?: (sessionId: string) => void
}

export function CalendarView({ onContinueSession }: Props): React.JSX.Element {
  const now = new Date()
  const [viewMode, setViewMode] = useState<ScheduleViewMode>('month')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [weekAnchor, setWeekAnchor] = useState(() => new Date())
  const [tasks, setTasks] = useState<ScheduleTask[]>([])
  const [occurrences, setOccurrences] = useState<ScheduleOccurrence[]>([])
  const [runs, setRuns] = useState<ScheduleRun[]>([])
  const [warnings, setWarnings] = useState<ScheduleConflictWarning[]>([])
  const [skills, setSkills] = useState<SkillSummary[]>([])
  const [form, setForm] = useState<FormState | null>(null)
  const [detailOcc, setDetailOcc] = useState<ScheduleOccurrence | null>(null)
  const [resultOcc, setResultOcc] = useState<ScheduleOccurrence | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const [isOpenCodeGo, setIsOpenCodeGo] = useState(false)
  const [goModels, setGoModels] = useState<string[]>([])

  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  const skillsById = useMemo(() => new Map(skills.map((s) => [s.id, s])), [skills])
  const occurrencesByDay = useMemo(() => groupOccurrencesByDay(occurrences), [occurrences])
  const runsByKey = useMemo(() => {
    const map = new Map<string, ScheduleRun>()
    for (const run of runs) {
      map.set(scheduleRunKey(run.taskId, run.scheduledAt), run)
    }
    return map
  }, [runs])

  const getRun = useCallback(
    (occ: ScheduleOccurrence): ScheduleRun | undefined =>
      runsByKey.get(scheduleRunKey(occ.taskId, occ.at)),
    [runsByKey]
  )

  const rangeTitle = useMemo(() => {
    if (viewMode === 'week') return formatRangeTitle('week', weekAnchor)
    return formatRangeTitle('month', new Date(year, month, 1))
  }, [viewMode, weekAnchor, year, month])

  const applyData = (data: RangeData): void => {
    setTasks(data.tasks)
    setWarnings(data.warnings)
    setOccurrences(data.occurrences)
    setRuns(data.runs)
  }

  const load = useCallback(async () => {
    const { start, end } = rangeBounds(viewMode, year, month, weekAnchor)
    applyData(await fetchRangeData(start, end))
  }, [viewMode, year, month, weekAnchor])

  useEffect(() => {
    let alive = true
    const { start, end } = rangeBounds(viewMode, year, month, weekAnchor)
    void fetchRangeData(start, end).then((data) => {
      if (alive) applyData(data)
    })
    return () => {
      alive = false
    }
  }, [viewMode, year, month, weekAnchor])

  useEffect(() => {
    void window.shy.listSkills().then(setSkills)
  }, [])

  useEffect(() => {
    let alive = true
    void window.shy.getSettings().then((s) => {
      if (!alive) return
      const go = s.provider === 'opencode-go'
      setIsOpenCodeGo(go)
      if (go) {
        void window.shy.listOpenCodeGoModels().then((r) => {
          if (alive) setGoModels(r.models)
        })
      }
    })
    return () => {
      alive = false
    }
  }, [])

  const flashNote = (text: string): void => {
    setNote(text)
    setTimeout(() => setNote((cur) => (cur === text ? '' : cur)), 6000)
  }

  const goPrev = (): void => {
    if (viewMode === 'week') {
      setWeekAnchor((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7))
      return
    }
    if (month === 0) {
      setYear((y) => y - 1)
      setMonth(11)
    } else {
      setMonth((m) => m - 1)
    }
  }

  const goNext = (): void => {
    if (viewMode === 'week') {
      setWeekAnchor((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7))
      return
    }
    if (month === 11) {
      setYear((y) => y + 1)
      setMonth(0)
    } else {
      setMonth((m) => m + 1)
    }
  }

  const goToday = (): void => {
    const t = new Date()
    setWeekAnchor(t)
    setYear(t.getFullYear())
    setMonth(t.getMonth())
  }

  const openCreate = (date: Date): void => {
    setDetailOcc(null)
    setResultOcc(null)
    setForm(emptyForm(date, skills))
  }

  const openEdit = (taskId: string): void => {
    const task = tasksById.get(taskId)
    if (task) {
      setDetailOcc(null)
      setResultOcc(null)
      setForm(formFromTask(task))
    }
  }

  const selectOccurrence = (occ: ScheduleOccurrence): void => {
    const run = getRun(occ)
    if (run) {
      setDetailOcc(null)
      setResultOcc(occ)
    } else {
      setResultOcc(null)
      setDetailOcc(occ)
    }
  }

  const saveForm = async (): Promise<void> => {
    if (!form || !canSaveForm(form)) return
    const fields = buildTaskFields(form)
    const schedule: WorkflowSchedule = { ...form.schedule, cron: '' }
    const title = form.title.trim()
    const enabled = schedule.enabled
    const policy = {
      agentMode: form.agentMode,
      allowAutoConfirm: form.allowAutoConfirm,
      projectId: form.projectId,
      model: form.model
    }

    if (form.id) {
      const patch: UpdateScheduleTaskInput = {
        title,
        enabled,
        schedule,
        ...fields,
        ...policy
      }
      await window.shy.scheduleTasksUpdate({ id: form.id, patch })
    } else {
      const input: CreateScheduleTaskInput = {
        title,
        enabled,
        schedule,
        ...fields,
        ...policy
      }
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

  const detailTask = detailOcc ? tasksById.get(detailOcc.taskId) : undefined
  const detailSkillName =
    detailTask && detailTask.action === 'run_skill'
      ? skillsById.get(detailTask.payload.skillId)?.name
      : undefined

  const resultTask = resultOcc ? tasksById.get(resultOcc.taskId) : undefined
  const resultRun = resultOcc ? getRun(resultOcc) : undefined

  return (
    <div className="main pane calendar-view">
      <div className="pane-frame calendar-frame">
        <div className="pane-header sch-page-header">
          <div className="sch-page-header-text">
            <h1>定时任务</h1>
            <p className="muted">无需人工介入，到点自动执行本机任务</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => openCreate(new Date())}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            新建
          </button>
        </div>

        <div className="calendar-toolbar sch-toolbar">
          <div className="calendar-nav">
            <span className="calendar-title">{rangeTitle}</span>
            <button type="button" className="cal-nav-btn" aria-label="上一段" onClick={goPrev}>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M10 3.5 5.5 8l4.5 4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button type="button" className="cal-nav-btn" aria-label="下一段" onClick={goNext}>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M6 3.5 10.5 8 6 12.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button type="button" className="btn btn-ghost" onClick={goToday}>
              今天
            </button>
          </div>
          <div className="sch-view-toggle" role="group" aria-label="视图">
            <button
              type="button"
              className={viewMode === 'week' ? 'active' : ''}
              aria-pressed={viewMode === 'week'}
              onClick={() => {
                setWeekAnchor(new Date(year, month, Math.min(28, new Date().getDate())))
                setViewMode('week')
              }}
            >
              周
            </button>
            <button
              type="button"
              className={viewMode === 'month' ? 'active' : ''}
              aria-pressed={viewMode === 'month'}
              onClick={() => {
                setYear(weekAnchor.getFullYear())
                setMonth(weekAnchor.getMonth())
                setViewMode('month')
              }}
            >
              月
            </button>
          </div>
        </div>

        <p className="calendar-hint">
          提示：月视图中拖拽任务到其他日期会更新整个重复系列的调度，而非仅当天这一次。点击实例可查看详情。
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

        {viewMode === 'week' ? (
          <ScheduleWeekView
            weekAnchor={weekAnchor}
            occurrencesByDay={occurrencesByDay}
            tasksById={tasksById}
            getRun={getRun}
            onSelectOccurrence={selectOccurrence}
            onEmptyDay={openCreate}
          />
        ) : (
          <ScheduleMonthView
            year={year}
            month={month}
            occurrencesByDay={occurrencesByDay}
            tasksById={tasksById}
            getRun={getRun}
            dragOverKey={dragOverKey}
            onSelectOccurrence={selectOccurrence}
            onEmptyDay={openCreate}
            onDragStart={handleDragStart}
            onDragOverKey={setDragOverKey}
            onDrop={(e, date) => void handleDrop(e, date)}
          />
        )}
      </div>

      {detailOcc ? (
        <ScheduleOccurrenceDetail
          occurrence={detailOcc}
          task={detailTask}
          skillName={detailSkillName}
          onClose={() => setDetailOcc(null)}
          onOpenTask={() => openEdit(detailOcc.taskId)}
        />
      ) : null}

      {resultOcc && resultRun ? (
        <ScheduleRunResultModal
          occurrence={resultOcc}
          run={resultRun}
          task={resultTask}
          onClose={() => setResultOcc(null)}
          onOpenTask={() => openEdit(resultOcc.taskId)}
          onContinueSession={onContinueSession}
        />
      ) : null}

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
              agentMode={form.agentMode}
              allowAutoConfirm={form.allowAutoConfirm}
              projectId={form.projectId}
              model={form.model}
              showModelPicker={isOpenCodeGo}
              modelOptions={goModels}
              onPolicyChange={(patch) => setForm({ ...form, ...patch })}
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
