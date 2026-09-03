import type { ScheduleOccurrence, ScheduleTask } from '../../../../shared/ipc'
import {
  formatOccTime,
  formatScheduleLabel,
  occurrenceStatus,
  occurrenceStatusLabel
} from '../../lib/calendarScheduleUi'
import { Modal } from '../ui'

type Props = {
  occurrence: ScheduleOccurrence
  task: ScheduleTask | undefined
  skillName?: string
  onClose: () => void
  onOpenTask: () => void
}

function formatAt(at: string): string {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return at
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  return `${y}/${m < 10 ? `0${m}` : m}/${day < 10 ? `0${day}` : day} ${formatOccTime(at)}`
}

export function ScheduleOccurrenceDetail({
  occurrence,
  task,
  skillName,
  onClose,
  onOpenTask
}: Props): React.JSX.Element {
  const status = occurrenceStatus(occurrence, task)
  const statusLabel = occurrenceStatusLabel(status)
  const freq = task ? formatScheduleLabel(task.schedule) : '—'
  const actionKind = occurrence.action === 'run_skill' && skillName ? '技能' : 'Agent'
  const actionSummary =
    task?.action === 'run_skill'
      ? [
          skillName || task.payload.skillId,
          task.payload.instruction?.trim()
        ]
          .filter(Boolean)
          .join(' · ') || '—'
      : task?.action === 'remind'
        ? task.payload.message || '—'
        : '—'

  return (
    <Modal
      title={
        <span className="sch-detail-modal-title">
          {occurrence.title}
          <span className="sch-badge-local">本地</span>
        </span>
      }
      aria-label={occurrence.title}
      width={520}
      onClose={onClose}
      footer={
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
      }
    >
      <div className="sch-detail">
        <div className={`sch-detail-status-pill status-${status}`}>
          <span className="sch-status-dot" aria-hidden="true" />
          {statusLabel}
        </div>

        <div className="sch-detail-meta">
          <div className="sch-detail-meta-item">
            <span className="sch-detail-meta-label">状态</span>
            <span className="sch-detail-meta-value">{statusLabel}</span>
          </div>
          <div className="sch-detail-meta-item">
            <span className="sch-detail-meta-label">频率</span>
            <span className="sch-detail-meta-value">{freq}</span>
          </div>
          <div className="sch-detail-meta-item">
            <span className="sch-detail-meta-label">预计执行时间</span>
            <span className="sch-detail-meta-value">{formatAt(occurrence.at)}</span>
          </div>
        </div>

        <div className="sch-detail-body">
          <div className="sch-detail-body-title">{occurrence.title}</div>
          <div className="sch-detail-action">
            <span className="sch-detail-action-badge">{actionKind}</span>
            <span className="sch-detail-action-text">{actionSummary}</span>
          </div>
        </div>
      </div>
    </Modal>
  )
}
