import { useCallback, useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import '../../lib/monaco-env'
import {
  AGENT_CONFLICT_HINT,
  SESSION_FILES_POLL_MS,
  applySuccessfulSave,
  detectAgentWrites,
  languageFromPath,
  monacoThemeFromDataset
} from '../../lib/codeWorkspace'
import { FileTree } from './FileTree'
import type { Theme } from '../../lib/theme'

type TabState = {
  relativePath: string
  content: string
  savedContent: string
  dirty: boolean
  conflict: boolean
}

type Props = {
  projectId: string
  rootPath: string
  sessionId: string
  theme: Theme
}

export function CodeWorkspace({
  projectId,
  rootPath,
  sessionId,
  theme
}: Props): React.JSX.Element {
  const [tabs, setTabs] = useState<TabState[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const [loadError, setLoadError] = useState('')
  const tabsRef = useRef(tabs)
  const lastSeenIdRef = useRef<number | null>(null)
  tabsRef.current = tabs

  const monacoTheme = monacoThemeFromDataset(theme)

  const openFile = useCallback(
    async (relativePath: string): Promise<void> => {
      const existing = tabsRef.current.find((t) => t.relativePath === relativePath)
      if (existing) {
        setActivePath(relativePath)
        setLoadError('')
        return
      }
      const r = await window.shy.projectFileRead({ projectId, relativePath })
      if (!r.ok) {
        setLoadError('无法打开文件')
        return
      }
      const tab: TabState = {
        relativePath,
        content: r.content,
        savedContent: r.content,
        dirty: false,
        conflict: false
      }
      setTabs((prev) => [...prev, tab])
      setActivePath(relativePath)
      setLoadError('')
    },
    [projectId]
  )

  useEffect(() => {
    setTabs([])
    setActivePath(null)
    setLoadError('')
    lastSeenIdRef.current = null
  }, [projectId])

  const saveTab = useCallback(
    async (relativePath: string): Promise<void> => {
      const tab = tabsRef.current.find((t) => t.relativePath === relativePath)
      if (!tab) return
      const r = await window.shy.projectFileWrite({
        projectId,
        relativePath,
        content: tab.content
      })
      if (!r.ok) {
        setLoadError('保存失败')
        return
      }
      setTabs((prev) =>
        prev.map((t) =>
          t.relativePath === relativePath ? applySuccessfulSave(t, tab.content) : t
        )
      )
      setLoadError('')
    },
    [projectId]
  )

  const reloadTab = useCallback(
    async (relativePath: string): Promise<void> => {
      const r = await window.shy.projectFileRead({ projectId, relativePath })
      if (!r.ok) return
      setTabs((prev) =>
        prev.map((t) =>
          t.relativePath === relativePath
            ? {
                ...t,
                content: r.content,
                savedContent: r.content,
                dirty: false,
                conflict: false
              }
            : t
        )
      )
    },
    [projectId]
  )

  useEffect(() => {
    lastSeenIdRef.current = null
    let alive = true
    const tick = async (): Promise<void> => {
      const files = await window.shy.listSessionFiles(sessionId).catch(() => [])
      if (!alive) return
      const result = detectAgentWrites({
        tabs: tabsRef.current.map((t) => ({ relativePath: t.relativePath, dirty: t.dirty })),
        writes: files,
        lastSeenId: lastSeenIdRef.current,
        rootPath
      })
      lastSeenIdRef.current = result.nextSeenId
      if (result.conflict.length) {
        setTabs((prev) =>
          prev.map((t) =>
            result.conflict.includes(t.relativePath) ? { ...t, conflict: true } : t
          )
        )
      }
      for (const rel of result.reload) {
        const current = tabsRef.current.find((t) => t.relativePath === rel)
        if (!current || current.dirty) continue
        const r = await window.shy.projectFileRead({ projectId, relativePath: rel })
        if (!alive || !r.ok) continue
        setTabs((prev) =>
          prev.map((t) =>
            t.relativePath === rel && !t.dirty
              ? {
                  ...t,
                  content: r.content,
                  savedContent: r.content,
                  dirty: false,
                  conflict: false
                }
              : t
          )
        )
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), SESSION_FILES_POLL_MS)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [sessionId, projectId, rootPath])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (activePath) void saveTab(activePath)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activePath, saveTab])

  const closeTab = (relativePath: string): void => {
    const remaining = tabsRef.current.filter((t) => t.relativePath !== relativePath)
    setTabs(remaining)
    setActivePath((cur) => {
      if (cur !== relativePath) return cur
      return remaining[remaining.length - 1]?.relativePath ?? null
    })
  }

  const active = tabs.find((t) => t.relativePath === activePath) ?? null
  const fileName = (p: string): string => p.split(/[/\\]/).pop() ?? p

  return (
    <div className="code-workspace">
      <aside className="code-tree-pane">
        <FileTree
          projectId={projectId}
          rootPath={rootPath}
          activePath={activePath}
          onOpenFile={(path) => void openFile(path)}
        />
      </aside>
      <div className="code-workspace-main">
        <div className="code-tabs" role="tablist">
          {tabs.map((t) => (
            <div
              key={t.relativePath}
              className={`code-tab${t.relativePath === activePath ? ' active' : ''}`}
              role="tab"
              aria-selected={t.relativePath === activePath}
            >
              <button type="button" className="code-tab-main" onClick={() => setActivePath(t.relativePath)}>
                {fileName(t.relativePath)}
                {t.dirty ? <span className="code-tab-dirty" aria-label="未保存">●</span> : null}
              </button>
              <button
                type="button"
                className="code-tab-close"
                aria-label={`关闭 ${fileName(t.relativePath)}`}
                onClick={() => closeTab(t.relativePath)}
              >
                ×
              </button>
            </div>
          ))}
          {active ? (
            <button type="button" className="code-save" onClick={() => void saveTab(active.relativePath)}>
              保存
            </button>
          ) : null}
        </div>
        {active?.conflict ? (
          <div className="code-conflict-bar" role="status">
            <span>{AGENT_CONFLICT_HINT}</span>
            <button type="button" onClick={() => void reloadTab(active.relativePath)}>
              加载磁盘版本
            </button>
          </div>
        ) : null}
        {loadError ? (
          <div className="code-conflict-bar" role="alert">
            {loadError}
          </div>
        ) : null}
        <div className="code-editor-host">
          {active ? (
            <Editor
              path={active.relativePath}
              language={languageFromPath(active.relativePath)}
              theme={monacoTheme}
              value={active.content}
              onChange={(value) => {
                const next = value ?? ''
                setTabs((prev) =>
                  prev.map((t) =>
                    t.relativePath === active.relativePath
                      ? { ...t, content: next, dirty: next !== t.savedContent }
                      : t
                  )
                )
              }}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                wordWrap: 'on',
                automaticLayout: true,
                scrollBeyondLastLine: false
              }}
            />
          ) : (
            <div className="code-editor-empty">从文件树打开文件</div>
          )}
        </div>
      </div>
    </div>
  )
}
