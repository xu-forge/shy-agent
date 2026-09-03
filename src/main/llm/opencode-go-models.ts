import { OPENCODE_GO_BASE_URL, normalizeProvider } from '../agent/llm-config'
import { httpFetchJson } from '../net/http-get'
import type { ModelSettings, OpenCodeGoModelsResult } from '../../shared/ipc'

export type { OpenCodeGoModelsResult }

/** OpenCode Go 文档中走 chat/completions 的 model id（内置回退） */
export const OPENCODE_GO_CHAT_COMPLETIONS_WHITELIST = [
  'glm-5.3-flash',
  'glm-5.3',
  'glm-5.2',
  'glm-5.1',
  'kimi-k3',
  'kimi-k2.7-code',
  'kimi-k2.6',
  'longcat-2.0',
  'deepseek-v4-pro',
  'deepseek-v4-flash',
  'deepseek-v4-flash-vision-exp',
  'mimo-v2.5',
  'mimo-v2.5-pro',
  'hy4-preview',
  'hy3'
] as const

const WHITELIST_SET = new Set<string>(OPENCODE_GO_CHAT_COMPLETIONS_WHITELIST)

/** 文档/API 中明确非 chat.completions 的 model id */
const KNOWN_NON_COMPLETIONS = new Set([
  'grok-4.6',
  'gpt-5.6-luna',
  'minimax-m3',
  'minimax-m2.7',
  'minimax-m2.5',
  'muse-spark-1.3-contributor',
  'muse-spark-1.2-contributor',
  'qwen3.8-max',
  'qwen3.8-flash',
  'qwen3.7-max',
  'qwen3.7-plus',
  'qwen3.6-plus'
])

type ModelEntry = {
  id?: string
  endpoint?: string
  api_endpoint?: string
}

type ListDeps = {
  fetchFn?: typeof fetch
  now?: () => number
  timeoutMs?: number
}

const MODELS_URL = `${OPENCODE_GO_BASE_URL}/models`
const CACHE_TTL_MS = 60_000
const DEFAULT_TIMEOUT_MS = 12_000

let cache: { apiKey: string; expiresAt: number; result: OpenCodeGoModelsResult } | null = null

export function resetOpenCodeGoModelsCacheForTests(): void {
  cache = null
}

export function fallbackOpenCodeGoModelsResult(): OpenCodeGoModelsResult {
  return {
    models: [...OPENCODE_GO_CHAT_COMPLETIONS_WHITELIST],
    source: 'fallback'
  }
}

function readEndpoint(entry: ModelEntry): string | undefined {
  const raw = entry.endpoint ?? entry.api_endpoint
  return typeof raw === 'string' ? raw : undefined
}

function isChatCompletionsModel(id: string, endpoint?: string): boolean {
  if (endpoint) {
    const lower = endpoint.toLowerCase()
    if (lower.includes('/messages') || lower.includes('/responses')) return false
    if (lower.includes('/chat/completions')) return true
  }
  if (KNOWN_NON_COMPLETIONS.has(id)) return false
  return WHITELIST_SET.has(id)
}

function sortByWhitelistOrder(ids: string[]): string[] {
  const order = new Map<string, number>(
    OPENCODE_GO_CHAT_COMPLETIONS_WHITELIST.map((id, index) => [id, index])
  )
  return [...ids].sort((a, b) => {
    const ai = order.get(a) ?? Number.MAX_SAFE_INTEGER
    const bi = order.get(b) ?? Number.MAX_SAFE_INTEGER
    if (ai !== bi) return ai - bi
    return a.localeCompare(b)
  })
}

function parseRemoteModels(payload: unknown): string[] {
  const data = (payload as { data?: ModelEntry[] })?.data
  if (!Array.isArray(data)) return []

  const ids = data
    .map((entry) => {
      const id = typeof entry?.id === 'string' ? entry.id.trim() : ''
      if (!id) return null
      return isChatCompletionsModel(id, readEndpoint(entry)) ? id : null
    })
    .filter((id): id is string => Boolean(id))

  return sortByWhitelistOrder([...new Set(ids)])
}

async function fetchRemoteModels(apiKey: string, deps: ListDeps): Promise<string[]> {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let payload: unknown

  if (deps.fetchFn) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    timer.unref?.()
    try {
      const res = await deps.fetchFn(MODELS_URL, {
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json'
        }
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      payload = await res.json()
    } finally {
      clearTimeout(timer)
    }
  } else {
    payload = await httpFetchJson(MODELS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeoutMs
    })
  }

  const models = parseRemoteModels(payload)
  if (models.length === 0) throw new Error('empty models list')
  return models
}

export async function listOpenCodeGoModels(
  apiKey: string,
  deps: ListDeps = {}
): Promise<OpenCodeGoModelsResult> {
  const trimmedKey = apiKey.trim()
  if (!trimmedKey) return fallbackOpenCodeGoModelsResult()

  const now = deps.now ?? Date.now

  if (cache && cache.apiKey === trimmedKey && cache.expiresAt > now()) {
    return cache.result
  }

  try {
    const models = await fetchRemoteModels(trimmedKey, deps)
    const result: OpenCodeGoModelsResult = { models, source: 'remote' }
    cache = { apiKey: trimmedKey, expiresAt: now() + CACHE_TTL_MS, result }
    return result
  } catch {
    return fallbackOpenCodeGoModelsResult()
  }
}

export async function listOpenCodeGoModelsFromSettings(
  settings: ModelSettings,
  deps: ListDeps = {}
): Promise<OpenCodeGoModelsResult> {
  if (normalizeProvider(settings.provider) !== 'opencode-go') {
    return fallbackOpenCodeGoModelsResult()
  }
  return listOpenCodeGoModels(settings.apiKey, deps)
}
