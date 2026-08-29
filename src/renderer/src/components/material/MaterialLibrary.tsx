import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MaterialItem } from '../../../../shared/ipc'
import { SESSION_FILES_POLL_MS } from '../../lib/codeWorkspace'
import {
  DEFAULT_VIEWPORT,
  KIND_CHIPS,
  type CanvasViewport,
  type KindFilter,
  clampViewport,
  docSequenceOf,
  fileNameOf,
  filterMaterialsByKind,
  isReadableDoc,
  remapCollapsedAfterRename,
  toggleCollapsedPath
} from '../../lib/materialLibrary'
import { UiConfirmDialog } from '../ui'
import { Lightbox } from './Lightbox'
import { MaterialCanvas } from './MaterialCanvas'
import { MaterialContextMenu, type MaterialMenuTarget } from './MaterialContextMenu'
import { RenameMaterialDialog } from './RenameMaterialDialog'

type Props = {
  projectId: string
  sessionId: string
  onLightboxPathChange?: (path: string | null) => void
}

const STATE_SAVE_DEBOUNCE_MS = 300

type DeleteTarget = { absPath: string; detail: string }
type RenameTarget = { absPath: string; name: string; groupPath?: string }

function renameErrorMessage(error: string): string {
  if (error === 'name_taken') return '已存在同名文件或目录'
  if (error === 'invalid_name') return '名称不能为空，且不能包含路径分隔符'
  return '重命名失败'
}

