/**
 * Inspector Panel — minimax 布局的右侧面板。
 *
 * 3 个 tab 实时显示当前 session 的状态:
 * - 任务 (Tasks)     — 当前 session 的 session_tasks,含 done/pending 进度
 * - 记忆 (Memory)    — 长期记忆条目数 + 最近 5 条标题
 * - 技能 (Skills)    — 本地技能包列表
 *
 * Stage 4.1 最小可用版:
 * - 复用现有 IPC API (listSessionTasks / listMemory / listSkills)
 * - 自动刷新:每 5s poll 一次（避免实时订阅复杂度）
 * - 选中 sessionId 变化时立即重拉
 * - 空数据时给友好提示
 */
import { useEffect, useState } from 'react'
import type { SessionTaskRecord, LongMemoryEntry, SkillSummary } from '../../../shared/ipc'

type Tab = 'tasks' | 'memory' | 'skills'

type Props = {
  sessionId: string
}

const POLL_INTERVAL_MS = 5_000

export function InspectorPanel({ sessionId }: Props): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('tasks')
  const [tasks, setTasks] = useState<SessionTaskRecord[]>([])
  const [memories, setMemories] = useState<LongMemoryEntry[]>([])
  const [skills, setSkills] = useState<SkillSummary[]>([])
  const [loading, setLoading] = useState(true)

  // 加载 + 自动刷新
  useEffect(() => {
    let alive = true
    const load = async (): Promise<void> => {
      try {
        const [t, m, s] = await Promise.all([
          sessionId
            ? window.shy.listSessionTasks(sessionId).catch(() => [])
            : Promise.resolve([] as SessionTaskRecord[]),
          window.shy.listMemory().catch(() => []),
          window.shy.listSkills().catch(() => [])
        ])
        if (!alive) return
        setTasks(t)
        setMemories(m)
        setSkills(s)
        setLoading(false)
      } catch {
        if (alive) setLoading(false)
      }
    }
    void load()
    const timer = setInterval(() => void load(), POLL_INTERVAL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [sessionId])

  return (
    <aside className="inspector-panel">
      <div className="inspector-tabs" role="tablist">
        <TabButton active={tab === 'tasks'} onClick={() => setTab('tasks')}>
          任务
          {tasks.length > 0 && <span className="inspector-count">{tasks.length}</span>}
        </TabButton>
        <TabButton active={tab === 'memory'} onClick={() => setTab('memory')}>
          记忆
          {memories.length > 0 && <span className="inspector-count">{memories.length}</span>}
        </TabButton>
        <TabButton active={tab === 'skills'} onClick={() => setTab('skills')}>
          技能
          {skills.length > 0 && <span className="inspector-count">{skills.length}</span>}
        </TabButton>
      </div>

      <div className="inspector-body">
        {loading ? <div className="inspector-empty">加载中…</div> : null}
        {!loading && tab === 'tasks' ? <TasksTab tasks={tasks} /> : null}
        {!loading && tab === 'memory' ? <MemoryTab memories={memories} /> : null}
        {!loading && tab === 'skills' ? <SkillsTab skills={skills} /> : null}
      </div>
    </aside>
  )
}

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`inspector-tab${active ? ' active' : ''}`}
      onClick={onClick}
      role="tab"
      aria-selected={active}
    >
      {children}
    </button>
  )
}

function TasksTab({ tasks }: { tasks: SessionTaskRecord[] }): React.JSX.Element {
  if (tasks.length === 0) {
    return (
      <div className="inspector-empty">
        <div className="inspector-empty-title">还没有任务</div>
        <div className="inspector-empty-hint">目标模式下会自动生成清单</div>
      </div>
    )
  }
  const done = tasks.filter((t) => t.done).length
  const pct = Math.round((done / tasks.length) * 100)
  return (
    <div className="inspector-section">
      <div className="inspector-progress">
        <div className="inspector-progress-bar">
          <div className="inspector-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="inspector-progress-label">
          {done}/{tasks.length} 完成 · {pct}%
        </div>
      </div>
      <ul className="inspector-list">
        {tasks.map((t) => (
          <li key={t.id} className={`inspector-item task-${t.source}${t.done ? ' done' : ''}`}>
            <span className="inspector-item-check">{t.done ? '☑' : '☐'}</span>
            <div className="inspector-item-body">
              <div className="inspector-item-title">{t.title}</div>
              {t.evidence ? <div className="inspector-item-evidence">{t.evidence.slice(0, 100)}</div> : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function MemoryTab({ memories }: { memories: LongMemoryEntry[] }): React.JSX.Element {
  if (memories.length === 0) {
    return (
      <div className="inspector-empty">
        <div className="inspector-empty-title">长期记忆为空</div>
        <div className="inspector-empty-hint">agent 会自动维护偏好/规范</div>
      </div>
    )
  }
  const recent = memories.slice(0, 5)
  return (
    <div className="inspector-section">
      <div className="inspector-section-title">最近 {Math.min(5, memories.length)} 条</div>
      <ul className="inspector-list">
        {recent.map((m) => (
          <li key={m.id} className="inspector-item memory">
            <div className="inspector-item-body">
              <div className="inspector-item-title">
                {m.title}
                <span className="inspector-item-source" data-source={m.source}>
                  {m.source === 'agent' ? 'agent' : 'user'}
                </span>
              </div>
              <div className="inspector-item-evidence">{m.content.slice(0, 100)}</div>
            </div>
          </li>
        ))}
      </ul>
      {memories.length > 5 ? (
        <div className="inspector-more">+{memories.length - 5} 条更多,见「长期记忆」页</div>
      ) : null}
    </div>
  )
}

function SkillsTab({ skills }: { skills: SkillSummary[] }): React.JSX.Element {
  if (skills.length === 0) {
    return (
      <div className="inspector-empty">
        <div className="inspector-empty-title">本地没有技能</div>
        <div className="inspector-empty-hint">在「技能」页可创建/加载</div>
      </div>
    )
  }
  return (
    <div className="inspector-section">
      <ul className="inspector-list">
        {skills.map((s) => (
          <li key={s.id} className="inspector-item skill">
            <div className="inspector-item-body">
              <div className="inspector-item-title">{s.name}</div>
              <div className="inspector-item-evidence">{s.description || s.id}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
