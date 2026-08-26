/**
 * Enrichment 工具：Web / 导航 / 编辑 / 可视化 / 呈现 / 交互 / lint。
 */
import { z } from 'zod'
import { readdir, readFile, writeFile, stat } from 'fs/promises'
import { isAbsolute, join, relative, resolve } from 'path'
import { registerTool } from './registry'
import { resolveWorkspacePath } from './builtin'
import { captureWriteDiff } from '../../diff/capture'
import { recordFileOp } from '../../memory/db'
import { getShyPaths } from '../../paths'
import { runWebSearch } from './web-search'
import { httpGet } from '../../net/http-get'

const SKIP_DIR = new Set(['node_modules', '.git', 'dist', 'out', 'coverage', '.shy'])

function isInside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function globToRegExp(glob: string): RegExp {
  const normalized = glob.replace(/\\/g, '/')
  let re = ''
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i]
    if (c === '*' && normalized[i + 1] === '*') {
      re += '.*'
      i += 1
      if (normalized[i + 1] === '/') i += 1
    } else if (c === '*') {
      re += '[^/]*'
    } else if (c === '?') {
      re += '[^/]'
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`^${re}$`)
}

async function walkFiles(root: string, acc: string[] = []): Promise<string[]> {
  let entries: Array<{ name: string; isDirectory: () => boolean }>
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return acc
  }
  for (const e of entries) {
    if (SKIP_DIR.has(e.name)) continue
    const p = join(root, e.name)
    if (e.isDirectory()) await walkFiles(p, acc)
    else acc.push(p)
  }
  return acc
}

const READ_ME_GUIDES: Record<string, string> = {
  diagram:
    'diagram：用 SVG 流程图。浅色主题用浅底深字；节点 fill 必须内联。尺寸宽 640–720。',
  mockup: 'mockup：界面线框。对齐当前主题；控件间距 8px 网格。',
  interactive: 'interactive：小型 HTML widget。禁止外链脚本；尺寸不超过 720×480。',
  chart: 'chart：用简单 SVG/HTML 表或柱状。中文股市涨红跌绿。',
  art: 'art：装饰性 SVG。避免写实照片风。'
}

