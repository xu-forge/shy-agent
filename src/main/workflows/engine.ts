import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { mkdir, writeFile } from 'fs/promises'
import { join, basename, extname } from 'path'
import type { Workflow, WorkflowRun, WorkflowRunLog, WorkflowNode } from '../../shared/ipc'
import { getSettings } from '../settings/store'
import { createRun, updateRun, getWorkflow } from './db'
import { getShyPaths } from '../paths'

export type RunEmit = (run: WorkflowRun) => void

/** 数据流：把每条边 source 的输出挂到 target 的输入上 */
function buildInputs(
  edges: { source: string; target: string }[],
  outputs: Map<string, unknown>
): Map<string, unknown[]> {
  const inputs = new Map<string, unknown[]>()
  for (const e of edges) {
    const v = outputs.get(e.source)
    if (v !== undefined) {
      const arr = inputs.get(e.target) ?? []
      arr.push(v)
      inputs.set(e.target, arr)
    }
  }
  return inputs
}

/** 拓扑排序：返回节点执行顺序；有环或缺失依赖时抛错 */
function topoSort(
  nodes: WorkflowNode[],
  edges: { source: string; target: string }[]
): WorkflowNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const indeg = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const n of nodes) {
    indeg.set(n.id, 0)
    adj.set(n.id, [])
  }
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue
    adj.get(e.source)!.push(e.target)
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1)
  }
  const queue = [...indeg.entries()].filter(([, d]) => d === 0).map(([id]) => id)
  const order: WorkflowNode[] = []
  const visited = new Set<string>()
  while (queue.length) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    const node = byId.get(id)!
    order.push(node)
    for (const t of adj.get(id) ?? []) {
      const d = (indeg.get(t) ?? 1) - 1
      indeg.set(t, d)
      if (d === 0) queue.push(t)
    }
  }
  if (order.length !== nodes.length) {
    throw new Error('工作流存在环或孤立节点，无法执行')
  }
  return order
}

/** 通用抓取：内置 fetch 优先，playwright 兜底（返回可见文本） */
async function fetchUrl(url: string, waitMs?: number): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; shy/1.0)' }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    return stripHtml(html).slice(0, 40_000)
  } catch {
    // 兜底：playwright
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      if (waitMs) await page.waitForTimeout(waitMs)
      const text = await page.innerText('body')
      return text.slice(0, 40_000)
    } finally {
      await browser.close()
    }
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function nodeLabel(n: WorkflowNode): string {
  return n.label || n.type
}

/** 与对话共用「设置」里的模型配置，按需创建 */
async function getSharedLlm(): Promise<ChatOpenAI> {
  const settings = await getSettings()
  if (!settings.apiKey?.trim()) {
    throw new Error('尚未配置模型凭证：请到「设置」填写（与对话共用同一套）')
  }
  return new ChatOpenAI({
    model: settings.model,
    apiKey: settings.apiKey,
    configuration: { baseURL: settings.baseURL },
    temperature: 0.3
  })
}

/** 执行单个工作流；emit 每次 run 更新 */
export async function runWorkflow(
  workflowId: string,
  trigger: WorkflowRun['trigger'],
  emit: RunEmit,
  taskId?: string
): Promise<WorkflowRun> {
  const wf = getWorkflow(workflowId)
  if (!wf) throw new Error('工作流不存在')

  const run = createRun({ workflowId, workflowName: wf.name, trigger, taskId })
  emit(run)

  let llm: ChatOpenAI | null = null
  const ensureLlm = async (): Promise<ChatOpenAI> => {
    if (!llm) llm = await getSharedLlm()
    return llm
  }

  const outputs = new Map<string, unknown>()
  const logs: WorkflowRunLog[] = []

  const log = (
    nodeId: string,
    label: string,
    status: WorkflowRunLog['status'],
    message: string
  ): void => {
    logs.push({ nodeId, nodeLabel: label, status, message, at: new Date().toISOString() })
    emit(updateRun(run.id, { logs }))
  }

  try {
    const order = topoSort(wf.nodes, wf.edges)
    for (const node of order) {
      log(node.id, nodeLabel(node), 'running', '开始执行')
      const inputs = buildInputs(wf.edges, outputs).get(node.id) ?? []
      let result: unknown
      try {
        result = await executeNode(node, inputs, ensureLlm)
        outputs.set(node.id, result)
        log(node.id, nodeLabel(node), 'success', '完成')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log(node.id, nodeLabel(node), 'failed', msg)
        throw err
      }
    }

    // 收集产物：write_doc 节点的输出路径
    const outputsArr = wf.nodes
      .filter((n) => n.type === 'write_doc')
      .map((n) => outputs.get(n.id))
      .filter(Boolean)

    const final = updateRun(run.id, {
      status: 'success',
      finishedAt: new Date().toISOString(),
      logs,
      output: outputsArr.length ? JSON.stringify(outputsArr) : undefined
    })
    emit(final)
    return final
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const final = updateRun(run.id, {
      status: 'failed',
      finishedAt: new Date().toISOString(),
      logs,
      error: msg
    })
    emit(final)
    return final
  }
}

