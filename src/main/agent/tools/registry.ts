import type { ShyTool } from './dispatcher'
import { z } from 'zod'

export type ToolContext = {
  emit: (event: string, payload: unknown) => void
  confirmHighRisk: (action: string, detail: string) => Promise<boolean>
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

export function buildTools(ctx: ToolContext): ShyTool[] {
  return [...factories.values()].map((f) => f(ctx))
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
