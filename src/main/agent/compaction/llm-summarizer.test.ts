/**
 * LLM summarizer 单测 — mock OpenAI client,验证 prompt + response 处理
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

// mock OpenAI 客户端
const mockCreate = vi.fn()
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: mockCreate } }
  }
}))

const { createLlmSummarizer } = await import('./llm-summarizer')

describe('createLlmSummarizer', () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  it('无 apiKey 抛错', () => {
    expect(() =>
      createLlmSummarizer({ baseURL: 'http://x', apiKey: '', model: 'gpt-4' })
    ).toThrow(/apiKey/)
  })

  it('LLM 返回空字符串抛错', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '   ' } }]
    })
    const summarizer = createLlmSummarizer({
      baseURL: 'http://x',
      apiKey: 'k',
      model: 'gpt-4'
    })
    await expect(
      summarizer([{ role: 'user', content: 'hi' }])
    ).rejects.toThrow(/空 summary/)
  })

  it('LLM 返回正常文本,summary 透传', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '**用户目标**:测试\n**已完成**:1 步' } }]
    })
    const summarizer = createLlmSummarizer({
      baseURL: 'http://x',
      apiKey: 'k',
      model: 'gpt-4'
    })
    const result = await summarizer([{ role: 'user', content: '测试' }])
    expect(result).toBe('**用户目标**:测试\n**已完成**:1 步')
  })

  it('prompt 包含压缩场景指令(system)', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'summary' } }]
    })
    const summarizer = createLlmSummarizer({
      baseURL: 'http://x',
      apiKey: 'k',
      model: 'gpt-4o-mini'
    })
    await summarizer([{ role: 'user', content: 'x' }])
    const call = mockCreate.mock.calls[0]![0] as { messages: Array<{ role: string; content: string }> }
    expect(call.messages[0]!.role).toBe('system')
    expect(call.messages[0]!.content).toContain('压缩助手')
    expect(call.messages[0]!.content).toContain('用户目标')
    expect(call.messages[0]!.content).toContain('已完成的步骤')
  })

  it('user prompt 包含消息序列(role + content)', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'summary' } }]
    })
    const summarizer = createLlmSummarizer({
      baseURL: 'http://x',
      apiKey: 'k',
      model: 'gpt-4o-mini'
    })
    await summarizer([
      { role: 'user', content: '帮我写个 hello world' },
      { role: 'assistant', content: '好的,已写完' }
    ])
    const call = mockCreate.mock.calls[0]![0] as { messages: Array<{ role: string; content: string }> }
    const userPrompt = call.messages[1]!.content
    expect(userPrompt).toContain('[user] 帮我写个 hello world')
    expect(userPrompt).toContain('[assistant] 好的,已写完')
  })

  it('单条超长 content(>2000 chars)截断', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'summary' } }]
    })
    const summarizer = createLlmSummarizer({
      baseURL: 'http://x',
      apiKey: 'k',
      model: 'gpt-4o-mini'
    })
    const long = 'a'.repeat(5000)
    await summarizer([{ role: 'user', content: long }])
    const call = mockCreate.mock.calls[0]![0] as { messages: Array<{ role: string; content: string }> }
    expect(call.messages[1]!.content.length).toBeLessThan(long.length + 100) // [user] + 2000 + …
    expect(call.messages[1]!.content).toContain('…')
  })

  it('summary 超过 maxOutputChars 自动截断并标注', async () => {
    const long = 'x'.repeat(5000)
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: long } }]
    })
    const summarizer = createLlmSummarizer({
      baseURL: 'http://x',
      apiKey: 'k',
      model: 'gpt-4o-mini',
      maxOutputChars: 100
    })
    const result = await summarizer([{ role: 'user', content: 'hi' }])
    expect(result.length).toBeLessThan(200)
    expect(result).toContain('…(已截断')
  })

  it('signal 透传给 OpenAI create', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'summary' } }]
    })
    const controller = new AbortController()
    const summarizer = createLlmSummarizer({
      baseURL: 'http://x',
      apiKey: 'k',
      model: 'gpt-4o-mini',
      signal: controller.signal
    })
    await summarizer([{ role: 'user', content: 'hi' }])
    // create 第二个参数(选项)应该含 signal
    const opts = mockCreate.mock.calls[0]![1] as { signal?: AbortSignal }
    expect(opts.signal).toBe(controller.signal)
  })

  it('API 抛错向上传(让 strategy.ts 走 fail-closed skip)', async () => {
    mockCreate.mockRejectedValueOnce(new Error('LLM 401 unauthorized'))
    const summarizer = createLlmSummarizer({
      baseURL: 'http://x',
      apiKey: 'bad',
      model: 'gpt-4'
    })
    await expect(
      summarizer([{ role: 'user', content: 'hi' }])
    ).rejects.toThrow(/401/)
  })
})
