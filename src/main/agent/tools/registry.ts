import type { ShyTool } from './dispatcher'
import { z } from 'zod'
import { getMcpManager } from '../../mcp/manager'
import { mcpToolsToShy } from '../../mcp/to-shy-tool'

export type ToolContext = {
  emit: (event: string, payload: unknown) => void
  confirmHighRisk: (action: string, detail: string) => Promise<boolean>
  /** 向用户提问并等待选中值（ask_user）；未接线时工具返回 error */
  askUser?: (question: string, options?: string[]) => Promise<string>
  /** 当前会话 id；用于文件追踪埋点（shell-session-side-panel） */
  sessionId: string
  /** 当前工作区：文件工具与 shell_exec 相对路径的解析基准（已绑定项目则为项目根目录，否则为会话 workspace） */
  workspaceDir: string
}

type Factory = (ctx: ToolContext) => ShyTool

const factories = new Map<string, Factory>()

export function registerTool(name: string, factory: Factory): void {
  factories.set(name, factory)
}

export function registeredToolNames(): string[] {
  return [...factories.keys()]
}

export function buildTools(ctx: ToolContext): ShyTool[] {
  const local = [...factories.values()].map((f) => f(ctx))
  try {
    const mgr = getMcpManager()
    const mcp = mcpToolsToShy(
      mgr.listExposedTools(local.map((t) => t.name)),
      (name, args) => mgr.callTool(name, args),
      ctx
    )
    return [...local, ...mcp]
  } catch {
    return local
  }
}

registerTool('runtime_ping', (ctx) => ({
  name: 'runtime_ping',
  description: '健康检查工具：返回 pong，用于验证工具循环',
  schema: z.object({ note: z.string().optional() }),
  run: async ({ note }) => {
    ctx.emit('tool', { name: 'runtime_ping', note: note ?? '' })
    return JSON.stringify({ ok: true, message: 'pong', note: note ?? '' })
  }
}))
