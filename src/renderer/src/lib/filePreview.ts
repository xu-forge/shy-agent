import type { TreeNode } from '../../../shared/ipc'

export type PreviewKind = 'image' | 'markdown' | 'html' | 'text' | 'other'

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.bmp', '.ico'])
const MARKDOWN_EXT = new Set(['.md', '.markdown', '.mdx'])
const HTML_EXT = new Set(['.html', '.htm'])
const TEXT_EXT = new Set([
  '.txt',
  '.json',
  '.csv',
  '.xml',
  '.yml',
  '.yaml',
  '.toml',
  '.ini',
  '.log',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.scss',
  '.less',
  '.py',
  '.rs',
  '.go',
  '.java',
  '.kt',
  '.c',
  '.h',
  '.cpp',
  '.cc',
  '.hpp',
  '.sh',
  '.bash',
  '.zsh',
  '.sql',
  '.vue',
  '.svelte',
  '.env',
  '.gitignore',
  '.mdc'
])

function extname(name: string): string {
  const base = name.replace(/\\/g, '/')
  const slash = base.lastIndexOf('/')
  const file = slash >= 0 ? base.slice(slash + 1) : base
  const dot = file.lastIndexOf('.')
  if (dot <= 0) return ''
  return file.slice(dot).toLowerCase()
}

/** 按扩展名分流只读预览。未知或二进制 → other（reveal / 系统打开）。 */
export function previewKind(name: string): PreviewKind {
  const ext = extname(name)
  if (IMAGE_EXT.has(ext)) return 'image'
  if (MARKDOWN_EXT.has(ext)) return 'markdown'
  if (HTML_EXT.has(ext)) return 'html'
  if (TEXT_EXT.has(ext)) return 'text'
  return 'other'
}

/** 按文件名（及目录名）筛选树，保留匹配文件的祖先目录。 */
export function filterTreeByName(nodes: TreeNode[], query: string): TreeNode[] {
  const q = query.trim().toLowerCase()
  if (!q) return nodes
  const walk = (list: TreeNode[]): TreeNode[] => {
    const out: TreeNode[] = []
    for (const node of list) {
      if (node.type === 'dir') {
        const children = walk(node.children ?? [])
        if (node.name.toLowerCase().includes(q) || children.length > 0) {
          out.push({ ...node, children })
        }
      } else if (node.name.toLowerCase().includes(q)) {
        out.push(node)
      }
    }
    return out
  }
  return walk(nodes)
}
