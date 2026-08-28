import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const nativeImageMock = vi.hoisted(() => ({
  createFromPath: vi.fn(),
  createFromBuffer: vi.fn(),
  resize: vi.fn(),
  toPNG: vi.fn(),
  getSize: vi.fn()
}))

vi.mock('electron', () => ({ nativeImage: nativeImageMock }))

import {
  ensureImageThumb,
  findThumb,
  isNativeImageSource,
  putVideoThumb,
  sanitizeProjectId,
  thumbAssetUrl,
  thumbKeyOf,
  thumbsDirFor,
  THUMB_WIDTH
} from './thumbs'

const home = join(tmpdir(), 'shy-thumbs-test')

function input(absPath = '/proj/a.png', mtimeMs = 100.4, size = 7) {
  return { projectId: 'p1', absPath, mtimeMs, size }
}

beforeEach(() => {
  vi.mocked(nativeImageMock.createFromPath).mockReset()
  vi.mocked(nativeImageMock.createFromBuffer).mockReset()
  rmSync(home, { recursive: true, force: true })
  mkdirSync(home, { recursive: true })
})

afterEach(() => {
  vi.mocked(nativeImageMock.resize).mockReset()
  vi.mocked(nativeImageMock.toPNG).mockReset()
})

describe('sanitizeProjectId', () => {
  it('strips path separators and dangerous characters', () => {
    expect(sanitizeProjectId('../../etc')).toBe('______etc')
    expect(sanitizeProjectId('abc-DEF_1')).toBe('abc-DEF_1')
  })
})

describe('thumbKeyOf', () => {
  it('changes when mtime or size changes', () => {
    const base = thumbKeyOf(input())
    expect(thumbKeyOf(input('/proj/a.png', 100.4, 7))).toBe(base)
    expect(thumbKeyOf(input('/proj/a.png', 101, 7))).not.toBe(base)
    expect(thumbKeyOf(input('/proj/a.png', 100.4, 8))).not.toBe(base)
    expect(thumbKeyOf(input('/proj/b.png', 100.4, 7))).not.toBe(base)
  })
})

describe('thumbsDirFor / thumbAssetUrl', () => {
  it('lives under ~/.shy cache thumbs and returns a matching shy-asset url', () => {
    expect(thumbsDirFor('p1', home)).toBe(join(home, 'cache', 'thumbs', 'p1'))
    expect(thumbAssetUrl('p1', 'k')).toBe('shy-asset://cache/thumbs/p1/k.png')
  })
})

describe('isNativeImageSource', () => {
  it('accepts png/jpg and rejects webp/gif so they degrade to raw preview', () => {
    expect(isNativeImageSource('/a.PNG')).toBe(true)
    expect(isNativeImageSource('/a.jpeg')).toBe(true)
    expect(isNativeImageSource('/a.webp')).toBe(false)
    expect(isNativeImageSource('/a.gif')).toBe(false)
    expect(isNativeImageSource('/a.mp4')).toBe(false)
  })
})

describe('ensureImageThumb', () => {
  it('returns unsupported without touching nativeImage for webp', () => {
    expect(ensureImageThumb(input('/proj/a.webp'), home)).toEqual({
      ok: false,
      reason: 'unsupported'
    })
    expect(nativeImageMock.createFromPath).not.toHaveBeenCalled()
  })

  it('returns not_found for a missing file', () => {
    expect(ensureImageThumb(input('/proj/missing.png'), home)).toEqual({
      ok: false,
      reason: 'not_found'
    })
  })

  it('generates and persists a resized png then hits the cache', () => {
    const abs = join(home, 'src.png')
    writeFileSync(abs, 'fake')
    const source = {
      isEmpty: () => false,
      getSize: () => ({ width: 960, height: 640 }),
      resize: () => ({ toPNG: () => Buffer.from('thumb') }),
      toPNG: () => Buffer.from('raw')
    }
    nativeImageMock.createFromPath.mockReturnValue(source)
    const first = ensureImageThumb({ ...input(abs) }, home)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.url).toMatch(/^shy-asset:\/\/cache\/thumbs\/p1\/[0-9a-f]{40}\.png$/)
    expect(findThumb({ ...input(abs) }, home)).toBe(first.url)

    // 第二次：缓存命中，不再解码原图
    nativeImageMock.createFromPath.mockClear()
    const second = ensureImageThumb({ ...input(abs) }, home)
    expect(second).toEqual(first)
    expect(nativeImageMock.createFromPath).not.toHaveBeenCalled()
  })

  it('does not upscale smaller images', () => {
    const abs = join(home, 'small.png')
    writeFileSync(abs, 'fake')
    const toPNG = vi.fn(() => Buffer.from('raw'))
    const resize = vi.fn()
    const source = {
      isEmpty: () => false,
      getSize: () => ({ width: THUMB_WIDTH - 1, height: 100 }),
      resize,
      toPNG
    }
    nativeImageMock.createFromPath.mockReturnValue(source)
    const r = ensureImageThumb({ ...input(abs) }, home)
    expect(r.ok).toBe(true)
    expect(resize).not.toHaveBeenCalled()
    expect(toPNG).toHaveBeenCalled()
  })

  it('degrades to unsupported when the decoder yields an empty image', () => {
    const abs = join(home, 'broken.png')
    writeFileSync(abs, 'fake')
    nativeImageMock.createFromPath.mockReturnValue({ isEmpty: () => true })
    expect(ensureImageThumb({ ...input(abs) }, home)).toEqual({
      ok: false,
      reason: 'unsupported'
    })
  })
})

describe('putVideoThumb', () => {
  it('writes a decoded frame into the cache and serves it back', () => {
    const image = { isEmpty: () => false, toPNG: () => Buffer.from('frame') }
    nativeImageMock.createFromBuffer.mockReturnValue(image)
    const r = putVideoThumb({ ...input(), dataUrl: 'data:image/jpeg;base64,AAAA' }, home)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(findThumb(input(), home)).toBe(r.url)

    // 二次写入直接命中缓存
    nativeImageMock.createFromBuffer.mockClear()
    expect(putVideoThumb({ ...input(), dataUrl: 'data:image/png;base64,BBBB' }, home)).toEqual(r)
    expect(nativeImageMock.createFromBuffer).not.toHaveBeenCalled()
  })

  it('rejects non png/jpeg data urls and empty decodes', () => {
    expect(putVideoThumb({ ...input(), dataUrl: 'data:text/plain;base64,AAAA' }, home)).toEqual({
      ok: false,
      reason: 'invalid_data'
    })
    nativeImageMock.createFromBuffer.mockReturnValue({ isEmpty: () => true })
    expect(putVideoThumb({ ...input(), dataUrl: 'data:image/png;base64,AAAA' }, home)).toEqual({
      ok: false,
      reason: 'invalid_data'
    })
  })
})

describe('findThumb', () => {
  it('returns null when nothing was cached', () => {
    expect(findThumb(input('/proj/none.png'), home)).toBeNull()
  })
})
