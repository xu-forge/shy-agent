import { useCallback, useEffect, useState } from 'react'
import type { SessionSummary } from '../../shared/ipc'
import { Sidebar, type NavKey } from './components/Sidebar'
import { Header } from './components/Header'
import { ChatWorkspace } from './components/ChatWorkspace'
import { MemoryView } from './components/MemoryView'
import { SkillsView } from './components/SkillsView'
import { SettingsPanel } from './components/SettingsPanel'
import { WorkflowsView } from './components/WorkflowsView'
import { WorkflowEditor } from './components/WorkflowEditor'
import type { Workflow } from '../../shared/ipc'
import { ConfirmDialog } from './components/ConfirmDialog'
import { applyTheme, readTheme, writeTheme, type Theme } from './lib/theme'
import './styles/tokens.css'
import './styles/app.css'

type ConfirmState = { action: string; detail: string; requestId: string } | null

const NAV_KEY = '***'

const NAV_TITLES: Record<NavKey, string> = {
  chat: '对话',
  memory: '长期记忆',
  skills: '技能',
  workflows: '工作流',
  settings: '设置'
}

function readNav(): NavKey {
  try {
    const v = localStorage.getItem(NAV_KEY)
    return v === 'memory' || v === 'skills' || v === 'workflows' || v === 'settings' ? v : 'chat'
  } catch {
    return 'chat'
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
  const [sessionId, setSessionId] = useState('')
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null)
  const [workflowDirty, setWorkflowDirty] = useState(0)

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

  const refreshSessions = useCallback(async () => {
    const list = await window.shy.listSessions()
    setSessions(list)
    return list
  }, [])

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
      const list = await window.shy.listSessions()
      if (!alive) return
      setSessions(list)
      if (list[0]) setSessionId(list[0].id)
      else {
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

  const onNewSession = async (): Promise<void> => {
    const created = await window.shy.createSession({ mode: 'interactive' })
    await refreshSessions()
    setSessionId(created.id)
    setNav('chat')
  }

  const onDeleteSession = (id: string, title: string): void => {
    setDeleteSession({ id, title })
  }

  const confirmDeleteSession = async (id: string): Promise<void> => {
    await window.shy.deleteSession(id)
    const list = await refreshSessions()
    if (id === sessionId) {
      if (list[0]) setSessionId(list[0].id)
      else {
        const created = await window.shy.createSession({ mode: 'interactive' })
        await refreshSessions()
        setSessionId(created.id)
      }
    }
  }

  return (
    <div className="app-shell">
      <Sidebar
        active={nav}
        onChange={setNav}
        sessions={sessions}
        activeSessionId={sessionId}
        onSelectSession={setSessionId}
        onNewSession={() => void onNewSession()}
        onDeleteSession={(id, title) => onDeleteSession(id, title)}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        ipcOk={ipcOk}
        onOpenSettings={() => setNav('settings')}
      />
      <div className="main-column">
        <Header title={NAV_TITLES[nav]} />
        {nav === 'chat' ? (
          <ChatWorkspace
            notice={notice}
            sessionId={sessionId}
            onSessionsChanged={() => void refreshSessions()}
          />
        ) : null}
        {nav === 'memory' ? <MemoryView /> : null}
        {nav === 'skills' ? <SkillsView /> : null}
        {nav === 'workflows' ? (
          editingWorkflow ? (
            <WorkflowEditor
              key={workflowDirty}
              initial={editingWorkflow}
              onBack={() => setEditingWorkflow(null)}
              onSaved={() => setWorkflowDirty((d) => d + 1)}
            />
          ) : (
            <WorkflowsView
              onEdit={(id) => {
                void window.shy.getWorkflow(id).then((w) => {
                  if (w) setEditingWorkflow(w)
                })
              }}
              onNew={() => {
                void window.shy.getWorkflowTemplate().then((w) => {
                  void window.shy.saveWorkflow(w).then((saved) => setEditingWorkflow(saved))
                })
              }}
            />
          )
        ) : null}
        {nav === 'settings' ? (
          <SettingsPanel
            theme={theme}
            onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          />
        ) : null}
      </div>
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
            // 闭包变量 target 仅作类型提示
            void target
          }}
        />
      ) : null}
    </div>
  )
}

export default App
