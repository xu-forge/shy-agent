import type { SessionFileRecord, SessionSummary } from '../../../shared/ipc'

export type InspectorTab = 'details' | 'browser'

export const INSPECTOR_TABS: ReadonlyArray<{ key: InspectorTab; label: string }> = [
  { key: 'details', label: '会话详情' },
  { key: 'browser', label: '浏览器' }
]

export const BIND_ERROR_LABEL: Record<'already_bound' | 'has_messages' | 'not_found', string> = {
  already_bound: '会话已绑定项目',
  has_messages: '已有消息的会话无法绑定项目',
  not_found: '会话或项目不存在'
}

export function normalizeInspectorTab(raw: string | null): InspectorTab {
  return raw === 'browser' ? 'browser' : 'details'
}

export function isProjectPickerLocked(opts: {
  hasUserMessages: boolean
  projectId?: string | null
}): boolean {
  return Boolean(opts.hasUserMessages || opts.projectId)
}

export function shouldBindOnSend(opts: {
  hasUserMessages: boolean
  boundProjectId?: string | null
  pendingProjectId: string | null
}): boolean {
  return !opts.hasUserMessages && !opts.boundProjectId && Boolean(opts.pendingProjectId)
}

export function artifactFiles(files: SessionFileRecord[]): SessionFileRecord[] {
  return files.filter((f) => f.op === 'write')
}

export function sameProjectSessions(
  sessions: SessionSummary[],
  projectId: string
): SessionSummary[] {
  return sessions.filter((s) => s.projectId === projectId)
}
