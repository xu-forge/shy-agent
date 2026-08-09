import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'

export type ToolContext = {
  emit: (event: string, payload: unknown) => void
  confirmHighRisk: (action: string, detail: string) => Promise<boolean>
}

type Factory = (ctx: ToolContext) => DynamicStructuredTool

const factories = new Map<string, Factory>()

export function registerTool(name: string, factory: Factory): void {
  factories.set(name, factory)
}

export function buildTools(ctx: ToolContext): DynamicStructuredTool[] {
  return [...factories.values()].map((f) => f(ctx))
}

registerTool(
  'runtime_ping',
  (ctx) =>
    new DynamicStructuredTool({
      name: 'runtime_ping',
      description: '健康检查工具：返回 pong，用于验证工具循环',
      schema: z.object({ note: z.string().optional() }),
      func: async ({ note }) => {
        ctx.emit('tool', { name: 'runtime_ping', note: note ?? '' })
        return JSON.stringify({ ok: true, message: 'pong', note: note ?? '' })
      }
    })
)