async function executeNode(
  node: WorkflowNode,
  inputs: unknown[],
  ensureLlm: () => Promise<ChatOpenAI>
): Promise<unknown> {
  const cfg = node.config ?? {}
  switch (node.type) {
    case 'trigger':
      return { triggered: new Date().toISOString(), manual: cfg.manual ?? false }
    case 'fetch': {
      const url = String(cfg.url ?? '')
      if (!url) throw new Error('fetch 节点缺少 url')
      const selector = String(cfg.selector ?? '')
      const text = await fetchUrl(url, cfg.waitMs ? Number(cfg.waitMs) : undefined)
      return { url, text, selector }
    }
    case 'summarize': {
      const sources = flattenTexts(inputs)
      const lang = String(cfg.language ?? '简体中文')
      const brief = String(cfg.brief ?? '请用要点总结以下内容，突出关键信息')
      if (!sources.trim()) throw new Error('summarize 节点没有可总结的输入')
      const llm = await ensureLlm()
      const res = await llm.invoke([
        new SystemMessage(`你是摘要助手。用${lang}${brief}。输出结构化要点，不要废话。`),
        new HumanMessage(sources.slice(0, 30_000))
      ])
      return { summary: String(res.content) }
    }
    case 'recommend': {
      const sources = flattenTexts(inputs)
      const context = String(cfg.context ?? '股票概念与标的推荐')
      const style = String(
        cfg.style ??
          '请从新闻中提炼相关概念板块，并推荐可能受益的股票（给出理由），格式化为 Markdown 列表。'
      )
      if (!sources.trim()) throw new Error('recommend 节点没有可分析的输入')
      const llm = await ensureLlm()
      const res = await llm.invoke([
        new SystemMessage(`你是${context}分析师。${style} 输出 Markdown，简体中文。`),
        new HumanMessage(sources.slice(0, 30_000))
      ])
      return { recommendation: String(res.content) }
    }
    case 'write_doc': {
      const dir = String(cfg.dir ?? '')
      const filename = String(cfg.filename ?? `report-${Date.now()}.md`)
      const outDir = dir || getShyPaths().reportsDir
      await mkdir(outDir, { recursive: true })
      const ext = extname(filename) || '.md'
      const safeName =
        basename(filename).replace(/[^\w.\-\u4e00-\u9fa5]/g, '_') || `report-${Date.now()}`
      const fullName = safeName.endsWith(ext) ? safeName : `${safeName}${ext}`
      const path = join(outDir, fullName)
      const content = String(cfg.template ?? '') || composeDoc(inputs)
      await writeFile(path, content, 'utf8')
      return { path, content }
    }
    case 'output': {
      const summary = flattenTexts(inputs)
      return { output: summary.slice(0, 20_000) }
    }
    default:
      throw new Error(`未知节点类型：${(node as { type: string }).type}`)
  }
}

function flattenTexts(inputs: unknown[]): string {
  return inputs
    .flatMap((v) => {
      if (typeof v === 'string') return v
      if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>
        // 优先取常见字段
        for (const k of ['text', 'summary', 'recommendation', 'content']) {
          if (typeof o[k] === 'string') return o[k]
        }
        return JSON.stringify(v)
      }
      return String(v)
    })
    .join('\n\n')
}

function composeDoc(inputs: unknown[]): string {
  const body = flattenTexts(inputs)
  const date = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
  return `# 每日晨报\n\n生成时间：${date}\n\n---\n\n${body}\n`
}

export function defaultWorkflow(name: string): Workflow {
  const t = new Date().toISOString()
  const id = `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  return {
    id,
    name,
    description: '',
    nodes: [
      { id: 'trigger', type: 'trigger', label: '触发', x: 40, y: 40, config: {} },
      {
        id: 'fetch',
        type: 'fetch',
        label: '抓取新闻',
        x: 260,
        y: 40,
        config: { url: '' }
      },
      { id: 'summarize', type: 'summarize', label: '总结', x: 480, y: 40, config: {} },
      { id: 'recommend', type: 'recommend', label: '推荐概念/股票', x: 700, y: 40, config: {} },
      {
        id: 'write_doc',
        type: 'write_doc',
        label: '写晨报文档',
        x: 920,
        y: 40,
        config: { filename: 'daily-morning-report.md' }
      }
    ],
    edges: [
      { id: 'e1', source: 'trigger', target: 'fetch' },
      { id: 'e2', source: 'fetch', target: 'summarize' },
      { id: 'e3', source: 'summarize', target: 'recommend' },
      { id: 'e4', source: 'recommend', target: 'write_doc' }
    ],
    schedule: {
      enabled: false,
      frequency: 'daily',
      time: '09:00',
      weekdays: [],
      dayOfMonth: 1,
      minute: 0,
      cron: '0 9 * * *'
    },
    outputConfig: {},
    createdAt: t,
    updatedAt: t
  }
}
