import { useEffect, useMemo, useState } from 'react'
import type { TreeNode } from '../../../../shared/ipc'
import { toRelativePath } from '../../lib/codeWorkspace'
import { filterTreeByName, previewKind } from '../../lib/filePreview'
import { MarkdownBody } from '../MarkdownBody'

type Props = {
  sessionId: string
}

type PreviewState =
  | { kind: 'empty' }
  | { kind: 'loading' }
  | { kind: 'image'; dataUrl: string }
  | { kind: 'markdown' | 'html' | 'text'; content: string; truncated: boolean }
  | { kind: 'other'; relativePath: string }
  | { kind: 'error'; message: string }

export function DockFilesView({ sessionId }: Props): React.JSX.Element {
  const [nodes, setNodes] = useState<TreeNode[]>([])
  const [rootPath, setRootPath] = useState('')
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [activePath, setActivePath] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewState>({ kind: 'empty' })

  useEffect(() => {
    let alive = true
    setActivePath(null)
    setPreview({ kind: 'empty' })
    setQuery('')
    window.shy
      .dockTreeList(sessionId)
      .then((r) => {
        if (!alive) return
        if (!r.ok) {
          setError('无法加载文件树')
          setNodes([])
          setRootPath('')
          setTruncated(false)
          return
        }
        setError('')
        setNodes(r.tree)
        setRootPath(r.rootPath)
        setTruncated(r.truncated)
        setExpanded(new Set(r.tree.filter((n) => n.type === 'dir').map((n) => n.path)))
      })
      .catch(() => {
        if (alive) setError('无法加载文件树')
      })
    return () => {
      alive = false
    }
  }, [sessionId])

  const visible = useMemo(() => filterTreeByName(nodes, query), [nodes, query])

  const toggle = (path: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const openFile = async (relativePath: string): Promise<void> => {
    setActivePath(relativePath)
    const kind = previewKind(relativePath)
    if (kind === 'other') {
      setPreview({ kind: 'other', relativePath })
      return
    }
    setPreview({ kind: 'loading' })
    try {
      if (kind === 'image') {
        const r = await window.shy.dockFileReadDataUrl({ sessionId, relativePath })
        if (!r.ok) {
          setPreview({ kind: 'error', message: '无法读取图片' })
          return
        }
        setPreview({ kind: 'image', dataUrl: r.dataUrl })
        return
      }
      const r = await window.shy.dockFileRead({ sessionId, relativePath })
      if (!r.ok) {
        setPreview({ kind: 'error', message: '无法读取文件' })
        return
      }
      setPreview({ kind, content: r.content, truncated: r.truncated })
    } catch {
      setPreview({ kind: 'error', message: '无法读取文件' })
    }
  }

  return (
    <div className="dock-files dock-page">
      <div className="dock-files-tree">
        <h3 className="inspector-pane-title">目录</h3>
        <input
          className="dock-files-filter"
          type="search"
          placeholder="筛选文件名"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="筛选文件名"
        />
        {truncated ? <p className="file-tree-truncated">文件树已截断（超过上限）</p> : null}
        {error ? <p className="inspector-empty">{error}</p> : null}
        <div className="dock-files-list-wrap">
          {!error && visible.length === 0 ? (
            <p className="inspector-empty">没有可显示的文件</p>
          ) : null}
          <ul className="inspector-tree dock-files-list">
            {visible.map((node) => (
              <DockTreeItem
                key={node.path}
                node={node}
                rootPath={rootPath}
                activePath={activePath}
                expanded={expanded}
                onToggle={toggle}
                onOpenFile={(rel) => void openFile(rel)}
              />
            ))}
          </ul>
        </div>
      </div>
      <section className="dock-files-preview" aria-label="文件预览">
        <h3 className="inspector-pane-title">预览</h3>
        <div className="dock-files-preview-body">
          <DockPreview
            preview={preview}
            onReveal={(rel) => void window.shy.dockFileReveal({ sessionId, relativePath: rel })}
            onOpen={(rel) => void window.shy.dockFileOpen({ sessionId, relativePath: rel })}
          />
        </div>
      </section>
    </div>
  )
}

function DockTreeItem({
  node,
  rootPath,
  activePath,
  expanded,
  onToggle,
  onOpenFile
}: {
  node: TreeNode
  rootPath: string
  activePath: string | null
  expanded: Set<string>
  onToggle: (path: string) => void
  onOpenFile: (relativePath: string) => void
}): React.JSX.Element {
  const relativePath = toRelativePath(rootPath, node.path)
  if (node.type === 'dir') {
    const open = expanded.has(node.path)
    return (
      <li>
        <button
          type="button"
          className="inspector-tree-dir"
          onClick={() => onToggle(node.path)}
          aria-expanded={open}
        >
          <span className="inspector-tree-chevron" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
          {node.name}
        </button>
        {open && node.children?.length ? (
          <ul className="inspector-tree">
            {node.children.map((child) => (
              <DockTreeItem
                key={child.path}
                node={child}
                rootPath={rootPath}
                activePath={activePath}
                expanded={expanded}
                onToggle={onToggle}
                onOpenFile={onOpenFile}
              />
            ))}
          </ul>
        ) : null}
      </li>
    )
  }
  return (
    <li>
      <button
        type="button"
        className={`inspector-tree-file${activePath === relativePath ? ' active' : ''}`}
        onClick={() => onOpenFile(relativePath)}
        title={relativePath}
      >
        {node.name}
      </button>
    </li>
  )
}

function DockPreview({
  preview,
  onReveal,
  onOpen
}: {
  preview: PreviewState
  onReveal: (relativePath: string) => void
  onOpen: (relativePath: string) => void
}): React.JSX.Element {
  if (preview.kind === 'empty') {
    return <div className="inspector-empty">选择一个文件以预览</div>
  }
  if (preview.kind === 'loading') {
    return <div className="inspector-empty">加载中…</div>
  }
  if (preview.kind === 'error') {
    return <div className="inspector-empty">{preview.message}</div>
  }
  if (preview.kind === 'image') {
    return <img className="dock-preview-image" src={preview.dataUrl} alt="" />
  }
  if (preview.kind === 'markdown') {
    return (
      <div className="dock-preview-scroll">
        {preview.truncated ? <p className="dock-preview-truncated">内容已截断</p> : null}
        <MarkdownBody content={preview.content} />
      </div>
    )
  }
  if (preview.kind === 'html') {
    return (
      <iframe
        className="dock-preview-html"
        sandbox=""
        srcDoc={preview.content}
        title="HTML 预览"
      />
    )
  }
  if (preview.kind === 'text') {
    return (
      <div className="dock-preview-scroll">
        {preview.truncated ? <p className="dock-preview-truncated">内容已截断</p> : null}
        <pre className="dock-preview-text">{preview.content}</pre>
      </div>
    )
  }
  if (preview.kind !== 'other') {
    return <div className="inspector-empty">选择一个文件以预览</div>
  }
  return (
    <div className="inspector-empty">
      <div className="inspector-empty-title">无法预览此类型</div>
      <div className="dock-preview-actions">
        <button type="button" className="layout-switch-btn" onClick={() => onReveal(preview.relativePath)}>
          在访达中显示
        </button>
        <button type="button" className="layout-switch-btn" onClick={() => onOpen(preview.relativePath)}>
          用系统打开
        </button>
      </div>
    </div>
  )
}