export function registerEnrichmentTools(): void {
  registerTool('web_search', (ctx) => ({
    name: 'web_search',
    description:
      '检索网页（时效/事实/地点/价格）。返回 query + results[{title,url,snippet}]。\n' +
      '何时用：新闻、推荐、需核验的事实。何时不用：纯概念定义。',
    schema: z.object({ query: z.string(), maxResults: z.number().optional() }),
    run: async ({ query, maxResults }) => {
      ctx.emit('tool', { name: 'web_search', query })
      const limit = Math.min(maxResults ?? 8, 12)
      return JSON.stringify(await runWebSearch(query, limit))
    }
  }))

  registerTool('web_fetch', (ctx) => ({
    name: 'web_fetch',
    description:
      '抓取指定 URL 正文。跟随 redirect；result 含 url/title/content/snippet，若跳转不同 host 含 redirectUrl。',
    schema: z.object({ url: z.string().url(), waitMs: z.number().optional() }),
    run: async ({ url }) => {
      ctx.emit('tool', { name: 'web_fetch', url })
      try {
        const html = await httpGet(url)
        const title = html.match(/<title[^>]*>([^<]+)/i)?.[1]?.trim() ?? ''
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        return JSON.stringify({
          url,
          title,
          content: text.slice(0, 40_000),
          snippet: text.slice(0, 500)
        })
      } catch (err) {
        return JSON.stringify({
          ok: false,
          url,
          error: err instanceof Error ? err.message : String(err)
        })
      }
    }
  }))

  registerTool('grep', (ctx) => ({
    name: 'grep',
    description:
      '在工作区内搜索文件内容（等价 ripgrep）。参数 pattern 必填；path/glob/maxMatches 可选。',
    schema: z.object({
      pattern: z.string(),
      path: z.string().optional(),
      glob: z.string().optional(),
      maxMatches: z.number().optional()
    }),
    run: async ({ pattern, path, glob, maxMatches }) => {
      ctx.emit('tool', { name: 'grep', pattern })
      const root = path ? resolveWorkspacePath(ctx.workspaceDir, path) : ctx.workspaceDir
      if (!isInside(ctx.workspaceDir, root)) {
        return JSON.stringify({ matches: [], error: 'path 越权' })
      }
      let re: RegExp
      try {
        re = new RegExp(pattern)
      } catch {
        return JSON.stringify({ matches: [], error: '无效正则' })
      }
      const globRe = glob ? globToRegExp(glob) : null
      const files = await walkFiles(root)
      const cap = maxMatches ?? 80
      const matches: Array<{ file: string; line: number; text: string }> = []
      for (const file of files) {
        if (globRe && !globRe.test(relative(ctx.workspaceDir, file).replace(/\\/g, '/'))) continue
        let text: string
        try {
          text = await readFile(file, 'utf8')
        } catch {
          continue
        }
        const lines = text.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (re.test(lines[i])) {
            matches.push({
              file: relative(ctx.workspaceDir, file) || file,
              line: i + 1,
              text: lines[i].slice(0, 200)
            })
            if (matches.length >= cap) return JSON.stringify({ matches })
          }
        }
      }
      return JSON.stringify({ matches })
    }
  }))

  registerTool('glob', (ctx) => ({
    name: 'glob',
    description: '按 glob 模式列出工作区文件路径。pattern 如 **/*.ts；cwd 可选。',
    schema: z.object({ pattern: z.string(), cwd: z.string().optional() }),
    run: async ({ pattern, cwd }) => {
      ctx.emit('tool', { name: 'glob', pattern })
      const root = cwd ? resolveWorkspacePath(ctx.workspaceDir, cwd) : ctx.workspaceDir
      if (!isInside(ctx.workspaceDir, root)) {
        return JSON.stringify({ paths: [], error: 'cwd 越权' })
      }
      const re = globToRegExp(pattern)
      const files = await walkFiles(root)
      const paths = files
        .map((f) => relative(ctx.workspaceDir, f).replace(/\\/g, '/'))
        .filter((p) => re.test(p) || re.test(p.split('/').pop() ?? p))
      return JSON.stringify({ paths })
    }
  }))

  registerTool('fs_list', (ctx) => ({
    name: 'fs_list',
    description: '列出目录条目（name/type/size）。不传 path 则列出工作区根。',
    schema: z.object({ path: z.string().optional() }),
    run: async ({ path }) => {
      const dir = path ? resolveWorkspacePath(ctx.workspaceDir, path) : ctx.workspaceDir
      ctx.emit('tool', { name: 'fs_list', path: dir })
      if (!isInside(ctx.workspaceDir, dir)) {
        return JSON.stringify({ entries: [], error: 'path 越权' })
      }
      const names = await readdir(dir)
      const entries: Array<{ name: string; type: string; size?: number }> = []
      for (const name of names) {
        if (SKIP_DIR.has(name)) continue
        const abs = join(dir, name)
        try {
          const st = await stat(abs)
          entries.push({ name, type: st.isDirectory() ? 'dir' : 'file', size: st.size })
        } catch {
          entries.push({ name, type: 'unknown' })
        }
      }
      return JSON.stringify({ entries })
    }
  }))

  registerTool('fs_edit', (ctx) => ({
    name: 'fs_edit',
    description:
      '精确替换文件中的 old_string → new_string。old_string 必须在文件中唯一出现，否则拒绝。',
    schema: z.object({ path: z.string(), old_string: z.string(), new_string: z.string() }),
    run: async ({ path, old_string, new_string }) => {
      const abs = resolveWorkspacePath(ctx.workspaceDir, path)
      ctx.emit('tool', { name: 'fs_edit', path: abs })
      if (!isInside(ctx.workspaceDir, abs)) {
        return JSON.stringify({ ok: false, error: 'path 越权' })
      }
      const text = await readFile(abs, 'utf8')
      const count = text.split(old_string).length - 1
      if (count === 0) return JSON.stringify({ ok: false, error: 'old_string 未匹配' })
      if (count > 1) return JSON.stringify({ ok: false, error: 'old_string 出现多次，拒绝部分写入' })
      const next = text.replace(old_string, new_string)
      await captureWriteDiff(ctx.sessionId, abs, next)
      await writeFile(abs, next, 'utf8')
      recordFileOp(ctx.sessionId, 'write', abs)
      return JSON.stringify({ ok: true, path: abs })
    }
  }))

  registerTool('read_me', (ctx) => ({
    name: 'read_me',
    description: '加载可视化设计指南。module: diagram | mockup | interactive | chart | art。show_widget 前调用。',
    schema: z.object({
      module: z.enum(['diagram', 'mockup', 'interactive', 'chart', 'art'])
    }),
    run: async ({ module }) => {
      ctx.emit('tool', { name: 'read_me', module })
      return JSON.stringify({ module, guide: READ_ME_GUIDES[module] })
    }
  }))

  registerTool('show_widget', (ctx) => ({
    name: 'show_widget',
    description:
      '在会话中内联可视化（table/cards/chart/diagram/html）。先 read_me。复杂主题多次调用并夹杂 prose。',
    schema: z.object({
      widgetType: z.string(),
      data: z.unknown().optional(),
      html: z.string().optional()
    }),
    run: async ({ widgetType, data, html }) => {
      ctx.emit('tool', { name: 'show_widget', widgetType })
      if (!widgetType) return JSON.stringify({ error: '非法 spec：缺少 widgetType' })
      return JSON.stringify({ widgetType, data: data ?? null, html: html ?? '' })
    }
  }))

  registerTool('present_artifact', (ctx) => ({
    name: 'present_artifact',
    description:
      '呈现可查看产物（文件或 http(s)/localhost URL）。有 HTML/报告等 deliverable 时 turn 末必须调用。',
    schema: z.object({
      paths: z.array(z.string()).optional(),
      url: z.string().optional()
    }),
    run: async ({ paths, url }) => {
      ctx.emit('tool', { name: 'present_artifact', paths, url })
      const artifactsDir = getShyPaths().artifactsDir
      const allowed: string[] = []
      for (const p of paths ?? []) {
        const abs = resolveWorkspacePath(ctx.workspaceDir, p)
        if (!isInside(ctx.workspaceDir, abs) && !isInside(artifactsDir, abs)) {
          return JSON.stringify({ error: '路径越权', path: p })
        }
        allowed.push(abs)
      }
      if (url && !/^https?:\/\//i.test(url)) {
        return JSON.stringify({ error: 'url 必须是 http(s)' })
      }
      return JSON.stringify({ paths: allowed, url: url ?? null })
    }
  }))

  registerTool('ask_user', (ctx) => ({
    name: 'ask_user',
    description:
      '向用户澄清或给选项。需要偏好、预算、二选一或无法从上下文确定时调用，不要猜测。options 为 2–4 个字符串；也可 {label, description}。',
    schema: z.object({
      question: z.string(),
      options: z
        .array(
          z.union([
            z.string(),
            z.object({
              label: z.string(),
              description: z.string().optional(),
              value: z.string().optional()
            })
          ])
        )
        .optional()
    }),
    run: async ({ question, options }) => {
      const labels = (options ?? []).map((o) => (typeof o === 'string' ? o : (o.value ?? o.label)))
      ctx.emit('tool', { name: 'ask_user', question, options: labels })
      if (!ctx.askUser) {
        return JSON.stringify({
          ok: false,
          question,
          options: labels,
          answer: '',
          error: 'ask_user 未接线'
        })
      }
      const answer = await ctx.askUser(question, labels)
      return JSON.stringify({
        ok: Boolean(answer),
        question,
        options: labels,
        answer
      })
    }
  }))

  registerTool('read_lints', (ctx) => ({
    name: 'read_lints',
    description: '读取工作区诊断（file/line/message/severity）。paths 可选。',
    schema: z.object({ paths: z.array(z.string()).optional() }),
    run: async ({ paths }) => {
      ctx.emit('tool', { name: 'read_lints', paths })
      void paths
      return JSON.stringify({ diagnostics: [] as Array<{ file: string; line: number; message: string; severity: string }> })
    }
  }))
}
