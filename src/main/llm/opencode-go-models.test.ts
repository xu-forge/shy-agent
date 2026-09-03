import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OPENCODE_GO_CHAT_COMPLETIONS_WHITELIST,
  listOpenCodeGoModels,
  listOpenCodeGoModelsFromSettings,
  resetOpenCodeGoModelsCacheForTests
} from './opencode-go-models'
import { OPENCODE_GO_BASE_URL } from '../agent/llm-config'
import type { ModelSettings } from '../../shared/ipc'

const MODELS_URL = `${OPENCODE_GO_BASE_URL}/models`

function mockFetchJson(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  })
}

describe('listOpenCodeGoModels', () => {
  beforeEach(() => {
    resetOpenCodeGoModelsCacheForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetch 成功时解析 id 并标记 remote', async () => {
    const fetchFn = mockFetchJson({
      object: 'list',
      data: [
        { id: 'glm-5.3', object: 'model' },
        { id: 'kimi-k3', object: 'model', endpoint: `${OPENCODE_GO_BASE_URL}/chat/completions` },
        { id: 'hy3', object: 'model' }
      ]
    })

    const result = await listOpenCodeGoModels('sk-test', { fetchFn })

    expect(fetchFn).toHaveBeenCalledWith(
      MODELS_URL,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer sk-test' })
      })
    )
    expect(result.source).toBe('remote')
    expect(result.models).toEqual(['glm-5.3', 'kimi-k3', 'hy3'])
  })

  it('过滤 messages / responses 端点模型', async () => {
    const fetchFn = mockFetchJson({
      data: [
        { id: 'glm-5.3-flash', endpoint: `${OPENCODE_GO_BASE_URL}/chat/completions` },
        { id: 'minimax-m3', endpoint: `${OPENCODE_GO_BASE_URL}/messages` },
        { id: 'grok-4.6', endpoint: `${OPENCODE_GO_BASE_URL}/responses` },
        { id: 'qwen3.8-max', endpoint: `${OPENCODE_GO_BASE_URL}/messages` },
        { id: 'mimo-v2.5' }
      ]
    })

    const result = await listOpenCodeGoModels('sk-test', { fetchFn })

    expect(result.source).toBe('remote')
    expect(result.models).toEqual(['glm-5.3-flash', 'mimo-v2.5'])
    expect(result.models).not.toContain('minimax-m3')
    expect(result.models).not.toContain('grok-4.6')
  })

  it('fetch 失败时回退白名单且非空', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'))

    const result = await listOpenCodeGoModels('sk-test', { fetchFn })

    expect(result.source).toBe('fallback')
    expect(result.models.length).toBeGreaterThan(0)
    expect(result.models).toEqual([...OPENCODE_GO_CHAT_COMPLETIONS_WHITELIST])
  })

  it('HTTP 非 2xx 时回退白名单', async () => {
    const fetchFn = mockFetchJson({ error: 'unauthorized' }, 401)

    const result = await listOpenCodeGoModels('sk-test', { fetchFn })

    expect(result.source).toBe('fallback')
    expect(result.models).toEqual([...OPENCODE_GO_CHAT_COMPLETIONS_WHITELIST])
  })

  it('空 apiKey 直接回退', async () => {
    const fetchFn = vi.fn()

    const result = await listOpenCodeGoModels('  ', { fetchFn })

    expect(fetchFn).not.toHaveBeenCalled()
    expect(result.source).toBe('fallback')
    expect(result.models.length).toBeGreaterThan(0)
  })

  it('60s 内复用远程成功缓存', async () => {
    let now = 1_000
    const fetchFn = mockFetchJson({ data: [{ id: 'glm-5.3' }] })

    await listOpenCodeGoModels('sk-test', { fetchFn, now: () => now })
    now += 30_000
    await listOpenCodeGoModels('sk-test', { fetchFn, now: () => now })

    expect(fetchFn).toHaveBeenCalledTimes(1)

    now += 31_000
    await listOpenCodeGoModels('sk-test', { fetchFn, now: () => now })
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('失败回退不写入缓存', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'))

    await listOpenCodeGoModels('sk-test', { fetchFn })
    await listOpenCodeGoModels('sk-test', { fetchFn })

    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('请求超时时回退白名单', async () => {
    vi.useFakeTimers()
    const fetchFn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void input
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))
        })
      })
    })

    const promise = listOpenCodeGoModels('sk-test', { fetchFn, timeoutMs: 100 })
    await vi.advanceTimersByTimeAsync(101)
    const result = await promise

    expect(result.source).toBe('fallback')
    expect(result.models).toEqual([...OPENCODE_GO_CHAT_COMPLETIONS_WHITELIST])
    vi.useRealTimers()
  })
})

describe('listOpenCodeGoModelsFromSettings', () => {
  beforeEach(() => {
    resetOpenCodeGoModelsCacheForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('provider 非 opencode-go 时不发起远程 fetch', async () => {
    const fetchFn = mockFetchJson({ data: [{ id: 'glm-5.3' }] })
    const settings: ModelSettings = {
      provider: 'custom',
      baseURL: 'https://api.minimaxi.com/v1',
      apiKey: 'sk-custom',
      model: 'MiniMax-M3'
    }

    const result = await listOpenCodeGoModelsFromSettings(settings, { fetchFn })

    expect(fetchFn).not.toHaveBeenCalled()
    expect(result.source).toBe('fallback')
    expect(result.models).toEqual([...OPENCODE_GO_CHAT_COMPLETIONS_WHITELIST])
  })
})
