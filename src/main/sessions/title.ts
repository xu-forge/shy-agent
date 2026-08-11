import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { getSession, setSessionTitle } from './store'

/** 本地兜底：从首条用户消息抽一句短标题（非简单截断） */
export function localSummaryTitle(userText: string): string {
  const t = userText
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t) return '新对话'
  // 取首句或首问
  const sentence = t.split(/[。！？!?\n]/)[0]?.trim() || t
  const clipped = sentence.slice(0, 28)
  return clipped.length < sentence.length ? `${clipped}…` : clipped
}

/** 用 LLM 生成会话总结标题；失败则本地兜底 */
export async function summarizeSessionTitle(
  sessionId: string,
  llm: ChatOpenAI | null
): Promise<string | null> {
  const session = getSession(sessionId)
  if (!session) return null

  const turns = session.messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(0, 8)
  if (!turns.length) return null

  const firstUser = turns.find((m) => m.role === 'user')?.content ?? ''
  const fallback = session.goal?.trim()
    ? localSummaryTitle(session.goal)
    : localSummaryTitle(firstUser)

  if (!llm) {
    setSessionTitle(sessionId, fallback)
    return fallback
  }

  try {
    const transcript = turns
      .map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content.slice(0, 500)}`)
      .join('\n')
    const res = await llm.invoke([
      new SystemMessage(
        `为对话生成极短中文标题（会话总结）。要求：
- 6～18 个字，概括主题/任务，不要标点收尾
- 不要「对话」「会话」「关于」等废话前缀
- 只输出标题本身`
      ),
      new HumanMessage(
        `目标字段：${session.goal || '（无）'}\n\n对话摘录：\n${transcript}`
      )
    ])
    const raw = typeof res.content === 'string' ? res.content.trim() : ''
    const title = raw
      .replace(/^["「『]|["」』]$/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 24)
    if (title.length >= 2) {
      setSessionTitle(sessionId, title)
      return title
    }
  } catch {
    // fall through
  }

  setSessionTitle(sessionId, fallback)
  return fallback
}
