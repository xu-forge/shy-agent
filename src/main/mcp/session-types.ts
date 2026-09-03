export type McpToolInfo = {
  name: string
  description: string
  inputSchema?: Record<string, unknown>
}

export type McpSession = {
  listTools: () => Promise<McpToolInfo[]>
  callTool: (name: string, args: Record<string, unknown>) => Promise<string>
  close: () => Promise<void>
}

export function stringifyMcpResult(result: unknown): string {
  if (result && typeof result === 'object' && 'content' in result) {
    const content = (result as { content: unknown }).content
    if (Array.isArray(content)) {
      const texts = content
        .map((c) => {
          if (c && typeof c === 'object' && (c as { type?: unknown }).type === 'text') {
            const text = (c as { text?: unknown }).text
            return typeof text === 'string' ? text : ''
          }
          return ''
        })
        .filter(Boolean)
      if (texts.length > 0) return texts.join('\n')
    }
    return JSON.stringify(content)
  }
  return typeof result === 'string' ? result : JSON.stringify(result)
}
