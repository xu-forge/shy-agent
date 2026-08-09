import { describe, expect, it } from 'vitest'
import { assertAppPaths } from './paths'

describe('assertAppPaths', () => {
  it('accepts valid paths object', () => {
    expect(() =>
      assertAppPaths({ userData: 'C:/Users/x/AppData/Roaming/my-agent', platform: 'win32' })
    ).not.toThrow()
  })

  it('rejects missing userData', () => {
    expect(() => assertAppPaths({ platform: 'win32' })).toThrow()
  })
})
