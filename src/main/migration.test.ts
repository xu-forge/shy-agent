import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { ensureShyHomeDirs } from './paths'
import { migrateLegacyUserData } from './migration'

describe('migrateLegacyUserData', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs.splice(0)) {
      rmSync(d, { recursive: true, force: true })
    }
  })

  it('无旧数据时 noop', () => {
    const home = mkdtempSync(join(tmpdir(), 'shy-'))
    dirs.push(home)
    const paths = ensureShyHomeDirs(home)
    const r = migrateLegacyUserData(undefined, paths)
    expect(r.status).toBe('noop')
  })

  it('复制旧 settings/sqlite/skills 并可重入跳过', () => {
    const legacy = mkdtempSync(join(tmpdir(), 'legacy-'))
    const home = mkdtempSync(join(tmpdir(), 'shy-'))
    dirs.push(legacy, home)
    writeFileSync(join(legacy, 'settings.json'), '{"model":"x"}', 'utf8')
    writeFileSync(join(legacy, 'memory.sqlite'), 'sqlite-bytes', 'utf8')
    mkdirSync(join(legacy, 'skills', 'demo'), { recursive: true })
    writeFileSync(join(legacy, 'skills', 'demo', 'SKILL.md'), '# demo', 'utf8')

    const paths = ensureShyHomeDirs(home)
    const first = migrateLegacyUserData(legacy, paths)
    expect(first.status).toBe('success')
    expect(existsSync(paths.configSettings)).toBe(true)
    expect(readFileSync(paths.dbPath, 'utf8')).toBe('sqlite-bytes')
    expect(existsSync(join(paths.skillsDir, 'demo', 'SKILL.md'))).toBe(true)
    expect(existsSync(paths.migrationFile)).toBe(true)

    const second = migrateLegacyUserData(legacy, paths)
    expect(second.status).toBe('skipped')
    expect(second.reason).toBe('already_migrated')
  })
})
