import type { ActiveView } from '../../../shared/ipc'
import { toRelativePath } from './codeWorkspace'

export function resolveActiveView(
  workspaceKind: string | null | undefined,
  codePath: string | null | undefined,
  lightboxPath: string | null | undefined
): ActiveView | undefined {
  if (workspaceKind === 'code') return toView('code', codePath)
  if (workspaceKind === 'material') return toView('material', lightboxPath)
  return undefined
}

function toView(kind: ActiveView['kind'], path: string | null | undefined): ActiveView | undefined {
  if (!path) return undefined
  const relativePath = toRelativePath('', path)
  if (!relativePath) return undefined
  return { kind, relativePath }
}

export function chatPayload<T extends { message: string }>(
  base: T,
  activeView: ActiveView | undefined
): T & { activeView?: ActiveView } {
  if (!activeView) return { ...base }
  return { ...base, activeView }
}
