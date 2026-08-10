import { useCallback, useEffect, useState } from 'react'
import type { LongMemoryEntry } from '../../../shared/ipc'

export function MemoryView(): React.JSX.Element {
  const [items, setItems] = useState<LongMemoryEntry[]>([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [editingId, setEditingId] = useState<string | undefined>()

  const reload = useCallback(async () => {
    setItems(await window.myAgent.listMemory())
  }, [])

  useEffect(() => {
    let alive = true
    void window.myAgent.listMemory().then((rows) => {
      if (alive) setItems(rows)
    })
    return () => {
      alive = false
    }
  }, [])

  const onSave = async (): Promise<void> => {
    if (!title.trim() || !content.trim()) return
    await window.myAgent.upsertMemory({
      id: editingId,
      title: title.trim(),
      content: content.trim(),
      source: 'user'
    })
    setTitle('')
    setContent('')
    setEditingId(undefined)
    await reload()
  }

  const onEdit = (entry: LongMemoryEntry): void => {
    setEditingId(entry.id)
    setTitle(entry.title)
    setContent(entry.content)
  }

  const onDelete = async (id: string): Promise<void> => {
    if (!confirm('确认删除这条长期记忆？')) return
    await window.myAgent.deleteMemory(id)
    await reload()
  }

  return (
    <div className="main pane">
      <div className="pane-frame">
        <div className="pane-header">
          <h1>长期记忆</h1>
          <p className="muted">偏好、规范与可复用工作流。Agent 更新时会通知你。</p>
        </div>
        <div className="editor">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="标题（偏好 / 工作流 / 规范）"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="写下需要长期保留的内容…"
            rows={5}
          />
          <div className="row">
            <button type="button" className="primary" onClick={() => void onSave()}>
              {editingId ? '更新' : '新增'}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={() => {
                  setEditingId(undefined)
                  setTitle('')
                  setContent('')
                }}
              >
                取消编辑
              </button>
            ) : null}
          </div>
        </div>
        <div className="list">
          {items.map((item) => (
            <article key={item.id} className="card-like">
              <header>
                <strong>{item.title}</strong>
                <span className="muted">
                  {item.source === 'agent' ? 'Agent' : '你'} · v{item.revision} ·{' '}
                  {new Date(item.updatedAt).toLocaleString()}
                </span>
              </header>
              <pre>{item.content}</pre>
              <div className="row">
                <button type="button" onClick={() => onEdit(item)}>
                  编辑
                </button>
                <button type="button" className="danger" onClick={() => void onDelete(item.id)}>
                  删除
                </button>
              </div>
            </article>
          ))}
          {items.length === 0 ? <p className="muted">还没有长期记忆。</p> : null}
        </div>
      </div>
    </div>
  )
}
