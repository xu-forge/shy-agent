import { mkdtempSync, rmSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureBuiltinSkills } from './builtin-seed'

describe('ensureBuiltinSkills', () => {
  let tmp = ''

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'shy-builtin-seed-'))
    process.env.SHY_HOME = tmp
  })

  afterEach(() => {
    delete process.env.SHY_HOME
    rmSync(tmp, { recursive: true, force: true })
  })

  it('写入 manage-integrations SKILL.md', async () => {
    await ensureBuiltinSkills(tmp)
    const md = readFileSync(join(tmp, 'skills-builtin', 'manage-integrations', 'SKILL.md'), 'utf8')
    expect(md).toContain('name: manage-integrations')
    expect(md).toContain('mcp_upsert')
    expect(md).toContain('mcp_authorize')
    expect(md).toContain('Streamable HTTP')
    expect(md).toContain('ask_user')
  })
})
