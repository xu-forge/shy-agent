import { useEffect, useMemo, useState } from 'react'
import type { MaterialItem } from '../../../../shared/ipc'
import {
  type DocSequence,
  type MaterialGroupNode,
  countGroupFiles,
  dirOf,
  docForestOf,
  extOf,
  fileNameOf,
  isInlineDoc,
  materialSourceUrl,
  toggleCollapsedPath
} from '../../lib/materialLibrary'
import { MarkdownBody } from '../MarkdownBody'

type Props = {
  projectId: string
  item: MaterialItem
  docs?: DocSequence | null
  onClose: () => void
  onSelect: (item: MaterialItem) => void
}

export function Lightbox({ projectId, item, docs, onClose, onSelect }: Props): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  const [text, setText] = useState<string | null>(null)
  const ext = extOf(item)
  const src = materialSourceUrl(projectId, item.absPath)
  const index = docs?.items.findIndex((d) => d.id === item.id) ?? -1
  const showDocs = Boolean(docs && index >= 0 && docs.items.length > 0)
  const total = docs?.items.length ?? 0
  const forest = useMemo(
    () => (docs ? docForestOf(docs.items) : { rootFiles: [], groups: [] }),
    [docs]
  )
  const [collapsedDirs, setCollapsedDirs] = useState<string[]>([])

  useEffect(() => {
    const dir = dirOf(item.relativePath)
    if (!dir) {
      setCollapsedDirs((cur) => (cur.includes('') ? cur.filter((p) => p !== '') : cur))
      return
    }
    const ancestors = dir.split('/').map((_, i, parts) => parts.slice(0, i + 1).join('/'))
    setCollapsedDirs((cur) => cur.filter((p) => !ancestors.includes(p)))
  }, [item.id, item.relativePath])

  useEffect(() => {
    setFailed(false)
    setText(null)
  }, [item.id, item.mtimeMs])

  useEffect(() => {
    if (item.kind !== 'doc' || (ext !== 'md' && ext !== 'txt')) return
    let alive = true
    void window.shy
      .projectFileRead({ projectId, relativePath: item.relativePath })
      .then((r) => {
        if (alive) setText(r.ok ? r.content : null)
      })
      .catch(() => {
        if (alive) setText(null)
      })
    return () => {
      alive = false
    }
  }, [projectId, item.relativePath, item.kind, ext])

  const step = (delta: number): void => {
    if (!docs || index < 0 || docs.items.length === 0) return
    const next = docs.items[(index + delta + docs.items.length) % docs.items.length]
    if (next) onSelect(next)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, [contenteditable="true"]')) return
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (!showDocs || !docs) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        const prev = docs.items[(index - 1 + docs.items.length) % docs.items.length]
        if (prev) onSelect(prev)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        const next = docs.items[(index + 1) % docs.items.length]
        if (next) onSelect(next)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [docs, index, onClose, onSelect, showDocs])

  const openInSystem = (): void => {
    void window.shy.projectFileOpen({ projectId, absPath: item.absPath })
  }

  const body = (() => {
    if (item.kind === 'image') {
      return failed ? null : (
        <img
          className="lightbox-media"
          src={src}
          alt={fileNameOf(item)}
          draggable={false}
          onError={() => setFailed(true)}
        />
      )
    }
    if (item.kind === 'video') {
      return failed ? null : (
        <video
          className="lightbox-media"
          src={src}
          controls
          autoPlay
          onError={() => setFailed(true)}
        />
      )
    }
    if (item.kind === 'audio') {
      return (
        <div className="lightbox-audio">
          <p>{fileNameOf(item)}</p>
          <audio src={src} controls autoPlay />
        </div>
      )
    }
    if (item.kind === 'doc' && ext === 'pdf' && !failed) {
      return <iframe className="lightbox-frame" src={src} title={fileNameOf(item)} />
    }
    if (item.kind === 'doc' && isInlineDoc(item)) {
      return text == null ? (
        <p className="history-empty">加载中…</p>
      ) : ext === 'md' ? (
        <div className="lightbox-text">
          <MarkdownBody content={text} />
        </div>
      ) : (
        <pre className="lightbox-text">{text}</pre>
      )
    }
    return null
  })()

  const unsupported = body === null

  return (
    <div className="lightbox" role="dialog" aria-label="素材查看">
      <div className="lightbox-mask" onClick={onClose} />
      <div className="lightbox-bar">
        <div className="lightbox-title">
          <strong>{fileNameOf(item)}</strong>
          {showDocs ? (
            <span className="lightbox-index">
              {index + 1}/{total}
            </span>
          ) : null}
        </div>
        <div className="lightbox-actions">
          <button type="button" className="btn btn-outline" onClick={openInSystem}>
            用系统打开
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
      <div className={`lightbox-main${showDocs ? ' has-docs' : ''}`}>
        <div className="lightbox-body">
          {unsupported ? (
            <div className="lightbox-unsupported">
              <p>此类型不支持内嵌查看。</p>
              <button type="button" className="btn btn-outline" onClick={openInSystem}>
                用系统打开
              </button>
            </div>
          ) : (
            body
          )}
          {showDocs ? (
            <div className="lightbox-nav">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => step(-1)}
                aria-label="上一篇"
              >
                ‹
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => step(1)}
                aria-label="下一篇"
              >
                ›
              </button>
            </div>
          ) : null}
        </div>
        {showDocs && docs ? (
          <aside className="lightbox-docs" aria-label="文档列表">
            {forest.rootFiles.length > 0 ? (
              <div className="lightbox-docs-group">
                <button
                  type="button"
                  className="lightbox-docs-dir"
                  onClick={() => setCollapsedDirs((cur) => toggleCollapsedPath(cur, ''))}
                >
                  <span className="lightbox-docs-chevron" aria-hidden="true">
                    {collapsedDirs.includes('') ? '›' : '∨'}
                  </span>
                  根目录
                  <span className="lightbox-docs-count">({forest.rootFiles.length})</span>
                </button>
                {collapsedDirs.includes('')
                  ? null
                  : forest.rootFiles.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        className={`lightbox-docs-item${d.id === item.id ? ' is-current' : ''}`}
                        onClick={() => onSelect(d)}
                      >
                        {fileNameOf(d)}
                      </button>
                    ))}
              </div>
            ) : null}
            {forest.groups.map((g) => (
              <LightboxDocGroup
                key={g.path}
                node={g}
                currentId={item.id}
                collapsed={collapsedDirs}
                onToggle={(path) => setCollapsedDirs((cur) => toggleCollapsedPath(cur, path))}
                onSelect={onSelect}
              />
            ))}
          </aside>
        ) : null}
      </div>
    </div>
  )
}

function LightboxDocGroup({
  node,
  currentId,
  collapsed,
  onToggle,
  onSelect
}: {
  node: MaterialGroupNode
  currentId: string
  collapsed: readonly string[]
  onToggle: (path: string) => void
  onSelect: (item: MaterialItem) => void
}): React.JSX.Element {
  const open = !collapsed.includes(node.path)
  return (
    <div className="lightbox-docs-group">
      <button type="button" className="lightbox-docs-dir" onClick={() => onToggle(node.path)}>
        <span className="lightbox-docs-chevron" aria-hidden="true">
          {open ? '∨' : '›'}
        </span>
        {node.name}
        <span className="lightbox-docs-count">({countGroupFiles(node)})</span>
      </button>
      {open
        ? node.children.map((child) => (
            <LightboxDocGroup
              key={child.path}
              node={child}
              currentId={currentId}
              collapsed={collapsed}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))
        : null}
      {open
        ? node.files.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`lightbox-docs-item${d.id === currentId ? ' is-current' : ''}`}
              onClick={() => onSelect(d)}
            >
              {fileNameOf(d)}
            </button>
          ))
        : null}
    </div>
  )
}
