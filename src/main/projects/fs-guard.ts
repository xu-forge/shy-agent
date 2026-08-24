import { copyFileSync, readdirSync, statSync, existsSync } from 'fs'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'path'
import type { MaterialItem, MaterialKind } from '../../shared/ipc'

export type { MaterialItem, MaterialKind }

export const TREE_IGNORE = ['node_modules', '.git', 'dist', 'out', '.next', 'coverage', '.shy']
export const TREE_NODE_LIMIT = 5000

export type TreeNode = { name: string; path: string; type: 'file' | 'dir'; children?: TreeNode[] }

const KIND_BY_EXT: Record<string, MaterialKind> = {
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.webp': 'image',
  '.gif': 'image',
  '.mp4': 'video',
  '.mov': 'video',
  '.webm': 'video',
  '.mp3': 'audio',
  '.wav': 'audio',
  '.m4a': 'audio',
  '.pdf': 'doc',
  '.doc': 'doc',
  '.docx': 'doc',
  '.md': 'doc',
  '.txt': 'doc'
}

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.md': 'text/markdown',
  '.txt': 'text/plain'
}

export function assertInsideRoot(rootPath: string, target: string): string {
  const root = resolve(rootPath)
  const resolved = resolve(root, target)
  const rel = relative(root, resolved)
  if (rel === '') return resolved
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error('path_escape')
  }
  return resolved
}

export function kindFromName(name: string): MaterialKind {
  return KIND_BY_EXT[extname(name).toLowerCase()] ?? 'other'
}

function mimeFromName(name: string): string {
  return MIME_BY_EXT[extname(name).toLowerCase()] ?? 'application/octet-stream'
}

function posixRel(root: string, absPath: string): string {
  return relative(root, absPath).split(sep).join('/')
}

function toMaterialItem(root: string, absPath: string, sourceSessionId?: string): MaterialItem {
  const resolved = assertInsideRoot(root, absPath)
  const name = basename(resolved)
  const stat = statSync(resolved)
  const id = posixRel(root, resolved)
  const item: MaterialItem = {
    id,
    relativePath: id,
    absPath: resolved,
    kind: kindFromName(name),
    mime: mimeFromName(name),
    mtimeMs: stat.mtimeMs,
    size: stat.size
  }
  if (sourceSessionId) item.sourceSessionId = sourceSessionId
  return item
}

export function listProjectTree(rootPath: string): { tree: TreeNode[]; truncated: boolean } {
  const root = resolve(rootPath)
  let count = 0
  let truncated = false

  function walk(dir: string): TreeNode[] {
    if (truncated) return []
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return []
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    const nodes: TreeNode[] = []
    for (const entry of entries) {
      if (TREE_IGNORE.includes(entry.name)) continue
      if (count >= TREE_NODE_LIMIT) {
        truncated = true
        break
      }
      const abs = join(dir, entry.name)
      count++
      if (entry.isDirectory()) {
        nodes.push({ name: entry.name, path: abs, type: 'dir', children: walk(abs) })
      } else {
        nodes.push({ name: entry.name, path: abs, type: 'file' })
      }
    }
    return nodes
  }

  return { tree: walk(root), truncated }
}

export function listMaterials(
  rootPath: string,
  writes?: Array<{ path: string; sessionId: string }>
): MaterialItem[] {
  const root = resolve(rootPath)
  const writeByAbs = new Map<string, string>()
  for (const w of writes ?? []) {
    writeByAbs.set(resolve(w.path), w.sessionId)
  }
  const items: MaterialItem[] = []

  function walk(dir: string): void {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (TREE_IGNORE.includes(entry.name)) continue
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(abs)
        continue
      }
      if (!entry.isFile()) continue
      const resolved = resolve(abs)
      items.push(toMaterialItem(root, resolved, writeByAbs.get(resolved)))
    }
  }

  walk(root)
  return items
}

function uniqueImportDest(rootPath: string, sourceAbsPath: string): string {
  const base = basename(sourceAbsPath)
  const ext = extname(base)
  const stem = basename(base, ext)
  let dest = join(rootPath, base)
  let n = 1
  while (existsSync(dest)) {
    dest = join(rootPath, `${stem}-${n}${ext}`)
    n++
  }
  return dest
}

export function importMaterial(rootPath: string, sourceAbsPath: string): MaterialItem {
  const root = resolve(rootPath)
  const dest = assertInsideRoot(root, uniqueImportDest(root, sourceAbsPath))
  copyFileSync(sourceAbsPath, dest)
  return toMaterialItem(root, dest)
}
