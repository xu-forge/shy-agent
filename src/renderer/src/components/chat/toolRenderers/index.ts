import type { ComponentType } from 'react'
import { ToolCallCard, type ToolStatus } from '../ToolCallCard'

export type ToolRendererProps = {
  toolName: string
  input?: unknown
  result?: unknown
  error?: string
  status?: ToolStatus
  isLast?: boolean
}

type ToolRenderer = ComponentType<ToolRendererProps>

const registry = new Map<string, ToolRenderer>()

export function registerToolRenderer(name: string, renderer: ToolRenderer): void {
  registry.set(name, renderer)
}

export function getToolRenderer(name: string): ToolRenderer {
  return registry.get(name) ?? ToolCallCard
}

/** Generic fallback — 未知工具走 ToolCallCard */
export { ToolCallCard }
