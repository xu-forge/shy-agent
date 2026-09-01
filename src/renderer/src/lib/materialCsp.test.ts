import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

describe('renderer CSP', () => {
  const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
  const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? ''

  it('允许素材协议用于封面、媒体、fetch 与 worker', () => {
    expect(csp).toContain("img-src 'self' data: blob: shy-asset: shy-material:")
    expect(csp).toContain('media-src')
    expect(csp).toContain('shy-material:')
    expect(csp).toContain('connect-src')
    expect(csp).toContain("worker-src 'self' blob:")
  })
})
