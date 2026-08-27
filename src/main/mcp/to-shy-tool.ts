import { z } from 'zod'
import type { ShyTool } from '../agent/tools/dispatcher'
import type { ToolContext } from '../agent/tools/registry'
import type { ExposedMcpTool } from './manager'

const looseArgs = z.record(z.string(), z.unknown())

export function mcpToolsToShy(
  tools: ExposedMcpTool[],
  callTool: (exposedName: string, args: Record<string, unknown>) => Promise<string>,
  ctx?: Pick<ToolContext, 'emit'>
): ShyTool[] {
  return tools.map((t) => ({
    name: t.exposedName,
    description: t.description || `MCP tool ${t.originalName} (${t.serverId})`,
    schema: looseArgs,
    jsonSchema: t.inputSchema,
    run: async (args: Record<string, unknown>) => {
      ctx?.emit('tool', { name: t.exposedName, serverId: t.serverId, args })
      return callTool(t.exposedName, args ?? {})
    }
  }))
}
