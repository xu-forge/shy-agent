/**
 * LLM 真总结工厂 — 接入 OpenAI-compatible API
 *
 * 替代 generateLocalSummary(本地模板版),用真 LLM 生成 1 条对话的浓缩摘要。
 *
 * 设计要点:
 * - 复用 OpenAI SDK,非流式调 chat.completions.create
 * - prompt 是固定的"压缩场景"指令(对齐 minimax mavis-08 §2.6)
 * - 失败抛错,让 caller 决定(fail-closed skip 路径在 strategy.ts 已有)
 * - 用 settings 的 LLM config(同主对话)
 *
 * 用法:
 *   const summarizer = createLlmSummarizer({ baseURL, apiKey, model: 'gpt-4o-mini' })
 *   const summary = await summarizer(messages)
 */
import OpenAI from 'openai'
import type { CompactionMessage } from './types'

export type SummarizerConfig = {
  baseURL: string
  apiKey: string
  /** 默认用便宜模型,降低压缩成本 */
  model: string
  /** 最大输出 chars(默认 4000,避免 summary 自身过长) */
  maxOutputChars?: number
  /** abort signal */
  signal?: AbortSignal
}

const SYSTEM_PROMPT = `你是一个对话历史压缩助手。你的任务是把一段被压缩的早期对话历史浓缩成 1 段结构化摘要(中文输出)。

摘要必须包含以下 4 个部分(标题用粗体):
1. **用户目标**:用户在最初想做什么
2. **已完成的步骤**:按顺序列出关键动作、结果、产出
3. **关键结论 / 产出物**:重要的数据、文件路径、错误、决策
4. **待办 / 未完成**:还没做或被卡住的部分

约束:
- 用 markdown 格式
- 不要超过 1500 字
- 不要复述原文,只保留关键信息
- 保留所有文件路径、命令、错误码
- 忽略寒暄、重复、撤回的错误尝试`

/**
 * 工厂:返回 (messages) => Promise<string|null>
 * - messages: 要被总结的消息列表
 * - 返回 summary 文本(≤ maxOutputChars),或 null(失败)
 * - 失败抛错让 caller 决定 fallback
 */
export function createLlmSummarizer(
  config: SummarizerConfig
): (messages: ReadonlyArray<CompactionMessage>) => Promise<string> {
  if (!config.apiKey) {
    throw new Error('createLlmSummarizer: apiKey required')
  }
  const openai = new OpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey
  })
  const maxChars = config.maxOutputChars ?? 4000

  return async (messages: ReadonlyArray<CompactionMessage>): Promise<string> => {
    // 把消息序列化成纯文本片段
    const textChunks: string[] = []
    for (const m of messages) {
      const content = m.content ?? ''
      // 截单条内容(防止单条占太多 prompt)
      const head = content.length > 2000 ? `${content.slice(0, 2000)}…` : content
      textChunks.push(`[${m.role}] ${head}`)
    }
    const userPrompt = textChunks.join('\n\n')

    const completion = await openai.chat.completions.create(
      {
        model: config.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens: 1500
      },
      { signal: config.signal }
    )

    const text = completion.choices?.[0]?.message?.content?.trim() ?? ''
    if (!text) {
      throw new Error('LLM 返回空 summary')
    }
    if (text.length > maxChars) {
      return text.slice(0, maxChars) + `\n…(已截断,原文 ${text.length} 字符)`
    }
    return text
  }
}
