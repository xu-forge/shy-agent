/** 单次调用 usage 的可信上限；超过视为脏数据忽略 */
const MAX_PLAUSIBLE_CALL_TOKENS = 2_000_000

/** 把未知值收成非负整数 token 数；非法/离谱则 0 */
export function asTokenCount(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(n) || n < 0) return 0
  if (n > MAX_PLAUSIBLE_CALL_TOKENS) return 0
  return Math.floor(n)
}

type UsageLike = {
  usage_metadata?: {
    total_tokens?: unknown
    input_tokens?: unknown
    output_tokens?: unknown
  }
  response_metadata?: Record<string, unknown>
}

/**
 * 从 LLM 响应提取**本次调用**消耗的 token（用于成本累计）。
 * 优先 usage_metadata，其次 response_metadata.tokenUsage / usage。
 */
export function tokensOf(res: UsageLike | null | undefined): number {
  if (!res) return 0
  const u = res.usage_metadata
  if (u) {
    const total = asTokenCount(u.total_tokens)
    if (total > 0) return total
    const sum = asTokenCount(u.input_tokens) + asTokenCount(u.output_tokens)
    if (sum > 0) return sum
  }

  const meta = res.response_metadata ?? {}
  const raw = meta.tokenUsage ?? meta.token_usage ?? meta.usage
  if (raw && typeof raw === 'object') {
    const tu = raw as Record<string, unknown>
    const total = asTokenCount(tu.total_tokens ?? tu.totalTokens)
    if (total > 0) return total
    const sum =
      asTokenCount(tu.prompt_tokens ?? tu.promptTokens ?? tu.input_tokens) +
      asTokenCount(tu.completion_tokens ?? tu.completionTokens ?? tu.output_tokens)
    if (sum > 0) return sum
  }

  return 0
}

/** 安全累加，避免 string 拼接把用量撑爆 */
export function addTokenUsed(prev: unknown, delta: number): number {
  return asTokenCount(prev) + asTokenCount(delta)
}
