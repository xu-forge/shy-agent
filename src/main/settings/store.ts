import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { ModelSettings } from '../../shared/ipc'

const DEFAULTS: ModelSettings = {
  baseURL: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  stagnationRounds: 20,
  recursionLimit: undefined,
  hardRoundCap: 0
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export async function getSettings(): Promise<ModelSettings> {
  try {
    const raw = await readFile(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<ModelSettings>
    return { ...DEFAULTS, ...parsed }
  } catch {
    return { ...DEFAULTS }
  }
}

export async function setSettings(next: ModelSettings): Promise<ModelSettings> {
  const merged: ModelSettings = {
    baseURL: next.baseURL?.trim() || DEFAULTS.baseURL,
    apiKey: next.apiKey ?? '',
    model: next.model?.trim() || DEFAULTS.model,
    stagnationRounds:
      typeof next.stagnationRounds === 'number' && next.stagnationRounds > 0
        ? Math.floor(next.stagnationRounds)
        : DEFAULTS.stagnationRounds,
    recursionLimit:
      typeof next.recursionLimit === 'number' && next.recursionLimit > 0
        ? Math.floor(next.recursionLimit)
        : undefined,
    hardRoundCap:
      typeof next.hardRoundCap === 'number' && next.hardRoundCap >= 0
        ? Math.floor(next.hardRoundCap)
        : 0
  }
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(settingsPath(), JSON.stringify(merged, null, 2), 'utf8')
  return merged
}
