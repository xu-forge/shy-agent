import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SkillSummary } from '../../../shared/ipc'
import { ConfirmDialog } from './ConfirmDialog'
import { MarkdownBody } from './MarkdownBody'
import { Switch } from './ui'

const TEMPLATE = `---
name: example-skill
description: 示例技能
---

# example-skill

说明如何完成某类任务。可附带 scripts/ 下的脚本。
`

type Frontmatter = { name?: string; description?: string; rest: string[] }

function parseFrontmatter(md: string): Frontmatter {
  if (!md.startsWith('---')) return { rest: [] }
  const end = md.indexOf('\n---', 3)
  if (end < 0) return { rest: [] }
  const block = md.slice(3, end).trim()
  const lines = block.split(/\r?\n/)
  const fm: Frontmatter = { rest: [] }
  for (const line of lines) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!m) continue
    const key = m[1]!.toLowerCase()
    const val = m[2]!.trim()
    if (key === 'name') fm.name = val
    else if (key === 'description') fm.description = val
    else fm.rest.push(line)
  }
  return fm
}

/** 去掉 YAML frontmatter，返回正文（用于预览渲染） */
function stripFrontmatter(md: string): string {
  if (!md.startsWith('---')) return md
  const end = md.indexOf('\n---', 3)
  if (end < 0) return md
  return md.slice(end + 4).trimStart()
}

type DrawerState = { id?: string; markdown: string } | null

