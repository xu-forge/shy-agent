import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Project, ScheduleReminderEvent, SessionSummary } from '../../shared/ipc'
import { Sidebar } from './components/Sidebar'
import { ChatWorkspace } from './components/ChatWorkspace'
import { ChatWorkspaceHost } from './components/ChatWorkspaceHost'
import { SkillsView } from './components/SkillsView'
import { CalendarView } from './components/CalendarView'
import { SessionDock } from './components/SessionDock'
import { ConfirmDialog } from './components/ConfirmDialog'
import { ErrorBoundary } from './components/ErrorBoundary'
import { SettingsDialog, type SettingsTab } from './components/SettingsDialog'
import { PlaceholderView } from './components/PlaceholderView'
import { CodeWorkspace } from './components/code/CodeWorkspace'
import { MaterialLibrary } from './components/material/MaterialLibrary'
import { applyTheme, readTheme, writeTheme, type Theme } from './lib/theme'
import {
  CODE_LAYOUT_KEY,
  NAV_EXPANDED_KEY,
  groupSessionsByProject,
  parseCodeLayout,
  parseNavExpanded,
  resolveChatHostClass,
  resolveShellLayout,
  resolveWorkspaceKind,
  type CodeLayout,
  type NavKey
} from './lib/shellLayout'
import { resolveActiveView } from './lib/activeView'
import {
  DOCK_MODE_KEY,
  LEGACY_INSPECTOR_OPEN_KEY,
  parseDockMode,
  serializeDockMode,
  shouldRenderSessionDock,
  type DockMode
} from './lib/dockMode'
import { OpenInBrowserContext } from './lib/openInBrowser'
import { projectDeleteConfirmDetail } from './lib/projectBind'
import './styles/tokens.css'
import './styles/app.css'
import './styles/ui.css'

type ConfirmState = { action: string; detail: string; requestId: string } | null

const NAV_KEY = 'shy.nav'

function readNav(): NavKey {
  try {
    const v = localStorage.getItem(NAV_KEY)
    return v === 'skills' || v === 'calendar' ? v : 'projects'
  } catch {
    return 'projects'
  }
}

function readNavExpanded(): boolean {
  try {
    return parseNavExpanded(localStorage.getItem(NAV_EXPANDED_KEY))
  } catch {
    return true
  }
}

function readCodeLayout(): CodeLayout {
  try {
    return parseCodeLayout(localStorage.getItem(CODE_LAYOUT_KEY))
  } catch {
    return 'ide'
  }
}

function readDockMode(): DockMode {
  try {
    return parseDockMode(
      localStorage.getItem(DOCK_MODE_KEY),
      localStorage.getItem(LEGACY_INSPECTOR_OPEN_KEY)
    )
  } catch {
    return null
  }
}

