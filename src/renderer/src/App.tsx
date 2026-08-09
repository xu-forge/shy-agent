import { useEffect, useState } from 'react'
import { Sidebar, type NavKey } from './components/Sidebar'
import { ChatWorkspace } from './components/ChatWorkspace'
import { PlaceholderView } from './components/PlaceholderView'
import './styles/tokens.css'
import './styles/app.css'

function App(): React.JSX.Element {
  const [nav, setNav] = useState<NavKey>('chat')
  const [ipcOk, setIpcOk] = useState<boolean | null>(null)

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

  return (
    <div className="app-shell">
      <Sidebar active={nav} onChange={setNav} />
      {nav === 'chat' ? <ChatWorkspace ipcOk={ipcOk} /> : null}
      {nav === 'memory' ? (
        <div className="main">
          <PlaceholderView title="记忆" />
        </div>
      ) : null}
      {nav === 'skills' ? (
        <div className="main">
          <PlaceholderView title="技能" />
        </div>
      ) : null}
    </div>
  )
}

export default App
