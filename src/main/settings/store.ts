import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname } from 'path'
import type { ModelSettings } from '../../shared/ipc'
import { getShyPaths } from '../paths'
import { normalizeProvider } from '../agent/llm-config'

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const n = Math.floor(value)
  if (n < min) return min
  if (n > max) return max
  return n
}

const DEFAULTS: ModelSettings = {
  provider: 'custom',
  baseURL: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  stagnationRounds: 20,
  tokenBudget: 1_000_000_000,
  segmentSteps: 60,
  contextWindow: 1_000_000,
  compressThreshold: 60,
  blockedAuditRounds: 3,
  enableGoalCompleteReport: true,
  autoApproveTools: false
}

function settingsPath(): string {
  return getShyPaths().configSettings
}

export async function getSettings(): Promise<ModelSettings> {
  try {
    const raw = await readFile(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<ModelSettings>
    return {
      ...DEFAULTS,
      ...parsed,
      provider: normalizeProvider(parsed.provider ?? DEFAULTS.provider)
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export async function setSettings(next: ModelSettings): Promise<ModelSettings> {
  const merged: ModelSettings = {
    provider: normalizeProvider(next.provider ?? DEFAULTS.provider),
    baseURL: next.baseURL?.trim() || DEFAULTS.baseURL,
    apiKey: next.apiKey ?? '',
    model: next.model?.trim() || DEFAULTS.model,
    stagnationRounds:
      typeof next.stagnationRounds === 'number' && next.stagnationRounds > 0
        ? Math.floor(next.stagnationRounds)
        : DEFAULTS.stagnationRounds,
    tokenBudget:
      typeof next.tokenBudget === 'number' && next.tokenBudget >= 0
        ? Math.floor(next.tokenBudget)
        : DEFAULTS.tokenBudget,
    segmentSteps:
      typeof next.segmentSteps === 'number' && next.segmentSteps > 0
        ? Math.floor(next.segmentSteps)
        : DEFAULTS.segmentSteps,
    contextWindow:
      typeof next.contextWindow === 'number' && next.contextWindow > 0
        ? Math.floor(next.contextWindow)
        : DEFAULTS.contextWindow,
    compressThreshold:
      typeof next.compressThreshold === 'number' &&
      next.compressThreshold > 0 &&
      next.compressThreshold <= 100
        ? Math.floor(next.compressThreshold)
        : DEFAULTS.compressThreshold,
    blockedAuditRounds: clampInt(next.blockedAuditRounds, 1, 10, DEFAULTS.blockedAuditRounds ?? 3),
    enableGoalCompleteReport:
      typeof next.enableGoalCompleteReport === 'boolean'
        ? next.enableGoalCompleteReport
        : DEFAULTS.enableGoalCompleteReport,
    autoApproveTools:
      typeof next.autoApproveTools === 'boolean' ? next.autoApproveTools : DEFAULTS.autoApproveTools
  }
  await mkdir(dirname(settingsPath()), { recursive: true })
  await writeFile(settingsPath(), JSON.stringify(merged, null, 2), 'utf8')
  return merged
}
