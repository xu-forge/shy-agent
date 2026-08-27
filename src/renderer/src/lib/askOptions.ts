export type AskOption = {
  value: string
  label: string
  description: string
}

/** LLM 常把 options 写成 JSON 字符串、{item:[...]} 或 {label, description}。 */
export function normalizeAskOptions(raw: unknown): AskOption[] {
  let value: unknown = raw
  if (typeof value === 'string') {
    const asText = value
    try {
      value = JSON.parse(asText) as unknown
    } catch {
      const s = asText.trim()
      return s ? [{ value: s, label: s, description: '' }] : []
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>
    if ('item' in rec) {
      const item = rec.item
      value = Array.isArray(item) ? item : item === undefined ? [] : [item]
    } else if (Array.isArray(rec.items)) {
      value = rec.items
    }
  }
  if (!Array.isArray(value)) return []
  const out: AskOption[] = []
  for (const item of value) {
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
