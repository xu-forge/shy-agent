import { beforeEach, describe, expect, it } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { readCanvasState, writeCanvasState } from './canvas-state'

const home = join(tmpdir(), 'shy-canvas-state-test')

beforeEach(() => {
  rmSync(home, { recursive: true, force: true })
  mkdirSync(home, { recursive: true })
})

describe('writeCanvasState / readCanvasState', () => {
  it('round-trips viewport state per project', () => {
    writeCanvasState('p1', { x: 10, y: -20, scale: 1.5, sortBy: 'mtime_desc' }, home)
    const file = join(home, 'state', 'material-canvas', 'p1.json')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      x: 10,
      y: -20,
      scale: 1.5,
      sortBy: 'mtime_desc'
    })
    expect(readCanvasState('p1', home)).toEqual({
      x: 10,
      y: -20,
      scale: 1.5,
      sortBy: 'mtime_desc'
    })
  })

  it('sanitizes the project id into the file name', () => {
    writeCanvasState('../evil', { x: 1, y: 2, scale: 1 }, home)
    expect(readCanvasState('..\\evil', home)).toEqual({
      x: 1,
      y: 2,
      scale: 1,
      sortBy: 'mtime_desc'
    })
  })

  it('returns null when no state was persisted', () => {
    expect(readCanvasState('none', home)).toBeNull()
  })

  it('round-trips collapsed group paths', () => {
    writeCanvasState('p1', { x: 0, y: 0, scale: 1, collapsed: ['a', 'a/b'] }, home)
    expect(readCanvasState('p1', home)?.collapsed).toEqual(['a', 'a/b'])
  })

  it('treats missing collapsed as fully expanded', () => {
    const dir = join(home, 'state', 'material-canvas')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'old.json'), JSON.stringify({ x: 1, y: 2, scale: 1 }))
    expect(readCanvasState('old', home)).toEqual({ x: 1, y: 2, scale: 1, sortBy: 'mtime_desc' })
  })

  it('falls back to null on corrupt or non-numeric state', () => {
    const dir = join(home, 'state', 'material-canvas')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'bad.json'), '{not json')
    expect(readCanvasState('bad', home)).toBeNull()
    writeFileSync(join(dir, 'bad2.json'), JSON.stringify({ x: 'a', y: 0, scale: 1 }))
    expect(readCanvasState('bad2', home)).toBeNull()
  })
})
