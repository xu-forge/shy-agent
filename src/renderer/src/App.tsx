import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Project, ScheduleReminderEvent, SessionSummary } from '../../shared/ipc'
import { Sidebar } from './components/Sidebar'
import { Header } from './components/Header'
import { ChatWorkspace } from './components/ChatWorkspace'
import { SkillsView } from './components/SkillsView'
import { CalendarView } from './components/CalendarView'
import { InspectorPanel } from './components/InspectorPanel'
import { ConfirmDialog } from './components/ConfirmDialog'
import { ErrorBoundary } from './components/ErrorBoundary'
import { SettingsDialog, type SettingsTab } from './components/SettingsDialog'
import { PlaceholderView } from './components/PlaceholderView'
import { applyTheme, readTheme, writeTheme, type Theme } from './lib/theme'
import {
  groupSessionsByProject,
  resolveChatHostClass,
  resolveShellLayout,
  resolveWorkspaceKind,
  type NavKey,
  type SecondaryMode
} from './lib/shellLayout'
import './styles/tokens.css'
import './styles/app.css'
import './styles/ui.css'

type ConfirmState = { action: string; detail: string; requestId: string } | null

const NAV_KEY = 'shy.nav'

const NAV_TITLES: Record<NavKey, string> = {
  projects: '项目',
  skills: '技能管理',
  calendar: '定时任务'
}

function readNav(): NavKey {
  try {
    const v = localStorage.getItem(NAV_KEY)
    return v === 'skills' || v === 'calendar' ? v : 'projects'
  } catch {
    return 'projects'
  }
}

function App(): React.JSX.Element {
  const [nav, setNav] = useState<NavKey>(readNav)
  const [theme, setTheme] = useState<Theme>(readTheme)
  const [ipcOk, setIpcOk] = useState<boolean | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmState>(null)
  const [deleteSession, setDeleteSession] = useState<{ id: string; title: string } | null>(null)
  const [notice, setNotice] = useState('')
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [sessionId, setSessionId] = useState('')
  const [secondaryMode, setSecondaryMode] = useState<SecondaryMode>('sessions')
  const [reminders, setReminders] = useState<{ id: string; title: string; message: string }[]>([])
  const [chatHasConversation, setChatHasConversation] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general')

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
        if (resolveWorkspaceKind(list[0], projectList) === 'code') setSecondaryMode('files')
      } else {
        const created = await window.shy.createSession({ mode: 'interactive' })
        if (!alive) return
        setSessions([created])
        setSessionId(created.id)
        setSecondaryMode('sessions')
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
  const workspaceKind = resolveWorkspaceKind(activeSession, projects)
  const layout = resolveShellLayout({
    nav,
    secondaryMode,
    workspaceKind,
    hasConversation: chatHasConversation
  })
  const groups = useMemo(
    () => groupSessionsByProject(sessions, projects),
    [sessions, projects]
  )

  const onNavChange = (key: NavKey): void => {
    if (key === 'projects') setSecondaryMode('sessions')
    setNav(key)
  }

  const onSelectSession = (session: SessionSummary): void => {
    setSessionId(session.id)
    setNav('projects')
    const kind = resolveWorkspaceKind(session, projects)
    setSecondaryMode(kind === 'code' ? 'files' : 'sessions')
  }

  const onNewSession = async (): Promise<void> => {
    const created = await window.shy.createSession({ mode: 'interactive' })
    await refreshSessions()
    setSessionId(created.id)
    setNav('projects')
    setSecondaryMode('sessions')
  }

  const onDeleteSession = (id: string, title: string): void => {
    setDeleteSession({ id, title })
  }

  const confirmDeleteSession = async (id: string): Promise<void> => {
    await window.shy.deleteSession(id)
    const list = await refreshSessions()
    if (id === sessionId) {
      if (list[0]) {
        setSessionId(list[0].id)
        setSecondaryMode(
          resolveWorkspaceKind(list[0], projects) === 'code' ? 'files' : 'sessions'
        )
      } else {
        const created = await window.shy.createSession({ mode: 'interactive' })
        await refreshSessions()
        setSessionId(created.id)
        setSecondaryMode('sessions')
      }
    }
  }

  return (
    <div className="app-shell">
      <Sidebar
        active={nav}
        onChange={onNavChange}
        showSecondary={layout.showSecondary}
        secondaryMode={layout.secondaryContent}
        groups={groups}
        activeSessionId={sessionId}
        onSelectSession={onSelectSession}
        onNewSession={() => void onNewSession()}
        onDeleteSession={(id, title) => onDeleteSession(id, title)}
        ipcOk={ipcOk}
        onOpenSettings={(tab) => {
          setSettingsTab(tab ?? 'general')
          setSettingsOpen(true)
        }}
      />
      <div className={`main-column${layout.main === 'chat' ? ' main-collapsed' : ''}`}>
        {nav !== 'projects' ? <Header title={NAV_TITLES[nav]} /> : null}
        {layout.main === 'code' ? <PlaceholderView title="代码工作区" /> : null}
        {layout.main === 'material' ? <PlaceholderView title="素材工作区" /> : null}
        {layout.main === 'skills' ? <SkillsView /> : null}
        {layout.main === 'calendar' ? <CalendarView /> : null}
      </div>
      {sessionId ? (
        <div key="chat-workspace-host" className={resolveChatHostClass(nav, workspaceKind)}>
          <ChatWorkspace
            notice={notice}
            sessionId={sessionId}
            onSessionsChanged={() => void refreshSessions()}
            onConversationState={setChatHasConversation}
          />
        </div>
      ) : null}
      {layout.showInspector && sessionId ? <InspectorPanel sessionId={sessionId} /> : null}
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
  )
}

export default function AppRoot(): React.JSX.Element {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}
