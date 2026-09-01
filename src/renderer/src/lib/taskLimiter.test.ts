import { describe, expect, it } from 'vitest'
import { createLimiter } from './taskLimiter'

describe('createLimiter', () => {
  it('并发不超过上限', async () => {
    const acquire = createLimiter(1)
    let concurrent = 0
    let max = 0
    const job = async (): Promise<void> => {
      const release = await acquire()
      concurrent++
      max = Math.max(max, concurrent)
      await Promise.resolve()
      concurrent--
      release()
    }
    await Promise.all([job(), job(), job()])
    expect(max).toBe(1)
  })
})
