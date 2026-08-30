export type DockMode = 'tasks' | 'browser' | 'files' | null

export const DOCK_MODE_KEY = 'shy.dockMode'
export const DOCK_WIDTH_KEY = 'shy.dockWidth'
export const DOCK_MIN_WIDTH = 340
export const DOCK_MAX_WIDTH = 720
export const DOCK_DEFAULT_WIDTH = 340
/** 旧键：仅用于读一次迁移。 */
export const LEGACY_INSPECTOR_OPEN_KEY = 'shy.inspectorOpen'

const MODES: ReadonlySet<string> = new Set(['tasks', 'browser', 'files'])

/**
 * 解析 Dock 模式。
 * - `tasks` / `browser` / `files` → 对应模式
 * - 已写入但非法或空串 → `null`（收起）
 * - 键缺失时：旧 `shy.inspectorOpen=true` → `tasks`，其余缺省 `null`
 */
export function parseDockMode(
  dockRaw: string | null,
  inspectorOpenRaw?: string | null
): DockMode {
  if (dockRaw !== null) {
    return MODES.has(dockRaw) ? (dockRaw as Exclude<DockMode, null>) : null
  }
  if (inspectorOpenRaw === 'true') return 'tasks'
  return null
}

export function serializeDockMode(mode: DockMode): string {
  return mode ?? ''
}

/** 再点当前模式则收起。 */
export function toggleDockMode(current: DockMode, next: Exclude<DockMode, null>): DockMode {
  return current === next ? null : next
}

/**
 * 会话主列本身有 inspector 时始终挂载 Dock（可收起）。
 * 素材/代码 IDE 默认不挂；用户打开链接等把 dockMode 设为非 null 时再挂上。
 */
export function shouldRenderSessionDock(showInspector: boolean, dockMode: DockMode): boolean {
  return showInspector || dockMode !== null
}

export function clampDockWidth(w: number): number {
  if (!Number.isFinite(w)) return DOCK_DEFAULT_WIDTH
  return Math.min(DOCK_MAX_WIDTH, Math.max(DOCK_MIN_WIDTH, Math.round(w)))
}

export function parseDockWidth(raw: string | null): number {
  const n = Number(raw)
  return clampDockWidth(n > 0 ? n : DOCK_DEFAULT_WIDTH)
}
