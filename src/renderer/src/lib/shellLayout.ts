import type { Project, SessionSummary } from '../../../shared/ipc'

export const UNSELECTED_PROJECT_GROUP = '未选择项目'

export type NavKey = 'projects' | 'skills' | 'calendar'

export type WorkspaceKind = 'unbound' | 'code' | 'material'

export type ChatHostClass = 'chat-main' | 'chat-aside' | 'chat-hidden'

/** 代码项目：IDE（文件树 | 编辑器 | 右侧会话）或普通（中间会话 | 右侧详情）。 */
export type CodeLayout = 'ide' | 'chat'

export const NAV_EXPANDED_KEY = 'shy.nav-expanded'
export const CODE_LAYOUT_KEY = 'shy.codeLayout'
export const CHAT_ASIDE_WIDTH_KEY = 'shy.chatAsideWidth'
export const CHAT_ASIDE_MIN_WIDTH = 350
export const CHAT_ASIDE_MAX_WIDTH = 450
export const CHAT_ASIDE_DEFAULT_WIDTH = 350
export const NAV_GROUP_COLLAPSED_KEY = 'shy.nav-group-collapsed'
export const INSPECTOR_OPEN_KEY = 'shy.inspectorOpen'
export const UNSELECTED_GROUP_KEY = 'unselected'

export type SessionGroup = {
  id: string | null
  title: string
  sessions: SessionSummary[]
}

export type ShellLayout = {
  main: 'chat' | 'code' | 'material' | 'skills' | 'calendar'
  /** 会话主列是否展示右侧 Dock（任务/浏览器/文件）。 */
  showInspector: boolean
  showChatAside: boolean
}

/** 缺省展开；仅显式 `'0'` / `'false'` 视为收起。 */
export function parseNavExpanded(raw: string | null): boolean {
  return raw !== '0' && raw !== 'false'
}

/** 任务详情面板缺省展开；仅显式 `'false'` 视为收起。 */
export function parseInspectorOpen(raw: string | null): boolean {
  return raw !== 'false'
}

/** 缺省 IDE；仅显式 `'chat'` 视为普通会话布局。 */
export function parseCodeLayout(raw: string | null): CodeLayout {
  return raw === 'chat' ? 'chat' : 'ide'
}

export function chatAsideMaxWidth(): number {
  return CHAT_ASIDE_MAX_WIDTH
}

export function clampChatAsideWidth(
  w: number,
  max: number = CHAT_ASIDE_MAX_WIDTH
): number {
  if (!Number.isFinite(w)) return Math.min(CHAT_ASIDE_DEFAULT_WIDTH, max)
  const effectiveMin = Math.min(CHAT_ASIDE_MIN_WIDTH, max)
  return Math.min(max, Math.max(effectiveMin, Math.round(w)))
}

export function parseChatAsideWidth(raw: string | null): number {
  const saved = Number(raw)
  return clampChatAsideWidth(saved > 0 ? saved : CHAT_ASIDE_DEFAULT_WIDTH)
}

export function groupStorageKey(id: string | null): string {
  return id ?? UNSELECTED_GROUP_KEY
}

export function parseCollapsedGroups(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

export function toggleCollapsedGroup(collapsed: readonly string[], key: string): string[] {
  return collapsed.includes(key) ? collapsed.filter((item) => item !== key) : [...collapsed, key]
}

export function groupSessionsByProject(
  sessions: SessionSummary[],
  projects: Project[]
): SessionGroup[] {
  const known = new Set(projects.map((p) => p.id))
  const unselected = sessions.filter((s) => !s.projectId || !known.has(s.projectId))
  const groups: SessionGroup[] = [
    { id: null, title: UNSELECTED_PROJECT_GROUP, sessions: unselected }
  ]
  for (const p of projects) {
    groups.push({
      id: p.id,
      title: p.name,
      sessions: sessions.filter((s) => s.projectId === p.id)
    })
  }
  return groups
}

export function resolveWorkspaceKind(
  session: SessionSummary | undefined,
  projects: Project[]
): WorkspaceKind {
  const projectId = session?.projectId
  if (!projectId) return 'unbound'
  const project = projects.find((p) => p.id === projectId)
  if (!project) return 'unbound'
  return project.type
}

export function resolveShellLayout(opts: {
  nav: NavKey
  workspaceKind: WorkspaceKind
  hasConversation: boolean
  codeLayout?: CodeLayout
}): ShellLayout {
  if (opts.nav === 'skills' || opts.nav === 'calendar') {
    return {
      main: opts.nav,
      showInspector: false,
      showChatAside: false
    }
  }

  if (opts.workspaceKind === 'code') {
    if (opts.codeLayout === 'chat') {
      return {
        main: 'chat',
        showInspector: true,
        showChatAside: false
      }
    }
    return {
      main: 'code',
      showInspector: false,
      showChatAside: true
    }
  }

  if (opts.workspaceKind === 'material') {
    return {
      main: 'material',
      showInspector: false,
      showChatAside: true
    }
  }

  return {
    main: 'chat',
    showInspector: opts.hasConversation,
    showChatAside: false
  }
}

/** 同一 DOM 宿主只换 class，避免 unbound ↔ code/material 卸载 ChatWorkspace。 */
export function resolveChatHostClass(
  nav: NavKey,
  workspaceKind: WorkspaceKind,
  codeLayout: CodeLayout = 'ide'
): ChatHostClass {
  if (nav !== 'projects') return 'chat-hidden'
  if (workspaceKind === 'unbound') return 'chat-main'
  if (workspaceKind === 'code' && codeLayout === 'chat') return 'chat-main'
  return 'chat-aside'
}
