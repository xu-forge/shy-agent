/**
 * MiniMax 等模型有时把工具写成正文 XML，而不是 OpenAI function call：
 *   <show_widget>
 *   <parameter name="widgetType">cards</parameter>
 *   </show_widget>
 * 完整块转为 tool_calls；残缺块从可见正文剥掉，避免半截标签露在会话里。
 */

export type XmlExtractedToolCall = { id: string; name: string; args: string }

const PARAM_RE = /<parameter\s+name="([^"]+)">([\s\S]*?)<\/parameter>/gi

function parseParamValue(raw: string): unknown {
  const t = raw.trim()
  if (!t) return ''
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try {
      return JSON.parse(t) as unknown
    } catch {
      return t
    }
  }
  return t
}

function parseParameterBlock(inner: string): Record<string, unknown> {
  const args: Record<string, unknown> = {}
  for (const m of inner.matchAll(PARAM_RE)) {
    const key = m[1]
    if (!key) continue
    args[key] = parseParamValue(m[2] ?? '')
  }
  return args
}

/** 看起来像「工具名 + parameter 子节点」的 XML（不含 think 等）。 */
export function looksLikeXmlToolOpen(name: string): boolean {
  return /^[a-z][a-z0-9_]*$/i.test(name) && !/^(think|thinking|reason|reasoning)$/i.test(name)
}

export function extractXmlToolCalls(
  content: string,
  allowedNames: ReadonlySet<string>
): { content: string; toolCalls: XmlExtractedToolCall[] } {
  if (!content.includes('<parameter')) {
    return { content, toolCalls: [] }
  }
  const toolCalls: XmlExtractedToolCall[] = []
  let next = content
  let seq = 0

  const names = [...allowedNames].filter((n) => looksLikeXmlToolOpen(n))
  for (const name of names) {
    const re = new RegExp(`<${name}\\s*>\\s*([\\s\\S]*?)</${name}\\s*>`, 'gi')
    next = next.replace(re, (full, inner: string) => {
      if (!/<parameter\s+name=/i.test(inner)) return full
      seq += 1
      toolCalls.push({
        id: `xml_${name}_${seq}`,
        name,
        args: JSON.stringify(parseParameterBlock(inner))
      })
      return ''
    })
  }

  next = stripIncompleteXmlTools(next, allowedNames)
  return { content: next.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trimEnd(), toolCalls }
}

function stripIncompleteXmlTools(content: string, allowedNames: ReadonlySet<string>): string {
  let cut = -1
  for (const name of allowedNames) {
    if (!looksLikeXmlToolOpen(name)) continue
    const open = new RegExp(`<${name}\\s*>`, 'i')
    const close = new RegExp(`</${name}\\s*>`, 'i')
    const m = open.exec(content)
    if (!m || m.index === undefined) continue
    const after = content.slice(m.index)
    if (close.test(after)) continue
    if (cut < 0 || m.index < cut) cut = m.index
  }
  if (cut < 0) return content
  return content.slice(0, cut).replace(/\s+$/g, '')
}

/** 渲染层：去掉完整/残缺工具 XML，避免半截标签露在气泡里。 */
export function stripXmlToolMarkup(content: string, extraNames: readonly string[] = []): string {
  const names = new Set(['show_widget', 'read_me', 'present_artifact', 'ask_user', ...extraNames])
  return extractXmlToolCalls(content, names).content.trim()
}
