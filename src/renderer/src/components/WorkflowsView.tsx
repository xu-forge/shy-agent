import { useEffect, useState } from 'react'
import type { Workflow, WorkflowRun, WorkflowRunLog } from '../../../shared/ipc'
import { describeSchedule } from '../../../shared/workflow-format'

type Props = {
  onEdit: (id: string) => void
  onNew: () => void
}

type RunArtifact = { path?: string; content?: string }

function parseRunArtifacts(output?: string): RunArtifact[] {
  if (!output) return []
  try {
    const parsed = JSON.parse(output) as unknown
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is RunArtifact => !!x && typeof x === 'object')
    }
    if (parsed && typeof parsed === 'object') return [parsed as RunArtifact]
  } catch {
    /* 非 JSON 时当作纯文本路径/摘要 */
  }
  return [{ content: output }]
}

function statusLabel(status: WorkflowRun['status']): string {
  if (status === 'success') return '成功'
  if (status === 'failed') return '失败'
  if (status === 'cancelled') return '已取消'
  return '执行中'
}

function logStatusMark(status: WorkflowRunLog['status']): string {
  if (status === 'success') return '✓'
  if (status === 'failed') return '✗'
  return '…'
}

export function WorkflowsView({ onEdit, onNew }: Props): React.JSX.Element {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [confirmDelete, setConfirmDelete] = useState<Workflow | null>(null)
  const [runNotice, setRunNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [selectedRun, setSelectedRun] = useState<WorkflowRun | null>(null)

  const refresh = async (): Promise<void> => {
    const [wf, r] = await Promise.all([
      window.shy.listWorkflows(),
      window.shy.listWorkflowRuns()
    ])
    setWorkflows(wf)
    setRuns(r)
  }

  useEffect(() => {
    void window.shy.listWorkflows().then((wf) => setWorkflows(wf))
    void window.shy.listWorkflowRuns().then((r) => setRuns(r))
    return window.shy.onEvent((payload) => {
      const ev = payload as { type?: string; run?: WorkflowRun }
      if (ev.type === 'workflow_run') {
        void window.shy.listWorkflows().then((wf) => setWorkflows(wf))
        void window.shy.listWorkflowRuns().then((r) => setRuns(r))
      }
    })
  }, [])

  const onDelete = async (): Promise<void> => {
    if (!confirmDelete) return
    await window.shy.deleteWorkflow(confirmDelete.id)
    setConfirmDelete(null)
    await refresh()
  }

  const onRun = async (id: string): Promise<void> => {
    if (runningId) return
    setRunningId(id)
    setRunNotice({ ok: true, text: '正在执行…' })
    try {
      const result = await window.shy.runWorkflow(id)
      if (result.ok) {
        setRunNotice({ ok: true, text: '执行完成（点击运行记录可看详情）' })
      } else {
        setRunNotice({ ok: false, text: result.error || result.run?.error || '执行失败' })
      }
      if (result.run) setSelectedRun(result.run)
    } catch (err) {
      setRunNotice({
        ok: false,
        text: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setRunningId(null)
      await refresh()
    }
  }

  const artifacts = selectedRun ? parseRunArtifacts(selectedRun.output) : []

  return (
    <div className="main pane">
      <div className="pane-frame">
        <div className="pane-header">
          <h1>工作流</h1>
          <p className="muted">可视化节点编排；支持定时与立即执行。</p>
          <button type="button" className="btn btn-primary" onClick={onNew}>
            新建工作流
          </button>
          {runNotice ? (
            <p className={`wf-list-notice${runNotice.ok ? '' : ' err'}`} role="status">
              {runNotice.text}
            </p>
          ) : null}
        </div>

        <div className="workflow-list">
          {workflows.map((wf) => (
            <div key={wf.id} className="workflow-card">
              <div className="workflow-card-main" onClick={() => onEdit(wf.id)}>
                <div className="workflow-card-title">{wf.name}</div>
                <div className="workflow-card-desc">{wf.description || '（无描述）'}</div>
                <div className="workflow-card-meta">
                  <span>
                    {wf.nodes.length} 节点 · {wf.edges.length} 连线
                  </span>
                  <span>
                    {wf.schedule?.enabled ? `⏰ ${describeSchedule(wf.schedule)}` : '未定时'}
                  </span>
                </div>
              </div>
              <div className="workflow-card-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={runningId !== null}
                  onClick={() => void onRun(wf.id)}
                >
                  {runningId === wf.id ? '执行中…' : '立即执行'}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => setConfirmDelete(wf)}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
          {workflows.length === 0 ? (
            <div className="empty-state">
              还没有工作流。点击「新建工作流」创建，或从晨报模板开始。
            </div>
          ) : null}
        </div>

        <div className="section-divider">
          <h3>运行记录</h3>
          <p className="muted" style={{ marginTop: 4 }}>
            点击一条记录查看节点日志与产物。
          </p>
        </div>
        <div className="workflow-runs">
          {runs.slice(0, 30).map((r) => (
            <button
              key={r.id}
              type="button"
              className={`run-row run-${r.status}${selectedRun?.id === r.id ? ' active' : ''}`}
              onClick={() => setSelectedRun(r)}
            >
              <span className="run-status">
                {r.status === 'success' ? '✓' : r.status === 'failed' ? '✗' : '…'}
              </span>
              <span className="run-name">{r.workflowName}</span>
              <span className="run-trigger">{r.trigger === 'schedule' ? '定时' : '手动'}</span>
              <span className="run-time">{new Date(r.startedAt).toLocaleString('zh-CN')}</span>
              {r.error ? (
                <span className="run-error" title={r.error}>
                  {r.error.slice(0, 40)}
                </span>
              ) : null}
              {r.output ? <span className="run-output">有产物</span> : null}
              <span className="run-open">详情</span>
            </button>
          ))}
          {runs.length === 0 ? <div className="muted">暂无运行记录。</div> : null}
        </div>
      </div>

      {selectedRun ? (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedRun(null)
          }}
        >
          <div className="modal modal-wide" role="dialog" aria-labelledby="run-detail-title">
            <div className="run-detail-head">
              <div>
                <h2 id="run-detail-title">{selectedRun.workflowName}</h2>
                <p className="muted">
                  {statusLabel(selectedRun.status)} ·{' '}
                  {selectedRun.trigger === 'schedule' ? '定时' : '手动'} ·{' '}
                  {new Date(selectedRun.startedAt).toLocaleString('zh-CN')}
                  {selectedRun.finishedAt
                    ? ` → ${new Date(selectedRun.finishedAt).toLocaleString('zh-CN')}`
                    : ''}
                </p>
              </div>
              <button type="button" className="btn" onClick={() => setSelectedRun(null)}>
                关闭
              </button>
            </div>

            {selectedRun.error ? (
              <section className="run-detail-section">
                <h3>错误</h3>
                <pre className="run-detail-error">{selectedRun.error}</pre>
              </section>
            ) : null}

            <section className="run-detail-section">
              <h3>节点日志</h3>
              {selectedRun.logs.length === 0 ? (
                <p className="muted">暂无节点日志。</p>
              ) : (
                <ul className="run-log-list">
                  {selectedRun.logs.map((log, i) => (
                    <li key={`${log.nodeId}-${log.at}-${i}`} className={`run-log-item log-${log.status}`}>
                      <span className="run-log-mark">{logStatusMark(log.status)}</span>
                      <div className="run-log-body">
                        <div className="run-log-title">
                          {log.nodeLabel}
                          <span className="run-log-time">
                            {new Date(log.at).toLocaleTimeString('zh-CN')}
                          </span>
                        </div>
                        <div className="run-log-msg">{log.message}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="run-detail-section">
              <h3>执行结果</h3>
              {artifacts.length === 0 ? (
                <p className="muted">本次没有落盘产物（或未执行到写文档节点）。</p>
              ) : (
                artifacts.map((art, i) => (
                  <div key={`${art.path ?? 'out'}-${i}`} className="run-artifact">
                    {art.path ? (
                      <div className="run-artifact-path" title={art.path}>
                        {art.path}
                      </div>
                    ) : null}
                    {art.content ? (
                      <pre className="run-artifact-content">{art.content}</pre>
                    ) : !art.path ? (
                      <p className="muted">（空产物）</p>
                    ) : (
                      <p className="muted">已写入文件；内容未内嵌在运行记录中。</p>
                    )}
                  </div>
                ))
              )}
            </section>

            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => setSelectedRun(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDelete ? (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>删除工作流</h3>
            <p>「{confirmDelete.name}」及其所有运行记录将删除，不可恢复。</p>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setConfirmDelete(null)}>
                取消
              </button>
              <button type="button" className="btn btn-danger" onClick={() => void onDelete()}>
                删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
