import { useCallback, useEffect, useState } from 'react'
import type { SessionSummary } from '../../shared/ipc'
import { Sidebar, type NavKey } from './components/Sidebar'
import { ChatWorkspace } from './components/ChatWorkspace'
import { MemoryView } from './components/MemoryView'
import { SkillsView } from './components/SkillsView'
import { SettingsPanel } from './components/SettingsPanel'
import { ConfirmDialog } from './components/ConfirmDialog'
import './styles/tokens.css'
import './styles/app.css'

type ConfirmState = { action: string; detail: string; requestId: string } | null

function App(): React.JSX.Element {
  const [nav, setNav] = useState<NavKey>('chat')
  const [ipcOk, setIpcOk] = useState<boolean | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmState>(null)
  const [notice, setNotice] = useState('')
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [sessionId, setSessionId] = useState('')

  const refreshSessions = useCallback(async () => {
    const list = await window.myAgent.listSessions()
    setSessions(list)
    return list
  }, [])

  useEffect(() => {
    let cancelled = false
    window.myAgent
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
      const list = await window.myAgent.listSessions()
      if (!alive) return
      setSessions(list)
      if (list[0]) setSessionId(list[0].id)
      else {
        const created = await window.myAgent.createSession({ mode: 'interactive' })
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
    return window.myAgent.onEvent((payload) => {
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
    const created = await window.myAgent.createSession({ mode: 'interactive' })
    await refreshSessions()
    setSessionId(created.id)
    setNav('chat')
  }

  const onDeleteSession = async (id: string): Promise<void> => {
    if (!window.confirm('删除此会话？')) return
    await window.myAgent.deleteSession(id)
    const list = await refreshSessions()
    if (id === sessionId) {
      if (list[0]) setSessionId(list[0].id)
      else {
        const created = await window.myAgent.createSession({ mode: 'interactive' })
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
        onDeleteSession={(id) => void onDeleteSession(id)}
      />
      {nav === 'chat' ? (
        <ChatWorkspace
          ipcOk={ipcOk}
          onOpenSettings={() => setSettingsOpen(true)}
          notice={notice}
          sessionId={sessionId}
          onSessionsChanged={() => void refreshSessions()}
        />
      ) : null}
      {nav === 'memory' ? <MemoryView /> : null}
      {nav === 'skills' ? <SkillsView /> : null}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {confirmDialog ? (
        <ConfirmDialog
          {...confirmDialog}
          onResolve={(requestId, approved) => {
            void window.myAgent.confirmTool(requestId, approved)
            setConfirmDialog(null)
          }}
        />
      ) : null}
    </div>
  )
}

export default App
