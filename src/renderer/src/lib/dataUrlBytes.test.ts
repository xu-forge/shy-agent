import { describe, expect, it } from 'vitest'
import { dataUrlToArrayBuffer } from './dataUrlBytes'

describe('dataUrlToArrayBuffer', () => {
  it('解码 data URL 为原始字节', () => {
    const raw = new Uint8Array([0x25, 0x50, 0x44, 0x46]) // %PDF
    const b64 = Buffer.from(raw).toString('base64')
    const buf = dataUrlToArrayBuffer(`data:application/pdf;base64,${b64}`)
    expect(new Uint8Array(buf)).toEqual(raw)
  })
})
