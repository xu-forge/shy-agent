import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

describe('PDF 灯箱布局', () => {
  const css = readFileSync(join(process.cwd(), 'src/renderer/src/styles/app.css'), 'utf8')

  it('页槽不随 flex 容器被压扁（否则每页会被裁切）', () => {
    const block = /\.lightbox-pdf-slot\s*\{[^}]+\}/.exec(css)?.[0] ?? ''
    expect(block).toContain('flex: 0 0 auto')
    expect(block).not.toContain('overflow: hidden')
  })
})

describe('pdf.js worker 接线', () => {
  const src = readFileSync(join(process.cwd(), 'src/renderer/src/lib/pdfThumb.ts'), 'utf8')

  it('用 Vite worker 而不是主线程 fake worker', () => {
    expect(src).toContain('pdf.worker.min.mjs?worker')
    expect(src).not.toMatch(/pdfjsWorker\s*=/)
  })
})
