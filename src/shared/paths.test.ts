import { describe, expect, it } from 'vitest'
import { assertAppPaths } from './paths'

const sample = {
  userData: '/Users/x/.shy',
  shyHome: '/Users/x/.shy',
  configDir: '/Users/x/.shy/config',
  dbPath: '/Users/x/.shy/db/shy.sqlite',
  skillsDir: '/Users/x/.shy/skills',
  logsAgentDir: '/Users/x/.shy/logs/agent',
  artifactsDir: '/Users/x/.shy/artifacts',
  platform: 'darwin' as const
}

describe('assertAppPaths', () => {
  it('accepts valid paths object', () => {
    expect(() => assertAppPaths(sample)).not.toThrow()
  })

  it('rejects missing shyHome', () => {
    expect(() => assertAppPaths({ userData: '/tmp', platform: 'win32' })).toThrow()
  })
})
