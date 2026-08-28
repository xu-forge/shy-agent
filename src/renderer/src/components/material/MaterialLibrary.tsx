import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MaterialItem } from '../../../../shared/ipc'
import { SESSION_FILES_POLL_MS } from '../../lib/codeWorkspace'
import {
  DEFAULT_VIEWPORT,
  KIND_CHIPS,
  type CanvasViewport,
  type KindFilter,
  clampViewport,
  filterMaterialsByKind
} from '../../lib/materialLibrary'
import { MaterialCanvas } from './MaterialCanvas'
import { Lightbox } from './Lightbox'

type Props = {
  projectId: string
  sessionId: string
}

const STATE_SAVE_DEBOUNCE_MS = 300

export function MaterialLibrary({ projectId, sessionId }: Props): React.JSX.Element {
  const [items, setItems] = useState<MaterialItem[]>([])
  const [truncated, setTruncated] = useState(false)
  const [filter, setFilter] = useState<KindFilter>('all')
  const [selected, setSelected] = useState<MaterialItem | null>(null)
  const [viewport, setViewport] = useState<CanvasViewport | null>(null)
  const [error, setError] = useState('')
  const saveTimer = useRef<number | null>(null)

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

  // 项目切换：重置并读回持久化的画布视口
  useEffect(() => {
    setFilter('all')
    setSelected(null)
    setItems([])
    setTruncated(false)
    setError('')
    setViewport(null)
    let alive = true
    void window.shy
      .materialCanvasStateGet(projectId)
      .then((r) => {
        if (!alive) return
        const v = r.ok && r.state ? clampViewport(r.state) : DEFAULT_VIEWPORT
        setViewport(v)
      })
      .catch(() => {
        if (alive) setViewport(DEFAULT_VIEWPORT)
      })
    return () => {
      alive = false
    }
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

  // 视口变化防抖持久化
  const onViewportChange = useCallback(
    (v: CanvasViewport): void => {
      setViewport(v)
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null
        void window.shy
          .materialCanvasStateSet({ projectId, state: { ...v, sortBy: 'mtime_desc' } })
          .catch(() => {})
      }, STATE_SAVE_DEBOUNCE_MS)
    },
    [projectId]
  )

  useEffect(
    () => () => {
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current)
    },
    []
  )

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
      {selected && viewport ? (
        <Lightbox projectId={projectId} item={selected} onClose={() => setSelected(null)} />
      ) : viewport ? (
        <MaterialCanvas
          projectId={projectId}
          items={visible}
          viewport={viewport}
          onViewportChange={onViewportChange}
          onOpen={setSelected}
        />
      ) : null}
    </div>
  )
}
