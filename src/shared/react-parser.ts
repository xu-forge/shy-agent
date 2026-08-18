/**
 * 解析 ReAct 格式的 assistant content — 从流式累积内容里提取 Thought / Action / Observation 段。
 *
 * 设计：标签必须独立成行（前面是行首或仅空白），容忍大小写。
 * 如果某段缺失，返回空字符串。
 */
export type ReActParts = {
  thought: string
  action: string
  observation: string
  /** 流式是否已结束（最后一个标签后没有更多内容） */
  complete: boolean
}

export function parseReActContent(content: string): ReActParts {
  const result: ReActParts = { thought: '', action: '', observation: '', complete: false }
  if (!content) return result

  // 用正则切分（保留标签）
  const lines = content.split('\n')
  // 默认归为 Thought（无标签内容作为推理）
  let currentTag: 'Thought' | 'Action' | 'Observation' = 'Thought'
  let buffer: string[] = []

  const flush = (): void => {
    if (currentTag) {
      const text = buffer.join('\n').trim()
      if (currentTag === 'Thought') result.thought = text
      else if (currentTag === 'Action') result.action = text
      else if (currentTag === 'Observation') result.observation = text
    }
    currentTag = 'Thought'
    buffer = []
  }

  for (const line of lines) {
    const tagMatch = line.match(/^\s*(Thought|Action|Observation)\s*:\s*(.*)$/i)
    if (tagMatch) {
      flush()
      currentTag = tagMatch[1].charAt(0).toUpperCase() + tagMatch[1].slice(1).toLowerCase() as
        | 'Thought'
        | 'Action'
        | 'Observation'
      buffer = tagMatch[2] ? [tagMatch[2]] : []
    } else {
      buffer.push(line)
    }
  }
  flush()

  // 完整性判断：最后一段是否完整结束（流式可能在中途）
  const lastTagEnd = content.match(/(Thought|Action|Observation):[\s\S]*$/i)
  result.complete = !lastTagEnd || content.trimEnd().endsWith(lastTagEnd[1] + ':')
  return result
}
