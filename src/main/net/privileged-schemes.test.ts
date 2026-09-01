import { describe, expect, it } from 'vitest'
import { PRIVILEGED_SCHEMES } from './privileged-schemes'

describe('PRIVILEGED_SCHEMES', () => {
  it('shy-material 允许媒体流式读取与跨源 fetch', () => {
    const material = PRIVILEGED_SCHEMES.find((s) => s.scheme === 'shy-material')
    expect(material?.privileges.supportFetchAPI).toBe(true)
    expect(material?.privileges.stream).toBe(true)
    expect(material?.privileges.corsEnabled).toBe(true)
  })
})
