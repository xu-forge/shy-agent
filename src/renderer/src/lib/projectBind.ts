import type { SessionFileRecord, SessionSummary } from '../../../shared/ipc'

export const BIND_ERROR_LABEL: Record<'already_bound' | 'has_messages' | 'not_found', string> = {
  already_bound: '会话已绑定项目',
  has_messages: '已有消息的会话无法绑定项目',
  not_found: '会话或项目不存在'
}

export function isProjectPickerLocked(opts: {
  hasUserMessages: boolean
  projectId?: string | null
}): boolean {
  return Boolean(opts.hasUserMessages || opts.projectId)
}

/** 仅未绑定的主对话需要选择器；右侧已绑定会话输入区不展示项目。 */
export function shouldShowProjectPicker(boundProjectId?: string | null): boolean {
  return !boundProjectId
}

export function shouldBindOnSend(opts: {
  hasUserMessages: boolean
  boundProjectId?: string | null
  pendingProjectId: string | null
}): boolean {
  return !opts.hasUserMessages && !opts.boundProjectId && Boolean(opts.pendingProjectId)
}

/** 只信服务端 projectId；null / 空串视为未绑定，禁止回落到上一会话。 */
export function resolveBoundProjectId(serverProjectId?: string | null): string | null {
  return serverProjectId ? serverProjectId : null
}

export type ChatStatusTone = 'busy' | 'warn' | 'err' | ''

const BIND_ERROR_TEXTS = new Set<string>(Object.values(BIND_ERROR_LABEL))

/** idle 下 bind 失败等错误仍要有 tone，不能只在 busy/paused 时显示。 */
export function chatStatusTone(opts: {
  busy: boolean
  paused: boolean
  status: string
}): ChatStatusTone {
  if (opts.busy) return 'busy'
  if (opts.paused) return 'warn'
  if (!opts.status) return ''
  return BIND_ERROR_TEXTS.has(opts.status) ? 'err' : 'warn'
}

export function artifactFiles(files: SessionFileRecord[]): SessionFileRecord[] {
  const latest = new Map<string, SessionFileRecord>()
  for (const f of files) {
    if (f.op !== 'write') continue
    const key = f.path.replace(/\\/g, '/')
    const prev = latest.get(key)
    if (!prev || f.occurredAt >= prev.occurredAt) latest.set(key, f)
  }
  return [...latest.values()].sort((a, b) => b.occurredAt - a.occurredAt)
}

export function sameProjectSessions(
  sessions: SessionSummary[],
  projectId: string
): SessionSummary[] {
  return sessions.filter((s) => s.projectId === projectId)
}

/** 删除项目确认文案：只解绑会话，不删磁盘文件。 */
export function projectDeleteConfirmDetail(projectName: string): string {
  return `「${projectName}」将从列表中移除，已绑定会话会解绑。不会删除磁盘上的项目文件。`
}
