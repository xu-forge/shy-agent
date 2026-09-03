import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { normalizeProvider, resolveLlmConfig, OPENCODE_GO_BASE_URL } from './llm-config'
import { getSettings, setSettings } from '../settings/store'

vi.mock('electron', () => ({
  app: { getPath: () => process.env.SHY_HOME ?? tmpdir() }
}))

describe('normalizeProvider', () => {
  it('缺 provider 视为 custom', () => {
    expect(normalizeProvider(undefined)).toBe('custom')
  })

  it('未知 provider 视为 custom', () => {
    expect(normalizeProvider('unknown')).toBe('custom')
    expect(normalizeProvider(null)).toBe('custom')
  })

  it('opencode-go 保留', () => {
    expect(normalizeProvider('opencode-go')).toBe('opencode-go')
  })

  it('custom 保留', () => {
    expect(normalizeProvider('custom')).toBe('custom')
  })
})

describe('resolveLlmConfig', () => {
  const customSettings = {
    provider: 'custom' as const,
    baseURL: 'https://api.example.com/v1',
    apiKey: 'key-custom',
    model: 'global-model'
  }

  it('custom 不改 baseURL', () => {
    const resolved = resolveLlmConfig(customSettings)
    expect(resolved.baseURL).toBe('https://api.example.com/v1')
    expect(resolved.apiKey).toBe('key-custom')
    expect(resolved.model).toBe('global-model')
  })

  it('缺 provider 按 custom 处理', () => {
    const { provider: _p, ...withoutProvider } = customSettings
    const resolved = resolveLlmConfig(withoutProvider)
    expect(resolved.baseURL).toBe('https://api.example.com/v1')
  })

  it('opencode-go 固定 baseURL', () => {
    const resolved = resolveLlmConfig({
      ...customSettings,
      provider: 'opencode-go',
      baseURL: 'https://user-should-not-use-this/v1'
    })
    expect(resolved.baseURL).toBe(OPENCODE_GO_BASE_URL)
    expect(resolved.baseURL).toBe('https://opencode.ai/zen/go/v1')
    expect(resolved.apiKey).toBe('key-custom')
    expect(resolved.model).toBe('global-model')
  })

  it('session.model 优先于 settings.model', () => {
    const resolved = resolveLlmConfig(customSettings, { model: 'session-model' })
    expect(resolved.model).toBe('session-model')
  })

  it('session.model 为 null 时回退 settings.model', () => {
    const resolved = resolveLlmConfig(customSettings, { model: null })
    expect(resolved.model).toBe('global-model')
  })

  it('无 session 时用 settings.model', () => {
    const resolved = resolveLlmConfig({
      ...customSettings,
      provider: 'opencode-go',
      model: 'go-default'
    })
    expect(resolved.model).toBe('go-default')
  })
})

describe('settings store provider', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'shy-settings-'))
    process.env.SHY_HOME = tmpDir
    mkdirSync(join(tmpDir, 'config'), { recursive: true })
  })

  afterEach(() => {
    delete process.env.SHY_HOME
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('旧配置缺 provider 默认 custom', async () => {
    writeFileSync(
      join(tmpDir, 'config', 'settings.json'),
      JSON.stringify({
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'k',
        model: 'gpt-4o-mini'
      }),
      'utf8'
    )
    const settings = await getSettings()
    expect(settings.provider).toBe('custom')
    expect(settings.baseURL).toBe('https://api.openai.com/v1')
  })

  it('未知 provider 读回为 custom', async () => {
    writeFileSync(
      join(tmpDir, 'config', 'settings.json'),
      JSON.stringify({
        provider: 'bogus',
        baseURL: 'https://api.example.com/v1',
        apiKey: 'k',
        model: 'm'
      }),
      'utf8'
    )
    const settings = await getSettings()
    expect(settings.provider).toBe('custom')
  })

  it('setSettings 持久化 opencode-go', async () => {
    await setSettings({
      provider: 'opencode-go',
      baseURL: 'https://ignored.example/v1',
      apiKey: 'go-key',
      model: 'MiniMax-M2.5'
    })
    const again = await getSettings()
    expect(again.provider).toBe('opencode-go')
    expect(again.apiKey).toBe('go-key')
    expect(again.model).toBe('MiniMax-M2.5')
  })
})
