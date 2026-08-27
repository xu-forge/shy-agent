import { mkdirSync, readFileSync } from 'fs'
import { listProjectTree, readFileAsDataUrl } from '../projects/fs-guard'
import { resolveProjectFilePath } from '../projects/ipc-helpers'
import { resolveAgentWorkspace } from '../projects/workspace'
import type { TreeNode } from '../../shared/ipc'

export const DOCK_PREVIEW_TEXT_MAX = 512 * 1024

/** 绑定项目用 rootPath，否则会话 workspace；目录不存在则创建。 */
export function ensureDockRoot(sessionId: string): string {
  const root = resolveAgentWorkspace(sessionId)
  mkdirSync(root, { recursive: true })
  return root
}

export function listDockTree(sessionId: string): {
  rootPath: string
  tree: TreeNode[]
  truncated: boolean
} {
  const rootPath = ensureDockRoot(sessionId)
  const { tree, truncated } = listProjectTree(rootPath)
  return { rootPath, tree, truncated }
}

export function resolveDockFile(sessionId: string, relativePath: string): string {
  return resolveProjectFilePath(ensureDockRoot(sessionId), relativePath)
}

export function readDockFileText(
  sessionId: string,
  relativePath: string
): { content: string; truncated: boolean } {
  const abs = resolveDockFile(sessionId, relativePath)
  const buf = readFileSync(abs)
  const truncated = buf.length > DOCK_PREVIEW_TEXT_MAX
  return {
    content: buf.subarray(0, DOCK_PREVIEW_TEXT_MAX).toString('utf8'),
    truncated
  }
}

export function readDockFileDataUrl(sessionId: string, relativePath: string): string {
  return readFileAsDataUrl(ensureDockRoot(sessionId), relativePath)
}
