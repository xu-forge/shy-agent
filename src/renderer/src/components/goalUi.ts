export function normalizeVerifyCommand(value: string): string | undefined {
  return value.trim() || undefined
}

export function truncateEvidence(value: string, maxChars = 240): string {
  if (value.length <= maxChars) return value
  return `${value.slice(0, Math.max(0, maxChars - 1))}…`
}
