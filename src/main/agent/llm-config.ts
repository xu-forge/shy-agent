import type { ModelSettings } from '../../shared/ipc'

export type LlmProvider = 'custom' | 'opencode-go'

export const OPENCODE_GO_BASE_URL = 'https://opencode.ai/zen/go/v1'

export type ResolvedLlmConfig = {
  baseURL: string
  apiKey: string
  model: string
}

export function normalizeProvider(value: unknown): LlmProvider {
  return value === 'opencode-go' ? 'opencode-go' : 'custom'
}

export function resolveLlmConfig(
  settings: ModelSettings,
  session?: { model?: string | null }
): ResolvedLlmConfig {
  const provider = normalizeProvider(settings.provider)
  const model = session?.model ?? settings.model
  const baseURL = provider === 'opencode-go' ? OPENCODE_GO_BASE_URL : settings.baseURL

  return {
    baseURL,
    apiKey: settings.apiKey,
    model
  }
}
