import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { respondFileWithRange } from './file-response'

describe('respondFileWithRange', () => {
  it('带上 CORS 与视频可用的 MIME/Range 头', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'shy-file-'))
    const file = join(dir, 'a.mp4')
    writeFileSync(file, Buffer.from('abcd'))
    try {
      const res = await respondFileWithRange(file, new Request('shy-material://m/p/a.mp4'))
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('video/mp4')
      expect(res.headers.get('Accept-Ranges')).toBe('bytes')
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
      const ranged = await respondFileWithRange(
        file,
        new Request('shy-material://m/p/a.mp4', { headers: { Range: 'bytes=0-1' } })
      )
      expect(ranged.status).toBe(206)
      expect(ranged.headers.get('Content-Range')).toBe('bytes 0-1/4')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