function App(): React.JSX.Element {
  const [nav, setNav] = useState<NavKey>(readNav)
  const [theme, setTheme] = useState<Theme>(readTheme)
  const [ipcOk, setIpcOk] = useState<boolean | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmState>(null)
  const [deleteSession, setDeleteSession] = useState<{ id: string; title: string } | null>(null)
  const [deleteProject, setDeleteProject] = useState<{ id: string; title: string } | null>(null)
  const [notice, setNotice] = useState('')
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [sessionId, setSessionId] = useState('')
  const [navExpanded, setNavExpanded] = useState(readNavExpanded)
  const [codeLayout, setCodeLayout] = useState<CodeLayout>(readCodeLayout)
  const [dockMode, setDockMode] = useState<DockMode>(readDockMode)
  const [reminders, setReminders] = useState<{ id: string; title: string; message: string }[]>([])
  const [chatHasConversation, setChatHasConversation] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general')
  const [codeActivePath, setCodeActivePath] = useState<string | null>(null)
  const [materialLightboxPath, setMaterialLightboxPath] = useState<string | null>(null)
  const [browserLaunchUrl, setBrowserLaunchUrl] = useState<string | null>(null)

  // 主题：应用 + 持久化
  useEffect(() => {
    applyTheme(theme)
    writeTheme(theme)
  }, [theme])

  // 导航：持久化
  useEffect(() => {
    try {
      localStorage.setItem(NAV_KEY, nav)
    } catch {
      /* ignore */
    }
  }, [nav])

  useEffect(() => {
    try {
      localStorage.setItem(NAV_EXPANDED_KEY, navExpanded ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [navExpanded])

  useEffect(() => {
    try {
      localStorage.setItem(CODE_LAYOUT_KEY, codeLayout)
    } catch {
      /* ignore */
    }
  }, [codeLayout])

  useEffect(() => {
    try {
      localStorage.setItem(DOCK_MODE_KEY, serializeDockMode(dockMode))
    } catch {
      /* ignore */
    }
  }, [dockMode])

  const refreshProjects = useCallback(async () => {
    const list = await window.shy.listProjects()
    setProjects(list)
    return list
  }, [])

  const refreshSessions = useCallback(async () => {
    const [list] = await Promise.all([window.shy.listSessions(), refreshProjects()])
    setSessions(list)
    return list
  }, [refreshProjects])

  useEffect(() => {
    let cancelled = false
    window.shy
      .ping()
      .then((pong) => {
        if (!cancelled) setIpcOk(pong === 'pong')
      })
      .catch(() => {
        if (!cancelled) setIpcOk(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let alive = true
    void (async () => {
      const [list, projectList] = await Promise.all([
        window.shy.listSessions(),
        window.shy.listProjects()
      ])
      if (!alive) return
      setSessions(list)
      setProjects(projectList)
      if (list[0]) {
        setSessionId(list[0].id)
      } else {
        const created = await window.shy.createSession({ mode: 'interactive' })
        if (!alive) return
        setSessions([created])
        setSessionId(created.id)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    return window.shy.onEvent((payload) => {
      const ev = payload as {
        type?: string
        action?: string
        detail?: string
        requestId?: string
        message?: string
        sessionId?: string
      }
      if (ev.type === 'confirm_required' && ev.requestId && ev.action && ev.detail !== undefined) {
        setConfirmDialog({ action: ev.action, detail: ev.detail, requestId: ev.requestId })
      }
      if (ev.type === 'notify' && ev.message) {
        setNotice(ev.message)
        setTimeout(() => setNotice(''), 6000)
      }
      if (ev.type === 'memory') {
        setNotice('Agent 已更新长期记忆（可在「记忆」中查看/编辑）')
        setTimeout(() => setNotice(''), 6000)
      }
      if (ev.type === 'session' || ev.type === 'done') {
        void refreshSessions()
      }
    })
  }, [refreshSessions])

  useEffect(() => {
    return window.shy.onScheduleRemind((ev: ScheduleReminderEvent) => {
      const id = `${ev.taskId}-${ev.at}`
      setReminders((list) => [...list, { id, title: ev.title, message: ev.message }])
      setTimeout(() => setReminders((list) => list.filter((r) => r.id !== id)), 8000)
    })
  }, [])

  const activeSession = sessions.find((s) => s.id === sessionId)
  const boundProject = projects.find((p) => p.id === activeSession?.projectId) ?? null
  const workspaceKind = resolveWorkspaceKind(activeSession, projects)
  const activeView = resolveActiveView(workspaceKind, codeActivePath, materialLightboxPath)
  const layout = resolveShellLayout({
    nav,
    workspaceKind,
    hasConversation: chatHasConversation,
    codeLayout
  })
  const groups = useMemo(
    () => groupSessionsByProject(sessions, projects),
    [sessions, projects]
  )

  const onNavChange = (key: NavKey): void => {
    setNav(key)
    if (key === 'projects' && !navExpanded) setNavExpanded(true)
  }

  const onSelectSession = (session: SessionSummary): void => {
    setSessionId(session.id)
    setNav('projects')
  }

  const onNewSession = async (): Promise<void> => {
    const created = await window.shy.createSession({ mode: 'interactive' })
    await refreshSessions()
    setSessionId(created.id)
    setNav('projects')
    if (!navExpanded) setNavExpanded(true)
  }

  const onDeleteSession = (id: string, title: string): void => {
    setDeleteSession({ id, title })
  }

  const onDeleteProject = (id: string, title: string): void => {
    setDeleteProject({ id, title })
  }

  const confirmDeleteSession = async (id: string): Promise<void> => {
    await window.shy.deleteSession(id)
    const list = await refreshSessions()
    if (id === sessionId) {
      if (list[0]) {
        setSessionId(list[0].id)
      } else {
        const created = await window.shy.createSession({ mode: 'interactive' })
        await refreshSessions()
        setSessionId(created.id)
      }
    }
  }

  const confirmDeleteProject = async (id: string): Promise<void> => {
    await window.shy.deleteProject(id)
    await refreshSessions()
  }

  const onLaunchUrlConsumed = useCallback(() => {
    setBrowserLaunchUrl(null)
  }, [])

  const openInBrowser = useCallback((url: string) => {
    setBrowserLaunchUrl(url)
    setDockMode('browser')
  }, [])

  return (
    <OpenInBrowserContext.Provider value={openInBrowser}>
    <div className="app-shell">
      <Sidebar
        active={nav}
        onChange={onNavChange}
        expanded={navExpanded}
        onToggleExpanded={() => setNavExpanded((v) => !v)}
        groups={groups}
        activeSessionId={sessionId}
        onSelectSession={onSelectSession}
        onNewSession={() => void onNewSession()}
        onDeleteSession={(id, title) => onDeleteSession(id, title)}
        onDeleteProject={(id, title) => onDeleteProject(id, title)}
        ipcOk={ipcOk}
        onOpenSettings={(tab) => {
          setSettingsTab(tab ?? 'general')
          setSettingsOpen(true)
        }}
      />
      <div
        className={`main-column${layout.main === 'chat' ? ' main-collapsed' : ''}${nav !== 'projects' ? ' main-with-inset' : ''}`}
      >
        {layout.main === 'code' && boundProject && sessionId ? (
          <CodeWorkspace
            projectId={boundProject.id}
            rootPath={boundProject.rootPath}
            sessionId={sessionId}
            theme={theme}
            onActivePathChange={setCodeActivePath}
          />
        ) : null}
        {layout.main === 'code' && !boundProject ? (
          <PlaceholderView title="代码工作区" />
        ) : null}
        {layout.main === 'material' && boundProject ? (
          <MaterialLibrary
            projectId={boundProject.id}
            sessionId={sessionId}
            onLightboxPathChange={setMaterialLightboxPath}
          />
        ) : null}
        {layout.main === 'material' && !boundProject ? (
          <PlaceholderView title="素材工作区" />
        ) : null}
        {layout.main === 'skills' ? <SkillsView /> : null}
        {layout.main === 'calendar' ? (
          <CalendarView
            onContinueSession={(id) => {
              setSessionId(id)
              setNav('projects')
              void refreshSessions()
            }}
          />
        ) : null}
      </div>
      {sessionId ? (
        <ChatWorkspaceHost
          key="chat-workspace-host"
          hostClass={resolveChatHostClass(nav, workspaceKind, codeLayout)}
          chromePad={!navExpanded}
        >
          <ChatWorkspace
            notice={notice}
            sessionId={sessionId}
            sessions={sessions}
            onSessionsChanged={() => void refreshSessions()}
            onConversationState={setChatHasConversation}
            showCodeLayoutToggle={nav === 'projects' && workspaceKind === 'code'}
            codeLayout={codeLayout}
            onCodeLayoutChange={setCodeLayout}
            showDockToggle={Boolean(layout.showInspector && sessionId)}
            dockMode={dockMode}
            onDockModeChange={setDockMode}
            activeView={activeView}
          />
        </ChatWorkspaceHost>
      ) : null}
      {sessionId && shouldRenderSessionDock(layout.showInspector, dockMode) ? (
        <SessionDock
          sessionId={sessionId}
          mode={dockMode}
          launchUrl={browserLaunchUrl}
          onLaunchUrlConsumed={onLaunchUrlConsumed}
          onClose={() => setDockMode(null)}
        />
      ) : null}
      <SettingsDialog
        open={settingsOpen}
        initialTab={settingsTab}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      />
      {confirmDialog ? (
        <ConfirmDialog
          {...confirmDialog}
          onResolve={(requestId, approved) => {
            void window.shy.confirmTool(requestId, approved)
            setConfirmDialog(null)
          }}
        />
      ) : null}
      {deleteSession ? (
        <ConfirmDialog
          action="删除会话"
          detail={`「${deleteSession.title}」的所有消息将一并清除，不可恢复。`}
          requestId={deleteSession.id}
          onResolve={(id, approved) => {
            const target = deleteSession
            setDeleteSession(null)
            if (approved) void confirmDeleteSession(id).then(() => undefined)
            void target
          }}
        />
      ) : null}
      {deleteProject ? (
        <ConfirmDialog
          action="删除项目"
          detail={projectDeleteConfirmDetail(deleteProject.title)}
          requestId={deleteProject.id}
          onResolve={(id, approved) => {
            setDeleteProject(null)
            if (approved) void confirmDeleteProject(id)
          }}
        />
      ) : null}
      <div className="calendar-toast-stack">
        {reminders.map((reminder) => (
          <div key={reminder.id} className="toast calendar-toast" role="status">
            <div>
              <strong>{reminder.title}</strong>
              <div className="calendar-toast-msg">{reminder.message}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
    </OpenInBrowserContext.Provider>
  )
}

export default function AppRoot(): React.JSX.Element {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}