export function SkillsView(): React.JSX.Element {
  const [items, setItems] = useState<SkillSummary[]>([])
  const [query, setQuery] = useState('')
  const [drawer, setDrawer] = useState<DrawerState>(null)
  const [editing, setEditing] = useState(false)
  const [editSnapshot, setEditSnapshot] = useState('')
  const [savedHint, setSavedHint] = useState(false)
  const [confirmDel, setConfirmDel] = useState<{
    id: string
    name: string
    requestId: string
  } | null>(null)

  const reload = useCallback(async () => {
    setItems(await window.shy.listSkills())
  }, [])

  useEffect(() => {
    let alive = true
    void window.shy.listSkills().then((rows) => {
      if (alive) setItems(rows)
    })
    // minimax-feature-port：技能热重载 → skills_changed 自动刷新
    const off = window.shy.onEvent((payload) => {
      if ((payload as { type?: string }).type === 'skills_changed') void reload()
    })
    return () => {
      alive = false
      off()
    }
  }, [reload])

  const closeDrawer = useCallback((): void => {
    setDrawer(null)
    setEditing(false)
  }, [])

  const fm = useMemo(() => (drawer ? parseFrontmatter(drawer.markdown) : { rest: [] }), [drawer])
  const dirty = editing && drawer !== null && drawer.markdown !== editSnapshot

  // Esc：编辑中先退回查看，再关抽屉
  useEffect(() => {
    if (!drawer) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (editing && dirty) setEditing(false)
      else closeDrawer()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawer, editing, dirty, closeDrawer])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
    )
  }, [items, query])

  const openDetail = async (id: string): Promise<void> => {
    const skill = await window.shy.readSkill(id)
    setDrawer({ id: skill.id, markdown: skill.markdown })
    setEditing(false)
  }

  const openNew = (): void => {
    setDrawer({ id: undefined, markdown: TEMPLATE })
    setEditSnapshot(TEMPLATE)
    setEditing(true)
  }

  const startEdit = (): void => {
    if (!drawer) return
    setEditSnapshot(drawer.markdown)
    setEditing(true)
  }

  const cancelEdit = (): void => {
    setEditing(false)
  }

  const onSave = async (): Promise<void> => {
    if (!drawer || !fm.name) return
    const res = await window.shy.writeSkill({ id: drawer.id, markdown: drawer.markdown })
    await reload()
    setDrawer({ id: res.id, markdown: drawer.markdown })
    setEditing(false)
    setSavedHint(true)
    setTimeout(() => setSavedHint(false), 1600)
  }

  const onConfirmDelete = async (): Promise<void> => {
    if (!confirmDel) return
    await window.shy.deleteSkill(confirmDel.id)
    if (drawer?.id === confirmDel.id) closeDrawer()
    setConfirmDel(null)
    await reload()
  }

  return (
    <div className="main pane">
      <div className="pane-frame">
        <div className="pane-header">
          <h1>技能管理</h1>
          <p className="muted">本地 SKILL.md 包。点击卡片查看详情，也可让 Agent 生成新技能。</p>
        </div>

        <div className="memory-toolbar">
          <span className="ui-input-wrap skills-search">
            <span className="ui-input-affix" aria-hidden="true">
              <svg viewBox="0 0 16 16" width="14" height="14">
                <circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10.4 10.4 13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索名称 / 描述 / ID…"
              aria-label="搜索技能"
            />
          </span>
          <span className="count-chip">共 {items.length} 个</span>
          <button type="button" className="btn btn-primary" onClick={openNew}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            新建技能
          </button>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-inline">
            <span>{items.length === 0 ? '还没有技能。' : '没有匹配的技能。'}</span>
            {items.length === 0 ? (
              <button type="button" className="btn btn-outline" onClick={openNew}>
                创建第一个技能
              </button>
            ) : null}
          </div>
        ) : (
          <div className="skill-grid">
            {filtered.map((s) => (
              <div key={s.id} className="card skill-card">
                <button
                  type="button"
                  className="skill-card-main"
                  onClick={() => void openDetail(s.id)}
                  aria-label={`查看技能 ${s.name}`}
                >
                  <span className="card-title-row">
                    <strong>{s.name}</strong>
                    <span className={`skill-root-chip root-${s.rootKind ?? 'user'}`}>
                      {s.rootKind ?? 'user'}
                    </span>
                  </span>
                  <span className="card-meta">{s.id}</span>
                  <span className="muted skill-desc">{s.description || '暂无描述'}</span>
                </button>
                <div className="skill-enable" title="启用 / 禁用该技能">
                  <Switch
                    size="s"
                    checked={s.enabled !== false}
                    onChange={(checked) => {
                      void window.shy.setSkillEnabled(s.name, checked).then(reload)
                    }}
                    ariaLabel={`启用技能 ${s.name}`}
                  />
                  <span className="skill-enable-label">启用</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {drawer ? (
        <>
          <div className="drawer-backdrop" onClick={closeDrawer} />
          <aside className="drawer" role="dialog" aria-label={editing ? '编辑技能' : '技能详情'}>
            <header className="drawer-head">
              <strong>
                {editing ? (drawer.id ? '编辑技能' : '新建技能') : fm.name || '技能详情'}
              </strong>
              {editing ? (
                <span className="chip chip-agent">编辑中</span>
              ) : (
                <span className="chip chip-goal">详情</span>
              )}
              <button
                type="button"
                className="ui-modal-close drawer-close"
                aria-label="关闭"
                onClick={closeDrawer}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </header>

            {editing ? (
              <>
                <div className="frontmatter-strip" aria-label="frontmatter 预览">
                  <span className="chip">frontmatter</span>
                  <span>
                    <strong>name</strong>: {fm.name ?? <em className="muted">未设置</em>}
                  </span>
                  <span>
                    <strong>description</strong>:{' '}
                    {fm.description ?? <em className="muted">未设置</em>}
                  </span>
                  {dirty ? (
                    <span className="dirty-badge">
                      <span className="thinking-dot" aria-hidden="true" />
                      未保存
                    </span>
                  ) : null}
                </div>
                <textarea
                  className="skills-textarea"
                  value={drawer.markdown}
                  onChange={(e) => setDrawer({ ...drawer, markdown: e.target.value })}
                  rows={20}
                  spellCheck={false}
                  aria-label="技能 Markdown 编辑"
                  autoFocus
                />
                <div className="drawer-actions">
                  <button type="button" className="btn btn-ghost" onClick={cancelEdit}>
                    取消
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void onSave()}
                    disabled={!dirty || !fm.name}
                    title={!fm.name ? 'frontmatter 缺 name 字段' : !dirty ? '无修改' : ''}
                  >
                    {drawer.id ? '保存技能' : '创建技能'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="frontmatter-strip" aria-label="frontmatter 预览">
                  <span className="chip">frontmatter</span>
                  <span>
                    <strong>name</strong>: {fm.name ?? <em className="muted">未设置</em>}
                  </span>
                  <span>
                    <strong>description</strong>:{' '}
                    {fm.description ?? <em className="muted">未设置</em>}
                  </span>
                  {fm.rest.length > 0 ? (
                    <details>
                      <summary className="muted">其他字段（{fm.rest.length}）</summary>
                      <pre className="frontmatter-rest">{fm.rest.join('\n')}</pre>
                    </details>
                  ) : null}
                </div>
                <div className="skill-preview">
                  <MarkdownBody content={stripFrontmatter(drawer.markdown)} />
                </div>
                <div className="drawer-actions">
                  <button type="button" className="btn btn-ghost" onClick={closeDrawer}>
                    关闭
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() =>
                      drawer.id &&
                      setConfirmDel({
                        id: drawer.id,
                        name: fm.name ?? drawer.id,
                        requestId: drawer.id
                      })
                    }
                  >
                    删除
                  </button>
                  <button type="button" className="btn btn-primary" onClick={startEdit}>
                    编辑
                  </button>
                </div>
              </>
            )}
          </aside>
        </>
      ) : null}

      {savedHint ? <div className="toast">已保存</div> : null}

      {confirmDel ? (
        <ConfirmDialog
          action="删除技能"
          detail={`「${confirmDel.name}」目录将被删除。`}
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
