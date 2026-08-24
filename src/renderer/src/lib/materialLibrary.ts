import type { MaterialItem, MaterialKind } from '../../../shared/ipc'
import type { MaterialEditor } from '../components/material/registry'

export type KindFilter = 'all' | Exclude<MaterialKind, 'other'>

export const KIND_CHIPS: Array<{ id: KindFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'image', label: '图片' },
  { id: 'video', label: '视频' },
  { id: 'audio', label: '音频' },
  { id: 'doc', label: '文档' }
]

export function filterMaterialsByKind(
  items: MaterialItem[],
  filter: KindFilter
): MaterialItem[] {
  if (filter === 'all') return items
  return items.filter((item) => item.kind === filter)
}

export function shouldShowEditButton(editors: MaterialEditor[]): boolean {
  return editors.length > 0
}

export function viewerModeForKind(kind: MaterialKind): 'preview' | 'system' {
  return kind === 'image' ? 'preview' : 'system'
}

export function sessionFilesFingerprint(
  files: Array<{ id: number; op: string; path: string }>
): string {
  return files.map((f) => `${f.id}:${f.op}:${f.path}`).join('|')
}

export function fileNameOf(item: MaterialItem): string {
  return item.relativePath.split(/[/\\]/).pop() ?? item.relativePath
}
