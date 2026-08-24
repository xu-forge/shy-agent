import { useEffect, useState } from 'react'
import type { TreeNode } from '../../../../shared/ipc'
import { toRelativePath } from '../../lib/codeWorkspace'

type Props = {
  projectId: string
  rootPath: string
  activePath: string | null
  onOpenFile: (relativePath: string) => void
}

export function FileTree({ projectId, rootPath, activePath, onOpenFile }: Props): React.JSX.Element {
  const [nodes, setNodes] = useState<TreeNode[]>([])
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    let alive = true
    window.shy
      .projectTreeList(projectId)
      .then((r) => {
        if (!alive) return
        if (!r.ok) {
          setError('无法加载文件树')
          setNodes([])
          setTruncated(false)
          return
        }
        setError('')
        setNodes(r.tree)
        setTruncated(r.truncated)
        setExpanded(new Set(r.tree.filter((n) => n.type === 'dir').map((n) => n.path)))
      })
      .catch(() => {
        if (alive) setError('无法加载文件树')
      })
    return () => {
      alive = false
    }
  }, [projectId])

  const toggle = (path: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <div className="file-tree" aria-label="文件树">
      <div className="sb-list-head">文件树</div>
      {truncated ? <p className="file-tree-truncated">文件树已截断（超过上限）</p> : null}
      {error ? <p className="history-empty">{error}</p> : null}
      {!error && nodes.length === 0 ? <p className="history-empty">没有可显示的文件</p> : null}
      <ul className="file-tree-list">
        {nodes.map((node) => (
          <TreeItem
            key={node.path}
            node={node}
            rootPath={rootPath}
            activePath={activePath}
            expanded={expanded}
            onToggle={toggle}
            onOpenFile={onOpenFile}
          />
        ))}
      </ul>
    </div>
  )
}

function TreeItem({
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
          className="file-tree-dir"
          onClick={() => onToggle(node.path)}
          aria-expanded={open}
        >
          <span className="file-tree-chevron" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
          {node.name}
        </button>
        {open && node.children?.length ? (
          <ul className="file-tree-list">
            {node.children.map((child) => (
              <TreeItem
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
        className={`file-tree-file${activePath === relativePath ? ' active' : ''}`}
        onClick={() => onOpenFile(relativePath)}
        title={relativePath}
      >
        {node.name}
      </button>
    </li>
  )
}
