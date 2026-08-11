import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { ensureShyHomeDirs, getShyPaths, resolveShyHome } from './paths'

describe('paths', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs.splice(0)) {
      rmSync(d, { recursive: true, force: true })
    }
  })

  it('resolveShyHome 优先 SHY_HOME', () => {
    const home = mkdtempSync(join(tmpdir(), 'shy-home-'))
    dirs.push(home)
    expect(resolveShyHome({ SHY_HOME: home } as NodeJS.ProcessEnv)).toBe(home)
  })

  it('ensureShyHomeDirs 创建标准子目录', () => {
    const home = mkdtempSync(join(tmpdir(), 'shy-home-'))
    dirs.push(home)
    const paths = ensureShyHomeDirs(home)
    expect(paths.dbPath).toBe(join(home, 'db', 'shy.sqlite'))
    expect(paths.configSettings).toBe(join(home, 'config', 'settings.json'))
    expect(existsSync(paths.skillsDir)).toBe(true)
    expect(existsSync(paths.logsAgentDir)).toBe(true)
    expect(existsSync(paths.reportsDir)).toBe(true)
    expect(getShyPaths(home).screenshotsDir).toContain('screenshots')
  })
})
