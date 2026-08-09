import { useEffect, useState } from 'react'
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
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const [notice, setNotice] = useState('')

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
    return window.myAgent.onEvent((payload) => {
      const ev = payload as {
        type?: string
        action?: string
        detail?: string
        requestId?: string
        message?: string
      }
      if (ev.type === 'confirm_required' && ev.requestId && ev.action && ev.detail !== undefined) {
        setConfirm({ action: ev.action, detail: ev.detail, requestId: ev.requestId })
      }
      if (ev.type === 'notify' && ev.message) {
        setNotice(ev.message)
        setTimeout(() => setNotice(''), 6000)
      }
      if (ev.type === 'memory') {
        setNotice('Agent 已更新长期记忆（可在「记忆」中查看/编辑）')
        setTimeout(() => setNotice(''), 6000)
      }
    })
  }, [])

  return (
    <div className="app-shell">
      <Sidebar active={nav} onChange={setNav} />
      {nav === 'chat' ? (
        <ChatWorkspace ipcOk={ipcOk} onOpenSettings={() => setSettingsOpen(true)} notice={notice} />
      ) : null}
      {nav === 'memory' ? <MemoryView /> : null}
      {nav === 'skills' ? <SkillsView /> : null}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {confirm ? (
        <ConfirmDialog
          {...confirm}
          onResolve={(requestId, approved) => {
            void window.myAgent.confirmTool(requestId, approved)
            setConfirm(null)
          }}
        />
      ) : null}
    </div>
  )
}

export default App
