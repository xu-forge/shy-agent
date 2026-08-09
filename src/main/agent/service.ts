import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { getSettings } from '../settings/store'
import { buildTools, type ToolContext } from './tools/registry'
import type { AgentMode } from '../../shared/ipc'

export type AgentEvent =
  | { type: 'status'; message: string }
  | { type: 'assistant'; content: string }
  | { type: 'tool'; name: string; detail?: unknown }
  | { type: 'memory'; action: string; entryId?: string; title?: string }
  | { type: 'error'; message: string }
  | { type: 'done'; reason: string }
  | { type: 'confirm_required'; action: string; detail: string; requestId: string }

type RunArgs = {
  sessionId: string
  message: string
  mode: AgentMode
  emit: (event: AgentEvent) => void
  waitConfirm: (action: string, detail: string) => Promise<boolean>
}

const controllers = new Map<string, AbortController>()

function systemPrompt(mode: AgentMode): string {
  const base = `你是 my-agent，运行在用户本机的桌面 Agent。使用简体中文回复。需要时调用工具。高危操作会触发确认。`
  if (mode === 'goal') {
    return `${base}\n当前为目标模式：围绕用户目标持续推进，直到完成、失败或需要确认。每步简洁说明进展。完成后明确写出「目标完成」。`
  }
  return `${base}\n当前为交互式模式：与用户协作，不要擅自进行破坏性操作。`
}

export async function runAgent(args: RunArgs): Promise<void> {
  const { sessionId, message, mode, emit, waitConfirm } = args
  controllers.get(sessionId)?.abort()
  const ac = new AbortController()
  controllers.set(sessionId, ac)

  try {
    const settings = await getSettings()
    if (!settings.apiKey) {
      emit({ type: 'error', message: '尚未配置 apiKey，请先在设置中填写 OpenAI-compatible 凭证' })
      emit({ type: 'done', reason: 'missing_settings' })
      return
    }

    emit({ type: 'status', message: mode === 'goal' ? '目标模式运行中…' : '交互式运行中…' })

    const llm = new ChatOpenAI({
      model: settings.model,
      apiKey: settings.apiKey,
      configuration: { baseURL: settings.baseURL },
      temperature: 0.2
    })

    const ctx: ToolContext = {
      emit: (event, payload) => {
        if (event === 'tool') {
          const p = payload as { name?: string }
          emit({ type: 'tool', name: p.name ?? 'tool', detail: payload })
        } else if (event === 'memory') {
          const p = payload as { action: string; entryId?: string; title?: string }
          emit({ type: 'memory', ...p })
        }
      },
      confirmHighRisk: waitConfirm
    }

    const tools = buildTools(ctx)
    const agent = createReactAgent({ llm, tools })
    const maxSteps = mode === 'goal' ? 32 : 8

    let finalText = ''
    const stream = await agent.stream(
      {
        messages: [new SystemMessage(systemPrompt(mode)), new HumanMessage(message)]
      },
      { signal: ac.signal, recursionLimit: maxSteps }
    )

    for await (const chunk of stream) {
      if (ac.signal.aborted) break
      const messages = (chunk as { agent?: { messages?: Array<{ content?: unknown }> } }).agent
        ?.messages
      if (messages?.length) {
        const last = messages[messages.length - 1]
        const content =
          typeof last.content === 'string' ? last.content : JSON.stringify(last.content)
        if (content && content !== finalText) {
          finalText = content
          emit({ type: 'assistant', content })
        }
      }
    }

    if (ac.signal.aborted) {
      emit({ type: 'done', reason: 'cancelled' })
      return
    }
    if (!finalText) emit({ type: 'assistant', content: '（无文本输出）' })
    emit({ type: 'done', reason: 'completed' })
  } catch (err) {
    if (ac.signal.aborted) {
      emit({ type: 'done', reason: 'cancelled' })
      return
    }
    const messageText = err instanceof Error ? err.message : String(err)
    emit({ type: 'error', message: messageText })
    emit({ type: 'done', reason: 'error' })
  } finally {
    if (controllers.get(sessionId) === ac) controllers.delete(sessionId)
  }
}

export function cancelAgent(sessionId: string): void {
  controllers.get(sessionId)?.abort()
  controllers.delete(sessionId)
}
