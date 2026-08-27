import { toRelativePath } from './codeWorkspace'

export type ArtifactTreeFile = {
  type: 'file'
  name: string
  path: string
  absPath: string
}

export type ArtifactTreeDir = {
  type: 'dir'
  name: string
  path: string
  children: ArtifactTreeNode[]
}

export type ArtifactTreeNode = ArtifactTreeDir | ArtifactTreeFile

export function defaultSessionWorkspaceRoot(shyHome: string, sessionId: string): string {
  const home = shyHome.replace(/[/\\]+$/, '').replace(/\\/g, '/')
  return `${home}/sessions/${sessionId}/workspace`
}

function basename(p: string): string {
  const norm = p.replace(/\\/g, '/').replace(/\/+$/, '')
  const i = norm.lastIndexOf('/')
  return i >= 0 ? norm.slice(i + 1) : norm
}

function isAbsolutePath(p: string): boolean {
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p)
}

/** 工作区内：相对目录+文件名；工作区外：仅文件名。 */
export function artifactDisplayPath(workspaceRoot: string, filePath: string): string {
  const rel = toRelativePath(workspaceRoot, filePath)
  if (!rel) return basename(filePath) || filePath
  if (isAbsolutePath(rel)) return basename(rel)
  return rel
}

function sortNodes(nodes: ArtifactTreeNode[]): ArtifactTreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name, 'zh')
  })
}

function insertFile(
  nodes: ArtifactTreeNode[],
  parts: string[],
  dirPrefix: string,
  relPath: string,
  absPath: string
): void {
  if (parts.length === 0) return
  if (parts.length === 1) {
    const name = parts[0]
    if (!name) return
    if (nodes.some((n) => n.type === 'file' && n.path === relPath)) return
    nodes.push({ type: 'file', name, path: relPath, absPath })
    return
  }
  const dirName = parts[0]
  const nextPrefix = dirPrefix ? `${dirPrefix}/${dirName}` : dirName
  let dir = nodes.find((n): n is ArtifactTreeDir => n.type === 'dir' && n.name === dirName)
  if (!dir) {
    dir = { type: 'dir', name: dirName, path: nextPrefix, children: [] }
    nodes.push(dir)
  }
  insertFile(dir.children, parts.slice(1), nextPrefix, relPath, absPath)
}

export function buildArtifactTree(
  files: ReadonlyArray<{ path: string }>,
  workspaceRoot: string
): ArtifactTreeNode[] {
  const root: ArtifactTreeNode[] = []
  for (const f of files) {
    const rel = artifactDisplayPath(workspaceRoot, f.path)
    const parts = rel.split('/').filter(Boolean)
    if (parts.length === 0) continue
    insertFile(root, parts, '', rel, f.path)
  }
  const sortDeep = (nodes: ArtifactTreeNode[]): ArtifactTreeNode[] =>
    sortNodes(nodes).map((n) => (n.type === 'dir' ? { ...n, children: sortDeep(n.children) } : n))
  return sortDeep(root)
}
