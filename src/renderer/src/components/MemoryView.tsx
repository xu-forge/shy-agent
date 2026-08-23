import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LongMemoryEntry } from '../../../shared/ipc'
import { ConfirmDialog } from './ConfirmDialog'
import { Select } from './ui'

type SourceFilter = 'all' | 'user' | 'agent'
type SortKey = 'updated' | 'created' | 'title'
type EditState = { id?: string; title: string; content: string; tagsText: string } | null
type ConfirmState = { id: string; title: string; requestId: string } | null

function parseTags(text: string): string[] {
  return text
    .split(/[,\n，]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function fmtDate(s: string): string {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString()
}

export function MemoryView(): React.JSX.Element {
  const [items, setItems] = useState<LongMemoryEntry[]>([])
  const [query, setQuery] = useState('')
  const [source, setSource] = useState<SourceFilter>('all')
  const [sort, setSort] = useState<SortKey>('updated')
  const [edit, setEdit] = useState<EditState>(null)
  const [confirmDel, setConfirmDel] = useState<ConfirmState>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const reload = useCallback(async () => {
    setItems(await window.shy.listMemory())
  }, [])

  useEffect(() => {
    let alive = true
    void window.shy.listMemory().then((rows) => {
      if (alive) setItems(rows)
    })
    return () => {
      alive = false
    }
  }, [])

  // Esc 关闭编辑抽屉
  useEffect(() => {
    if (!edit) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setEdit(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [edit])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let out = items
    if (source !== 'all') out = out.filter((m) => m.source === source)
    if (q) {
      out = out.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.content.toLowerCase().includes(q) ||
          m.tags.some((t) => t.toLowerCase().includes(q))
      )
    }
    out = [...out].sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title, 'zh-Hans-CN')
      const av = sort === 'updated' ? a.updatedAt : a.createdAt
      const bv = sort === 'updated' ? b.updatedAt : b.createdAt
      return bv.localeCompare(av)
    })
    return out
  }, [items, query, source, sort])

  const toggleExpand = (id: string): void => {
    setExpanded((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const onCreate = (): void => {
    setEdit({ id: undefined, title: '', content: '', tagsText: '' })
  }

  const onEdit = (entry: LongMemoryEntry): void => {
    setEdit({
      id: entry.id,
      title: entry.title,
      content: entry.content,
      tagsText: entry.tags.join(', ')
    })
  }

  const onSave = async (): Promise<void> => {
    if (!edit) return
    const title = edit.title.trim()
    const content = edit.content.trim()
    if (!title || !content) return
    await window.shy.upsertMemory({
      id: edit.id,
      title,
      content,
      tags: parseTags(edit.tagsText),
      source: 'user'
    })
    setEdit(null)
    await reload()
  }

  const onConfirmDelete = async (): Promise<void> => {
    if (!confirmDel) return
    await window.shy.deleteMemory(confirmDel.id)
    setConfirmDel(null)
    await reload()
  }

  return (
    <div className="memory-view">
      <div className="memory-toolbar">
        <input
          className="memory-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索标题 / 内容 / 标签…"
          aria-label="搜索长期记忆"
        />
        <div className="seg" role="tablist" aria-label="来源筛选">
          {(['all', 'user', 'agent'] as SourceFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={source === s}
              className={`seg-btn${source === s ? ' active' : ''}`}
              onClick={() => setSource(s)}
            >
              {s === 'all' ? '全部' : s === 'user' ? '用户' : 'Agent'}
            </button>
          ))}
        </div>
        <div className="sort-label">
          排序
          <Select
            value={sort}
            className="memory-sort"
            options={[
              { value: 'updated', label: '更新时间' },
              { value: 'created', label: '创建时间' },
              { value: 'title', label: '标题' }
            ]}
            onChange={(v) => setSort(v as SortKey)}
            ariaLabel="排序方式"
          />
        </div>
        <span className="count-chip">
          {filtered.length === items.length
            ? `共 ${items.length} 条`
            : `${filtered.length} / ${items.length} 条`}
        </span>
        <button type="button" className="btn btn-primary" onClick={onCreate}>
          + 新增
        </button>
      </div>

        {filtered.length === 0 ? (
          <div className="empty-inline">
            <span>{items.length === 0 ? '还没有长期记忆。' : '没有匹配的条目。'}</span>
            {items.length === 0 ? (
              <button type="button" className="btn btn-outline" onClick={onCreate}>
                写下第一条记忆
              </button>
            ) : null}
          </div>
        ) : (
          <div className="list">
            {filtered.map((item) => {
              const isExpanded = expanded.has(item.id)
              const longContent = item.content.length > 160
              return (
                <article key={item.id} className="card">
                  <header>
                    <div className="card-title-row">
                      <strong>{item.title}</strong>
                      <span className={`chip chip-${item.source}`}>
                        {item.source === 'agent' ? 'Agent' : '你'}
                      </span>
                    </div>
                    <span className="card-meta">
                      v{item.revision} · {fmtDate(item.updatedAt)}
                    </span>
                  </header>
                  {item.tags.length > 0 ? (
                    <div className="tag-row">
                      {item.tags.map((t) => (
                        <span key={t} className="tag">
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <pre className={`card-body${isExpanded ? ' expanded' : ''}`}>{item.content}</pre>
                  <div className="row">
                    {longContent ? (
                      <button
                        type="button"
                        className="btn btn-ghost expand-btn"
                        onClick={() => toggleExpand(item.id)}
                      >
                        {isExpanded ? '收起' : '展开全文'}
                      </button>
                    ) : null}
                    <button type="button" className="btn btn-outline" onClick={() => onEdit(item)}>
                      编辑
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() =>
                        setConfirmDel({ id: item.id, title: item.title, requestId: item.id })
                      }
                    >
                      删除
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      <p className="memory-view-foot">记忆由 agent 维护、更新时会通知你；过时或重复的条目可随时清理。</p>

      {edit ? (
        <>
          <div className="drawer-backdrop" onClick={() => setEdit(null)} />
          <aside className="drawer" role="dialog" aria-label="编辑长期记忆">
            <header className="drawer-head">
              <strong>{edit.id ? '编辑长期记忆' : '新增长期记忆'}</strong>
              <button type="button" className="ghost-btn" onClick={() => setEdit(null)}>
                关闭
              </button>
            </header>
            <label className="drawer-label">
              标题
              <input
                value={edit.title}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                placeholder="如：偏好用 ESM 导入"
                autoFocus
              />
            </label>
            <label className="drawer-label">
              标签
              <input
                value={edit.tagsText}
                onChange={(e) => setEdit({ ...edit, tagsText: e.target.value })}
                placeholder="逗号分隔，如：偏好, 工作流, 规范"
              />
            </label>
            <label className="drawer-label drawer-label-grow">
              内容
              <textarea
                value={edit.content}
                onChange={(e) => setEdit({ ...edit, content: e.target.value })}
                placeholder="写下需要长期保留的内容…"
                rows={10}
              />
            </label>
            <div className="drawer-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEdit(null)}>
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void onSave()}
                disabled={!edit.title.trim() || !edit.content.trim()}
              >
                {edit.id ? '更新' : '保存'}
              </button>
            </div>
          </aside>
        </>
      ) : null}

      {confirmDel ? (
        <ConfirmDialog
          action="删除长期记忆"
          detail={`「${confirmDel.title}」将被软删除，可在 SQLite 审计表恢复。`}
          requestId={confirmDel.requestId}
          onResolve={(id, approved) => {
            setConfirmDel(null)
            if (approved && id === confirmDel.id) void onConfirmDelete()
          }}
        />
      ) : null}
    </div>
  )
}
