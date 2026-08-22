import { invokeChatCompletion, type LLMClientConfig, type LLMMessage } from '../agent/llm-client'
import { compressContext as keywordCompress } from './db'

const SYSTEM = `你是上下文压缩器。把对话压缩为「保关键」结构化摘要，尽量不丢关键数据。
必须保留：用户约束/偏好、未完成目标与验收标准、文件路径、命令、错误信息、决策结论、工具产物引用。
可折叠：寒暄、重复试错过程、已被新结论替代的旧草稿。
只用简体中文，输出纯文本小节摘要，不要废话开场。`

/** Prefer LLM keep-key compression; fall back to keyword extract. */
export async function compressWithLlm(
  llm: LLMClientConfig | null,
  chunks: string[],
  previous = ''
): Promise<string> {
  const joined = chunks.filter(Boolean).join('\n\n').slice(-12000)
  if (!joined.trim()) return previous

  if (!llm) {
    return mergeKeyword(previous, keywordCompress(chunks))
  }

  try {
    const messages: LLMMessage[] = [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `已有压缩态：\n${previous || '（无）'}\n\n新增内容：\n${joined}\n\n请输出更新后的保关键压缩态：`
      }
    ]
    const res = await invokeChatCompletion(llm, messages)
    const text = res.content.trim()
    if (text.length > 20) return text.slice(0, 8000)
  } catch {
    // fall through
  }
  return mergeKeyword(previous, keywordCompress(chunks))
}

function mergeKeyword(prev: string, next: string): string {
  const lines = [...prev.split('\n'), ...next.split('\n')].map((l) => l.trim()).filter(Boolean)
  return [...new Set(lines)].slice(-100).join('\n')
}
