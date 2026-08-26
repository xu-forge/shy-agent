export type AskOption = {
  value: string
  label: string
  description: string
}

/** LLM 常把 options 写成 {label, description}，统一成可渲染的字符串项。 */
export function normalizeAskOptions(raw: unknown): AskOption[] {
  if (!Array.isArray(raw)) return []
  const out: AskOption[] = []
  for (const item of raw) {
    if (typeof item === 'string') {
      const s = item.trim()
      if (s) out.push({ value: s, label: s, description: '' })
      continue
    }
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const label = String(rec.label ?? rec.title ?? rec.text ?? rec.value ?? '').trim()
    if (!label) continue
    out.push({
      value: String(rec.value ?? label).trim(),
      label,
      description: String(rec.description ?? rec.desc ?? rec.detail ?? '').trim()
    })
  }
  return out
}
