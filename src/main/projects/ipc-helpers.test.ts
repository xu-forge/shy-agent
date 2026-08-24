import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { asIpcFailure, collectProjectMaterialWrites, resolveProjectFilePath } from './ipc-helpers'

describe('asIpcFailure', () => {
  it('maps path_escape to a structured error instead of rethrowing', () => {
    expect(asIpcFailure(new Error('path_escape'))).toEqual({ ok: false, error: 'path_escape' })
  })

  it('maps root_path_taken to a structured error', () => {
    expect(asIpcFailure(new Error('root_path_taken'))).toEqual({
      ok: false,
      error: 'root_path_taken'
    })
  })

  it('returns null for unknown errors so callers can rethrow', () => {
    expect(asIpcFailure(new Error('ENOENT'))).toBeNull()
    expect(asIpcFailure('path_escape')).toBeNull()
    expect(asIpcFailure(null)).toBeNull()
  })
})

describe('collectProjectMaterialWrites', () => {
  it('collects write records only from sessions bound to the project', () => {
    const writes = collectProjectMaterialWrites(
      [
        { id: 's1', projectId: 'p1' },
        { id: 's2', projectId: 'p1' },
        { id: 's3', projectId: 'p2' },
        { id: 's4', projectId: null }
      ],
      'p1',
      (sessionId) => {
        if (sessionId === 's1') {
          return [
            { op: 'write', path: '/proj/out.png', sessionId: 's1' },
            { op: 'read', path: '/proj/skip.txt', sessionId: 's1' }
          ]
        }
        if (sessionId === 's2') {
          return [{ op: 'delete', path: '/proj/gone.png', sessionId: 's2' }]
        }
        return [{ op: 'write', path: '/other/x.png', sessionId: sessionId }]
      }
    )
    expect(writes).toEqual([{ path: '/proj/out.png', sessionId: 's1' }])
  })
})

describe('resolveProjectFilePath', () => {
  let tmpDir = ''
  let root = ''

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'shy-ipc-helper-'))
    root = join(tmpDir, 'proj')
    mkdirSync(root)
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src', 'a.ts'), 'x')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('resolves a relative path inside root', () => {
    expect(resolveProjectFilePath(root, join('src', 'a.ts'))).toBe(resolve(root, 'src', 'a.ts'))
  })

  it('throws path_escape when relativePath walks out', () => {
    expect(() => resolveProjectFilePath(root, join('..', 'secret'))).toThrow(/path_escape/)
  })
})