export function MaterialLibrary({
  projectId,
  sessionId,
  onLightboxPathChange
}: Props): React.JSX.Element {
  const [items, setItems] = useState<MaterialItem[]>([])
  const [truncated, setTruncated] = useState(false)
  const [filter, setFilter] = useState<KindFilter>('all')
  const [selected, setSelected] = useState<MaterialItem | null>(null)
  const [viewport, setViewport] = useState<CanvasViewport | null>(null)
  const [collapsed, setCollapsed] = useState<string[]>([])
  const [menu, setMenu] = useState<{ x: number; y: number; target: MaterialMenuTarget } | null>(
    null
  )
  const [rename, setRename] = useState<RenameTarget | null>(null)
  const [renameError, setRenameError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<DeleteTarget | null>(null)
  const [error, setError] = useState('')
  const saveTimer = useRef<number | null>(null)
  const viewportRef = useRef<CanvasViewport | null>(null)
  const collapsedRef = useRef<string[]>([])
  viewportRef.current = viewport
  collapsedRef.current = collapsed

  useEffect(() => {
    onLightboxPathChange?.(selected?.relativePath ?? null)
  }, [selected, onLightboxPathChange])

  useEffect(() => {
    return () => {
      onLightboxPathChange?.(null)
    }
  }, [onLightboxPathChange])

  const persist = useCallback(
    (v: CanvasViewport, collapsedPaths: string[]): void => {
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null
        void window.shy
          .materialCanvasStateSet({
            projectId,
            state: {
              ...v,
              sortBy: 'mtime_desc',
              ...(collapsedPaths.length > 0 ? { collapsed: collapsedPaths } : {})
            }
          })
          .catch(() => {})
      }, STATE_SAVE_DEBOUNCE_MS)
    },
    [projectId]
  )

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

  // 项目切换：重置并读回持久化的画布视口与折叠
  useEffect(() => {
    setFilter('all')
    setSelected(null)
    setItems([])
    setTruncated(false)
    setError('')
    setViewport(null)
    setCollapsed([])
    setMenu(null)
    setRename(null)
    setConfirmDelete(null)
    let alive = true
    void window.shy
      .materialCanvasStateGet(projectId)
      .then((r) => {
        if (!alive) return
        const v = r.ok && r.state ? clampViewport(r.state) : DEFAULT_VIEWPORT
        setViewport(v)
        setCollapsed(r.ok && r.state?.collapsed ? r.state.collapsed : [])
      })
      .catch(() => {
        if (alive) {
          setViewport(DEFAULT_VIEWPORT)
          setCollapsed([])
        }
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

  const onViewportChange = useCallback(
    (v: CanvasViewport): void => {
      setViewport(v)
      persist(v, collapsedRef.current)
    },
    [persist]
  )

  const onToggleGroup = useCallback(
    (path: string): void => {
      setCollapsed((cur) => {
        const next = toggleCollapsedPath(cur, path)
        const v = viewportRef.current
        if (v) persist(v, next)
        return next
      })
    },
    [persist]
  )

  useEffect(
    () => () => {
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current)
    },
    []
  )

  const visible = useMemo(() => filterMaterialsByKind(items, filter), [items, filter])
  const docs = useMemo(() => docSequenceOf(items), [items])

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

  const openMenu = (e: React.MouseEvent, target: MaterialMenuTarget): void => {
    setMenu({ x: e.clientX, y: e.clientY, target })
  }

  const submitRename = async (name: string): Promise<void> => {
    if (!rename) return
    if (name === rename.name) {
      setRename(null)
      setRenameError('')
      return
    }
    const r = await window.shy.projectFileRename({
      projectId,
      absPath: rename.absPath,
      newName: name
    })
    if (!r.ok) {
      setRenameError(renameErrorMessage(r.error))
      return
    }
    if (rename.groupPath) {
      const parent = rename.groupPath.includes('/')
        ? rename.groupPath.slice(0, rename.groupPath.lastIndexOf('/'))
        : ''
      const nextPath = parent ? `${parent}/${name}` : name
      setCollapsed((cur) => {
        const next = remapCollapsedAfterRename(cur, rename.groupPath ?? '', nextPath)
        const v = viewportRef.current
        if (v) persist(v, next)
        return next
      })
    }
    setRename(null)
    setRenameError('')
    await refresh()
  }

  const submitDelete = async (): Promise<void> => {
    if (!confirmDelete) return
    const r = await window.shy.projectFileDelete({
      projectId,
      absPath: confirmDelete.absPath
    })
    setConfirmDelete(null)
    if (!r.ok) {
      setError('删除失败')
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
        <Lightbox
          projectId={projectId}
          item={selected}
          docs={isReadableDoc(selected) ? docs : null}
          onClose={() => setSelected(null)}
          onSelect={setSelected}
        />
      ) : viewport ? (
        <MaterialCanvas
          projectId={projectId}
          items={visible}
          viewport={viewport}
          collapsed={collapsed}
          onViewportChange={onViewportChange}
          onOpen={setSelected}
          onToggleGroup={onToggleGroup}
          onFileContext={(e, item) => openMenu(e, { kind: 'file', item })}
          onGroupContext={(e, group) =>
            openMenu(e, {
              kind: 'group',
              path: group.path,
              name: group.name,
              absPath: group.absPath
            })
          }
        />
      ) : null}
      {menu ? (
        <MaterialContextMenu
          x={menu.x}
          y={menu.y}
          target={menu.target}
          onClose={() => setMenu(null)}
          onRename={() => {
            const t = menu.target
            setRenameError('')
            setRename(
              t.kind === 'file'
                ? { absPath: t.item.absPath, name: fileNameOf(t.item) }
                : { absPath: t.absPath, name: t.name, groupPath: t.path }
            )
            setMenu(null)
          }}
          onReveal={
            menu.target.kind === 'file'
              ? () => {
                  const t = menu.target
                  if (t.kind !== 'file') return
                  void window.shy.projectReveal({ projectId, absPath: t.item.absPath })
                  setMenu(null)
                }
              : undefined
          }
          onOpenSystem={
            menu.target.kind === 'file'
              ? () => {
                  const t = menu.target
                  if (t.kind !== 'file') return
                  void window.shy.projectFileOpen({ projectId, absPath: t.item.absPath })
                  setMenu(null)
                }
              : undefined
          }
          onDelete={() => {
            const t = menu.target
            setConfirmDelete(
              t.kind === 'file'
                ? {
                    absPath: t.item.absPath,
                    detail: `将永久删除文件「${t.item.relativePath}」。此操作不可撤销。`
                  }
                : {
                    absPath: t.absPath,
                    detail: `将永久删除目录「${t.path}」及其内部全部文件。此操作不可撤销。`
                  }
            )
            setMenu(null)
          }}
        />
      ) : null}
      {rename ? (
        <RenameMaterialDialog
          title={rename.groupPath ? '重命名目录' : '重命名文件'}
          initialName={rename.name}
          error={renameError}
          onClearError={() => setRenameError('')}
          onCancel={() => {
            setRename(null)
            setRenameError('')
          }}
          onSubmit={(name) => void submitRename(name)}
        />
      ) : null}
      {confirmDelete ? (
        <UiConfirmDialog
          title="确认删除"
          detail={confirmDelete.detail}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void submitDelete()}
        />
      ) : null}
    </div>
  )
}
