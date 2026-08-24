export const AGENT_CONFLICT_HINT = 'Agent 已修改此文件，放弃本地更改以加载磁盘版本'
export const SESSION_FILES_POLL_MS = 5_000

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  md: 'markdown',
  markdown: 'markdown',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  sql: 'sql',
  vue: 'html',
  svelte: 'html',
  txt: 'plaintext'
}

export function monacoThemeFromDataset(theme: string | undefined): 'vs-dark' | 'vs' {
  return theme === 'dark' ? 'vs-dark' : 'vs'
}

export function toRelativePath(rootPath: string, absOrRel: string): string {
  const root = normalizeSlashes(rootPath).replace(/\/+$/, '')
  const path = normalizeSlashes(absOrRel)
  if (path === root) return ''
  if (root && (path === root || path.startsWith(`${root}/`))) {
    return path.slice(root.length + 1)
  }
  return path.replace(/^\.\//, '')
}

export function writeHitsTab(writePath: string, relativePath: string, rootPath: string): boolean {
  const writeRel = toRelativePath(rootPath, writePath)
  const tabRel = normalizeSlashes(relativePath)
  return writeRel === tabRel
}

export type OpenTabLite = { relativePath: string; dirty: boolean }

export type SessionWriteLite = { id: number; op: string; path: string }

export function detectAgentWrites(opts: {
  tabs: OpenTabLite[]
  writes: SessionWriteLite[]
  lastSeenId: number | null
  rootPath: string
}): { reload: string[]; conflict: string[]; nextSeenId: number } {
  const maxId = opts.writes.reduce((m, w) => Math.max(m, w.id), 0)
  const nextSeenId = opts.writes.length > 0 ? maxId : (opts.lastSeenId ?? 0)
  if (opts.lastSeenId === null) {
    return { reload: [], conflict: [], nextSeenId }
  }
  const reload: string[] = []
  const conflict: string[] = []
  for (const w of opts.writes) {
    if (w.id <= opts.lastSeenId || w.op !== 'write') continue
    for (const tab of opts.tabs) {
      if (!writeHitsTab(w.path, tab.relativePath, opts.rootPath)) continue
      if (tab.dirty) {
        if (!conflict.includes(tab.relativePath)) conflict.push(tab.relativePath)
      } else if (!reload.includes(tab.relativePath)) {
        reload.push(tab.relativePath)
      }
    }
  }
  return { reload, conflict, nextSeenId }
}

export function languageFromPath(relativePath: string): string {
  const base = relativePath.split(/[/\\]/).pop() ?? relativePath
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return 'plaintext'
  return LANGUAGE_BY_EXT[base.slice(dot + 1).toLowerCase()] ?? 'plaintext'
}

function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, '/')
}
