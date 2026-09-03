import { useEffect, useState } from 'react'
import type { ScheduleOccurrence, ScheduleRun, ScheduleTask } from '../../../../shared/ipc'
import {
  formatOccTime,
  occurrenceStatus,
  occurrenceStatusLabel
} from '../../lib/calendarScheduleUi'
import {
  resolveScheduleResultView,
  type ScheduleResultView
} from '../../lib/scheduleRunResult'
import { MarkdownBody } from '../MarkdownBody'
import { Modal } from '../ui'

type Props = {
  occurrence: ScheduleOccurrence
  run: ScheduleRun
  task: ScheduleTask | undefined
  onClose: () => void
  onOpenTask: () => void
  onContinueSession?: (sessionId: string) => void
}

function formatAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  return `${y}/${m < 10 ? `0${m}` : m}/${day < 10 ? `0${day}` : day} ${formatOccTime(iso)}`
}

function formatDuration(startedAt: string, endedAt?: string | null): string {
  if (!endedAt) return '—'
  const ms = Date.parse(endedAt) - Date.parse(startedAt)
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec} 秒`
  const min = Math.floor(sec / 60)
  const rem = sec % 60
  return rem > 0 ? `${min} 分 ${rem} 秒` : `${min} 分`
}

const LOADING: ScheduleResultView = {
  heading: '执行结果',
  body: '加载中…',
  renderAs: 'plain'
}

export function ScheduleRunResultModal({
  occurrence,
  run,
  task,
  onClose,
  onOpenTask,
  onContinueSession
}: Props): React.JSX.Element {
  const [view, setView] = useState<ScheduleResultView>(LOADING)
  const status = occurrenceStatus(occurrence, task, new Date(), run)
  const statusLabel = occurrenceStatusLabel(status)
  const sessionId = run.sessionId ?? null

  useEffect(() => {
    let alive = true

    const resolve = async (): Promise<void> => {
      if (
        run.status === 'running' ||
        run.status === 'waiting_confirm' ||
        run.status === 'failed'
      ) {
        const next = resolveScheduleResultView({ run })
        if (alive) setView(next)
        return
      }

      if (!sessionId) {
        const next = resolveScheduleResultView({ run })
        if (alive) setView(next)
        return
      }

      try {
        const session = await window.shy.getSession(sessionId)
        if (!alive) return
        setView(resolveScheduleResultView({ run, session }))
      } catch {
        if (alive) {
          const fallback = resolveScheduleResultView({ run })
          setView(
            fallback.body === '暂无结果正文'
              ? { heading: '执行结果', body: '无法加载会话结果', renderAs: 'plain' }
              : fallback
          )
        }
      }
    }

    void resolve()
    return () => {
      alive = false
    }
  }, [run, sessionId])

  return (
    <Modal
      title={
        <span className="sch-detail-modal-title">
          {occurrence.title}
          <span className="sch-badge-local">本地</span>
        </span>
      }
      aria-label={occurrence.title}
      width={640}
      onClose={onClose}
      footer={
        <>
          {sessionId && onContinueSession ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onContinueSession(sessionId)}
            >
              继续对话
            </button>
          ) : null}
          <button type="button" className="btn btn-ghost sch-detail-open-task" onClick={onOpenTask}>
            <svg viewBox="0 0 16 16" aria-hidden="true" width="14" height="14">
              <path
                d="M6.5 3.5H4.2A1.7 1.7 0 0 0 2.5 5.2v6.6A1.7 1.7 0 0 0 4.2 13.5h6.6a1.7 1.7 0 0 0 1.7-1.7V9.5M9.5 2.5h4v4M13.5 2.5 7 9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            查看定时任务
          </button>
        </>
      }
    >
      <div className="sch-detail sch-run-result">
        <div className={`sch-detail-status-pill status-${status}`}>
          <span className="sch-status-dot" aria-hidden="true" />
          {statusLabel}
        </div>

        <div className="sch-detail-meta">
          <div className="sch-detail-meta-item">
            <span className="sch-detail-meta-label">开始时间</span>
            <span className="sch-detail-meta-value">{formatAt(run.startedAt)}</span>
          </div>
          <div className="sch-detail-meta-item">
            <span className="sch-detail-meta-label">结束时间</span>
            <span className="sch-detail-meta-value">
              {run.endedAt ? formatAt(run.endedAt) : '—'}
            </span>
          </div>
          <div className="sch-detail-meta-item">
            <span className="sch-detail-meta-label">耗时</span>
            <span className="sch-detail-meta-value">
              {formatDuration(run.startedAt, run.endedAt)}
            </span>
          </div>
        </div>

        <div className="sch-detail-body sch-run-result-body">
          <div className="sch-detail-body-title">{view.heading}</div>
          {view.renderAs === 'markdown' ? (
            <div className="sch-run-result-md">
              <MarkdownBody content={view.body} />
            </div>
          ) : (
            <pre className="sch-run-result-text">{view.body}</pre>
          )}
          {view.hint ? <p className="sch-run-result-hint">{view.hint}</p> : null}
        </div>
      </div>
    </Modal>
  )
}
