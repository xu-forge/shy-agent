import type { Project, SessionSummary } from '../../../shared/ipc'

export const UNSELECTED_PROJECT_GROUP = '未选择项目'

export type NavKey = 'projects' | 'skills' | 'calendar'

export type WorkspaceKind = 'unbound' | 'code' | 'material'

export type ChatHostClass = 'chat-main' | 'chat-aside' | 'chat-hidden'

export const NAV_EXPANDED_KEY = 'shy.nav-expanded'
export const NAV_GROUP_COLLAPSED_KEY = 'shy.nav-group-collapsed'
export const UNSELECTED_GROUP_KEY = 'unselected'

export type SessionGroup = {
  id: string | null
  title: string
  sessions: SessionSummary[]
}

export type ShellLayout = {
  main: 'chat' | 'code' | 'material' | 'skills' | 'calendar'
  showInspector: boolean
  showChatAside: boolean
}

/** 缺省展开；仅显式 `'0'` / `'false'` 视为收起。 */
export function parseNavExpanded(raw: string | null): boolean {
  return raw !== '0' && raw !== 'false'
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
}): ShellLayout {
  if (opts.nav === 'skills' || opts.nav === 'calendar') {
    return {
      main: opts.nav,
      showInspector: false,
      showChatAside: false
    }
  }

  if (opts.workspaceKind === 'code') {
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
export function resolveChatHostClass(nav: NavKey, workspaceKind: WorkspaceKind): ChatHostClass {
  if (nav !== 'projects') return 'chat-hidden'
  if (workspaceKind === 'unbound') return 'chat-main'
  return 'chat-aside'
}
