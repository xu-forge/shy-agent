import type { Project, SessionSummary } from '../../../shared/ipc'

export const UNSELECTED_PROJECT_GROUP = '未选择项目'

export type NavKey = 'projects' | 'skills' | 'calendar'

export type SecondaryMode = 'sessions' | 'files'

export type WorkspaceKind = 'unbound' | 'code' | 'material'

export type SessionGroup = {
  id: string | null
  title: string
  sessions: SessionSummary[]
}

export type ShellLayout = {
  showSecondary: boolean
  secondaryContent: SecondaryMode
  main: 'chat' | 'code' | 'material' | 'skills' | 'calendar'
  showInspector: boolean
  showChatAside: boolean
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
  secondaryMode: SecondaryMode
  workspaceKind: WorkspaceKind
  hasConversation: boolean
}): ShellLayout {
  if (opts.nav === 'skills' || opts.nav === 'calendar') {
    return {
      showSecondary: false,
      secondaryContent: 'sessions',
      main: opts.nav,
      showInspector: false,
      showChatAside: false
    }
  }

  if (opts.workspaceKind === 'code') {
    return {
      showSecondary: true,
      secondaryContent: opts.secondaryMode,
      main: 'code',
      showInspector: false,
      showChatAside: true
    }
  }

  if (opts.workspaceKind === 'material') {
    return {
      showSecondary: true,
      secondaryContent: 'sessions',
      main: 'material',
      showInspector: false,
      showChatAside: true
    }
  }

  return {
    showSecondary: true,
    secondaryContent: 'sessions',
    main: 'chat',
    showInspector: opts.hasConversation,
    showChatAside: false
  }
}
