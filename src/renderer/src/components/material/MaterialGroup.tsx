import type { MaterialItem } from '../../../../shared/ipc'
import type { PlacedGroup } from '../../lib/materialLibrary'
import { CANVAS_BUFFER, visiblePlaced } from '../../lib/materialLibrary'
import { CanvasCard } from './CanvasCard'

type ViewRect = { x: number; y: number; width: number; height: number }

type Props = {
  projectId: string
  group: PlacedGroup
  view: ViewRect
  parentX?: number
  parentY?: number
  onOpen: (item: MaterialItem) => void
  onToggle: (path: string) => void
  onFileContext: (e: React.MouseEvent, item: MaterialItem) => void
  onGroupContext: (e: React.MouseEvent, group: PlacedGroup) => void
}

export function MaterialGroup({
  projectId,
  group,
  view,
  parentX = 0,
  parentY = 0,
  onOpen,
  onToggle,
  onFileContext,
  onGroupContext
}: Props): React.JSX.Element {
  const visibleCards = group.collapsed ? [] : visiblePlaced(group.placed, view, CANVAS_BUFFER)

  return (
    <div
      className={`material-group${group.collapsed ? ' is-collapsed' : ''}`}
      style={{
        left: group.x - parentX,
        top: group.y - parentY,
        width: group.w,
        height: group.h
      }}
    >
      <button
        type="button"
        className="material-group-title"
        onClick={() => onToggle(group.path)}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onGroupContext(e, group)
        }}
      >
        <span className="material-group-chevron" aria-hidden="true">
          {group.collapsed ? '›' : '∨'}
        </span>
        <span className="material-group-name">{group.name}</span>
        <span className="material-group-count">({group.fileCount})</span>
      </button>
      {group.collapsed
        ? null
        : group.children.map((child) =>
            visiblePlaced([child], view, CANVAS_BUFFER).length === 0 ? null : (
              <MaterialGroup
                key={child.path}
                projectId={projectId}
                group={child}
                view={view}
                parentX={group.x}
                parentY={group.y}
                onOpen={onOpen}
                onToggle={onToggle}
                onFileContext={onFileContext}
                onGroupContext={onGroupContext}
              />
            )
          )}
      {visibleCards.map((p) => (
        <CanvasCard
          key={p.item.id}
          projectId={projectId}
          placed={{ ...p, x: p.x - group.x, y: p.y - group.y }}
          onOpen={onOpen}
          onContextMenu={onFileContext}
        />
      ))}
    </div>
  )
}
