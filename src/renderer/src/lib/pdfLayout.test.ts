import { describe, expect, it } from 'vitest'
import { pdfPageBox } from './pdfLayout'

describe('pdfPageBox', () => {
  it('按 maxWidth 等比缩小', () => {
    expect(pdfPageBox(1800, 2400, 900)).toEqual({ width: 900, height: 1200 })
  })

  it('小页不放大超过 1.25', () => {
    expect(pdfPageBox(400, 200, 900)).toEqual({ width: 500, height: 250 })
  })
})
