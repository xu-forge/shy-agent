import { useCallback, useEffect, useState } from 'react'
import type { SkillSummary } from '../../../shared/ipc'

const TEMPLATE = `---
name: example-skill
description: 示例技能
---

# example-skill

说明如何完成某类任务。可附带 scripts/ 下的脚本。
`

export function SkillsView(): React.JSX.Element {
  const [items, setItems] = useState<SkillSummary[]>([])
  const [markdown, setMarkdown] = useState(TEMPLATE)
  const [activeId, setActiveId] = useState<string | undefined>()

  const reload = useCallback(async () => {
    setItems(await window.myAgent.listSkills())
  }, [])

  useEffect(() => {
    let alive = true
    void window.myAgent.listSkills().then((rows) => {
      if (alive) setItems(rows)
    })
    return () => {
      alive = false
    }
  }, [])

  const onOpen = async (id: string): Promise<void> => {
    const skill = await window.myAgent.readSkill(id)
    setActiveId(skill.id)
    setMarkdown(skill.markdown)
  }

  const onSave = async (): Promise<void> => {
    await window.myAgent.writeSkill({ id: activeId, markdown })
    setActiveId(undefined)
    setMarkdown(TEMPLATE)
    await reload()
  }

  const onDelete = async (id: string): Promise<void> => {
    if (!confirm('确认删除该技能？')) return
    await window.myAgent.deleteSkill(id)
    if (activeId === id) {
      setActiveId(undefined)
      setMarkdown(TEMPLATE)
    }
    await reload()
  }

  return (
    <div className="main pane">
      <div className="pane-header">
        <h1>技能</h1>
        <p className="muted">本地 SKILL.md 包；支持创建/编辑/删除，Agent 也可写入。</p>
      </div>
      <div className="split">
        <div className="list">
          {items.map((s) => (
            <article key={s.id} className="card-like">
              <header>
                <strong>{s.name}</strong>
              </header>
              <p className="muted">{s.description || s.id}</p>
              <div className="row">
                <button type="button" onClick={() => void onOpen(s.id)}>
                  编辑
                </button>
                <button type="button" className="danger" onClick={() => void onDelete(s.id)}>
                  删除
                </button>
              </div>
            </article>
          ))}
          {items.length === 0 ? <p className="muted">暂无技能</p> : null}
        </div>
        <div className="editor">
          <textarea value={markdown} onChange={(e) => setMarkdown(e.target.value)} rows={18} />
          <div className="row">
            <button type="button" className="primary" onClick={() => void onSave()}>
              {activeId ? '保存技能' : '创建技能'}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveId(undefined)
                setMarkdown(TEMPLATE)
              }}
            >
              新建模板
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
