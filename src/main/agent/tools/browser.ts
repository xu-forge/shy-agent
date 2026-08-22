/**
 * browser 工具 — LLM 侧内嵌浏览器统一入口（移植自 MiniMaxCode agent-tools/desktop/local-browser.ts，小型化）。
 *
 * - 单工具 22 action union，结果 ≤64KiB（manager 内 clamp）
 * - 高危协议（file:/javascript:）navigate 走 confirmHighRisk
 * - upload_files 路径 realpath 校验
 */
import { z } from 'zod'
import { registerTool } from './registry'
import { BROWSER_ACTIONS } from '../../browser/embedded-browser-manager'
import type { BrowserActionInput } from '../../browser/embedded-browser-manager'
import { assertUploadablePaths } from '../../browser'

const inputSchema = z
  .object({
    ref: z.string().optional(),
    selector: z.string().optional(),
    url: z.string().optional(),
    replaceCurrentTab: z.boolean().optional(),
    text: z.string().optional(),
    key: z.string().optional(),
    modifiers: z.array(z.enum(['Control', 'Shift', 'Alt', 'Meta'])).max(4).optional(),
    values: z.array(z.string()).min(1).max(20).optional(),
    direction: z.enum(['up', 'down', 'left', 'right']).optional(),
    distance: z.number().min(1).max(100_000).optional(),
    position: z.object({ x: z.number(), y: z.number() }).optional(),
    timeout: z.number().min(0).max(60_000).optional(),
    offset: z.number().min(0).optional(),
    kind: z.enum(['text', 'dom']).optional(),
    maxChars: z.number().min(100).max(50_000).optional(),
    paths: z.array(z.string()).min(1).max(20).optional()
  })
  .optional()

export function registerBrowserTool(): void {
  registerTool('browser', (ctx) => ({
    name: 'browser',
    description:
      '操控内置可视化浏览器（显示在用户界面的浏览器面板中）。\n\n' +
      '何时用：需要打开/浏览网页、点击、填表、截图验证、读取页面内容。\n' +
      '何时不用：只需要抓取页面纯文本且无需交互时可用 browser_fetch（如仍存在）；本机文件操作用 fs_* 工具。\n' +
      '典型流程：navigate → inspect（拿元素 ref）→ click/fill（用 ref）→ screenshot 验证。ref 仅当次快照有效（导航或 5 分钟后过期），过期需重新 inspect。inspect 结果用 input.offset 翻页。\n' +
      '参数：`action` 必填（见枚举）；`input` 按动作可选（ref/selector/url/text/key/values/direction/distance/position/timeout/offset/kind/paths）。',
    schema: z.object({
      action: z.enum(BROWSER_ACTIONS),
      input: inputSchema
    }),
    run: async ({ action, input }) => {
      const args: BrowserActionInput = { ...(input ?? {}) }

      // 高危导航：file:/javascript: 需用户确认
      if (action === 'navigate' && args.url) {
        const proto = args.url.split(':')[0].toLowerCase()
        if (proto === 'file' || proto === 'javascript') {
          const ok = await ctx.confirmHighRisk('浏览器打开高危地址', args.url)
          if (!ok) return JSON.stringify({ ok: false, error: '用户拒绝打开该地址' })
          args.unsafeConfirmed = true
        }
      }

      if (action === 'upload_files' && args.paths) {
        try {
          await assertUploadablePaths(args.paths)
        } catch (err) {
          return JSON.stringify({ ok: false, error: (err as Error).message })
        }
      }

      ctx.emit('tool', { name: 'browser', action })
      try {
        const result = await getManager().executeAgentTool(ctx.sessionId, action, args)
        return result
      } catch (err) {
        return JSON.stringify({ ok: false, error: (err as Error).message })
      }
    }
  }))
}

/** manager 最小接口（与 EmbeddedBrowserManager 结构兼容；测试可注入 fake） */
export type BrowserManagerLike = {
  executeAgentTool: (
    sessionId: string,
    action: (typeof BROWSER_ACTIONS)[number],
    input: Record<string, unknown>
  ) => Promise<string>
}

let _managerGetter: (() => BrowserManagerLike) | null = null

/** 生产环境在 main 启动时注入；测试可注入 fake */
export function setBrowserManagerGetter(getter: (() => BrowserManagerLike) | null): void {
  _managerGetter = getter
}

function getManager(): BrowserManagerLike {
  if (_managerGetter) return _managerGetter()
  throw new Error('browser 工具未初始化：主进程需先 setBrowserManagerGetter')
}
