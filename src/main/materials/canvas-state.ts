import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { MaterialCanvasState } from '../../shared/ipc'
import { resolveShyHome } from '../paths'
import { sanitizeProjectId } from './thumbs'

function stateFileFor(projectId: string, home: string): string {
  return join(home, 'state', 'material-canvas', `${sanitizeProjectId(projectId)}.json`)
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** 损坏或缺失的状态一律回退 null（渲染层用默认视口）；旧格式（无 collapsed）按全展开兼容 */
export function readCanvasState(
  projectId: string,
  home = resolveShyHome()
): MaterialCanvasState | null {
  const file = stateFileFor(projectId, home)
  if (!existsSync(file)) return null
  try {
    const raw: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (!raw || typeof raw !== 'object') return null
    const s = raw as Record<string, unknown>
    if (!isFiniteNumber(s.x) || !isFiniteNumber(s.y) || !isFiniteNumber(s.scale)) return null
    const collapsed = Array.isArray(s.collapsed)
      ? s.collapsed.filter((p): p is string => typeof p === 'string')
      : []
    const state: MaterialCanvasState = { x: s.x, y: s.y, scale: s.scale, sortBy: 'mtime_desc' }
    if (collapsed.length > 0) state.collapsed = collapsed
    return state
  } catch {
    return null
  }
}

export function writeCanvasState(
  projectId: string,
  state: MaterialCanvasState,
  home = resolveShyHome()
): void {
  const file = stateFileFor(projectId, home)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, JSON.stringify(state))
}
