import { describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  clearMcpOauthRecord,
  getMcpOauthRecord,
  setMcpOauthRecord
} from './oauth-store'
import { startOAuthLoopback } from './oauth-loopback'

describe('oauth-store', () => {
  it('读写清理按 server id', async () => {
    const home = await mkdtemp(join(tmpdir(), 'shy-oauth-'))
    try {
      await setMcpOauthRecord(
        'remote',
        { tokens: { access_token: 'a', token_type: 'Bearer' } },
        home
      )
      expect((await getMcpOauthRecord('remote', home))?.tokens?.access_token).toBe('a')
      await clearMcpOauthRecord('remote', home)
      expect(await getMcpOauthRecord('remote', home)).toBeUndefined()
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })
})

describe('oauth-loopback', () => {
  it('收到 code 后 resolve', async () => {
    const loop = await startOAuthLoopback({ timeoutMs: 5000 })
    try {
      const pending = loop.waitForCode
      const res = await fetch(`${loop.redirectUrl}?code=abc123`)
      expect(res.ok).toBe(true)
      await expect(pending).resolves.toBe('abc123')
    } finally {
      await loop.close()
    }
  })
})
