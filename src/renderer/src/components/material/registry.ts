import type { MaterialItem } from '../../../../shared/ipc'

export type MaterialEditor = {
  id: string
  kinds: Array<MaterialItem['kind']>
  mime?: string[]
  label: string
}

export const materialEditors: MaterialEditor[] = []

export function registerMaterialEditor(e: MaterialEditor): void {
  materialEditors.push(e)
}
