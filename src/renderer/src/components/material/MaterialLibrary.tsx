import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MaterialItem } from '../../../../shared/ipc'
import { SESSION_FILES_POLL_MS } from '../../lib/codeWorkspace'
import {
  KIND_CHIPS,
  fileNameOf,
  filterMaterialsByKind,
  type KindFilter
} from '../../lib/materialLibrary'
import { MaterialViewer } from './MaterialViewer'

type Props = {
  projectId: string
  sessionId: string
}

export function MaterialLibrary({ projectId, sessionId }: Props): React.JSX.Element {
  const [items, setItems] = useState<MaterialItem[]>([])
  const [truncated, setTruncated] = useState(false)
  const [filter, setFilter] = useState<KindFilter>('all')
  const [selected, setSelected] = useState<MaterialItem | null>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async (): Promise<void> => {
    const r = await window.shy.projectMaterialsList(projectId)
    if (!r.ok) {
      setError('无法加载素材库')
      setItems([])
      setTruncated(false)
      return
    }
    setError('')
    setItems(r.items)
    setTruncated(r.truncated)
    setSelected((cur) => (cur ? (r.items.find((i) => i.id === cur.id) ?? null) : null))
  }, [projectId])

  useEffect(() => {
    setFilter('all')
    setSelected(null)
    setItems([])
    setTruncated(false)
    setError('')
  }, [projectId])

  useEffect(() => {
    let alive = true
    const tick = async (): Promise<void> => {
      if (sessionId) {
        await window.shy.listSessionFiles(sessionId).catch(() => [])
      }
      if (!alive) return
      await refresh()
    }
    void tick()
    const id = window.setInterval(() => void tick(), SESSION_FILES_POLL_MS)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [projectId, sessionId, refresh])

  const visible = useMemo(() => filterMaterialsByKind(items, filter), [items, filter])

  const onImport = async (): Promise<void> => {
    const picked = await window.shy.pickFile()
    if (!picked.ok) return
    const r = await window.shy.projectMaterialsImport({
      projectId,
      sourceAbsPath: picked.path
    })
    if (!r.ok) {
      setError('导入失败')
      return
    }
    await refresh()
  }

  return (
    <div className="material-library">
      <div className="material-toolbar">
        <div className="material-chips" role="tablist" aria-label="素材类型">
          {KIND_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={`chip${filter === chip.id ? ' chip-mode' : ''}`}
              aria-pressed={filter === chip.id}
              onClick={() => setFilter(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-outline" onClick={() => void onImport()}>
          导入
        </button>
      </div>
      {error ? <p className="history-empty">{error}</p> : null}
      {truncated ? <p className="file-tree-truncated">素材列表已截断（超过上限）</p> : null}
      {selected ? (
        <MaterialViewer projectId={projectId} item={selected} onClose={() => setSelected(null)} />
      ) : (
        <div className="material-grid" aria-label="素材网格">
          {visible.length === 0 && !error ? (
            <p className="history-empty">暂无素材</p>
          ) : null}
          {visible.map((item) => (
            <button
              key={item.id}
              type="button"
              className="material-card"
              onClick={() => setSelected(item)}
            >
              <span className="material-card-kind">{kindLabel(item.kind)}</span>
              <span className="material-card-name">{fileNameOf(item)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function kindLabel(kind: MaterialItem['kind']): string {
  switch (kind) {
    case 'image':
      return '图片'
    case 'video':
      return '视频'
    case 'audio':
      return '音频'
    case 'doc':
      return '文档'
    default:
      return '其他'
  }
}
