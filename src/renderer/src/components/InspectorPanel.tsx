/**
 * DockTasksView — 会话 Dock「任务详情」页：进度/步骤 + 产物 上下两块。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SessionFileRecord, SessionTaskRecord } from '../../../shared/ipc'
import { truncateEvidence } from './goalUi'
import { artifactFiles } from '../lib/projectBind'
import {
  buildArtifactTree,
  defaultSessionWorkspaceRoot,
  type ArtifactTreeNode
} from '../lib/artifactTree'

type Props = {
  sessionId: string
}

type PanelTask = Pick<SessionTaskRecord, 'id' | 'title' | 'done' | 'evidence' | 'source'> & {
  check?: string
  checklistItem?: boolean
}

const POLL_INTERVAL_MS = 5_000

function ArtifactTreeView({
  nodes,
  sessionId
}: {
  nodes: ArtifactTreeNode[]
  sessionId: string
}): React.JSX.Element {
  return (
    <ul className="inspector-tree">
      {nodes.map((node) => (
        <ArtifactTreeItem key={node.path} node={node} sessionId={sessionId} />
      ))}
    </ul>
  )
}

function ArtifactTreeItem({
  node,
  sessionId
}: {
  node: ArtifactTreeNode
  sessionId: string
}): React.JSX.Element {
  if (node.type === 'dir') {
    return (
      <li>
        <div className="inspector-tree-dir">
          <span className="inspector-tree-chevron" aria-hidden="true">
            ▾
          </span>
          {node.name}
        </div>
        {node.children.length > 0 ? (
          <ArtifactTreeView nodes={node.children} sessionId={sessionId} />
        ) : null}
      </li>
    )
  }
  return (
    <li>
      <button
        type="button"
        className="inspector-tree-file"
        title="在访达中显示"
        onClick={() => void window.shy.revealSessionFile(sessionId, node.absPath)}
      >
        {node.name}
      </button>
    </li>
  )
}

export function DockTasksView({ sessionId }: Props): React.JSX.Element {
  const [tasks, setTasks] = useState<PanelTask[]>([])
  const [files, setFiles] = useState<SessionFileRecord[]>([])
  const [workspaceRoot, setWorkspaceRoot] = useState('')
  const [loading, setLoading] = useState(true)
  const [recentTask, setRecentTask] = useState<string | null>(null)

  const fetchTasks = useCallback(async (): Promise<PanelTask[]> => {
    if (!sessionId) return []
    const [records, detail] = await Promise.all([
      window.shy.listSessionTasks(sessionId),
      window.shy.getSession(sessionId)
    ])
    const checklistIds = new Set(detail?.checklist.map((item) => item.id) ?? [])
    const checklist: PanelTask[] =
      detail?.checklist.map((item) => ({
        id: item.id,
        title: item.title,
        done: item.done,
        evidence: item.evidence,
        check: item.check,
        source: 'goal',
        checklistItem: true
      })) ?? []
    return [...checklist, ...records.filter((record) => !checklistIds.has(record.id))]
  }, [sessionId])

  const fetchFiles = useCallback(async (): Promise<SessionFileRecord[]> => {
    if (!sessionId) return []
    return window.shy.listSessionFiles(sessionId)
  }, [sessionId])

  const resolveWorkspace = useCallback(async (): Promise<string> => {
    const [paths, detail, projects] = await Promise.all([
      window.shy.getPaths(),
      window.shy.getSession(sessionId),
      window.shy.listProjects()
    ])
    const project = projects.find((p) => p.id === detail?.projectId)
    return project?.rootPath || defaultSessionWorkspaceRoot(paths.shyHome, sessionId)
  }, [sessionId])

  useEffect(() => {
    let alive = true
    const load = async (): Promise<void> => {
      try {
        const [nextTasks, nextFiles, root] = await Promise.all([
          fetchTasks(),
          fetchFiles(),
          resolveWorkspace()
        ])
        if (!alive) return
        setTasks(nextTasks)
        setFiles(nextFiles)
        setWorkspaceRoot(root)
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
  }, [fetchTasks, fetchFiles, resolveWorkspace])

  useEffect(() => {
    return window.shy.onEvent((payload) => {
      const ev = payload as { type?: string; sessionId?: string; id?: string }
      if (ev.sessionId !== sessionId) return
      if (ev.type === 'task' || ev.type === 'goal') {
        void fetchTasks().then(setTasks)
        if (ev.id) {
          setRecentTask(ev.id)
          setTimeout(() => setRecentTask((cur) => (cur === ev.id ? null : cur)), 1500)
        }
      }
      void fetchFiles().then(setFiles)
      void resolveWorkspace().then(setWorkspaceRoot)
    })
  }, [sessionId, fetchTasks, fetchFiles, resolveWorkspace])

  const toggleTask = async (task: PanelTask): Promise<void> => {
    if (task.checklistItem) return
    await window.shy.updateSessionTask({
      sessionId,
      id: task.id,
      done: !task.done
    })
    void fetchTasks().then(setTasks)
  }

  const artifacts = artifactFiles(files)
  const tree = useMemo(
    () => (workspaceRoot ? buildArtifactTree(artifacts, workspaceRoot) : []),
    [artifacts, workspaceRoot]
  )

  const doneCount = tasks.filter((t) => t.done).length

  return (
    <div className="inspector-split dock-page">
      <section className="inspector-pane inspector-pane-tasks" aria-label="进度与步骤">
        <h3 className="inspector-pane-title">
          进度 / 步骤
          {tasks.length > 0 ? (
            <span className="inspector-meta">
              {' '}
              {doneCount}/{tasks.length}
            </span>
          ) : null}
        </h3>
        <div className="inspector-pane-body">
          {loading ? <div className="inspector-empty">加载中…</div> : null}
          {!loading && tasks.length === 0 ? (
            <div className="inspector-empty">
              <div className="inspector-empty-title">暂无任务</div>
              <div className="inspector-empty-hint">目标模式或 Agent 动态任务会出现在这里</div>
            </div>
          ) : null}
          {!loading && tasks.length > 0 ? (
            <ul className="inspector-list">
              {tasks.map((t) => (
                <li
                  key={t.id}
                  className={`inspector-item task-${t.source}${t.done ? ' done' : ''}${recentTask === t.id ? ' recent' : ''}`}
                >
                  <button
                    type="button"
                    className="inspector-item-check"
                    aria-pressed={t.done}
                    aria-label={
                      t.checklistItem
                        ? '由验收命令自动更新'
                        : t.done
                          ? '标记为未完成'
                          : '标记为完成'
                    }
                    disabled={t.checklistItem}
                    onClick={() => void toggleTask(t)}
                  >
                    {t.done ? '✓' : ''}
                  </button>
                  <div className="inspector-item-body">
                    <div className="inspector-item-title">
                      {t.title}
                      <span className="inspector-item-source" data-source={t.source}>
                        {t.source === 'goal' ? '步骤' : 'Agent'}
                      </span>
                    </div>
                    {t.check ? (
                      <p className="inspector-item-evidence">验收：{t.check}</p>
                    ) : null}
                    {!t.done && t.evidence ? (
                      <p className="inspector-item-evidence">{truncateEvidence(t.evidence)}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      <section className="inspector-pane inspector-pane-artifacts" aria-label="产物">
        <h3 className="inspector-pane-title">
          产物
          {artifacts.length > 0 ? (
            <span className="inspector-meta"> {artifacts.length}</span>
          ) : null}
        </h3>
        <div className="inspector-pane-body">
          {loading ? <div className="inspector-empty">加载中…</div> : null}
          {!loading && artifacts.length === 0 ? (
            <div className="inspector-empty">
              <div className="inspector-empty-title">暂无产物</div>
              <div className="inspector-empty-hint">Agent 写入的文件会出现在这里</div>
            </div>
          ) : null}
          {!loading && artifacts.length > 0 ? (
            <ArtifactTreeView nodes={tree} sessionId={sessionId} />
          ) : null}
        </div>
      </section>
    </div>
  )
}
