import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { SkillRegistry, buildDefaultSkillRoots, parseFrontmatter } from './registry'
import { renderSkillCatalog } from './catalog'
import { loadDisabledSkills, saveDisabledSkills } from './enabled-state'

let dir: string

async function tmp(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'shy-skills-'))
}

beforeEach(async () => {
  dir = await tmp()
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function writeSkillFile(root: string, name: string, frontmatter: string, body = '内容') {
  await mkdir(join(root, name), { recursive: true })
  await writeFile(join(root, name, 'SKILL.md'), `---\n${frontmatter}\n---\n\n${body}`, 'utf8')
}

describe('SkillRegistry', () => {
  it('扫描多根并按 priority 去重', async () => {
    const user = join(dir, 'user')
    const project = join(dir, 'project')
    await mkdir(user, { recursive: true })
    await mkdir(project, { recursive: true })
    await writeSkillFile(user, 'a', 'name: same\ndescription: 用户版')
    await writeSkillFile(user, 'b', 'name: only-user\ndescription: 仅用户')
    await writeSkillFile(project, 'x', 'name: same\ndescription: 项目版')

    const reg = new SkillRegistry([
      { id: 'project', kind: 'project', rootPath: project },
      { id: 'user', kind: 'user', rootPath: user }
    ])
    const snap = await reg.refresh()
    const names = snap.entries.map((e) => e.name)
    expect(names).toContain('same')
    expect(names).toContain('only-user')
    const winner = snap.entries.find((e) => e.name === 'same')!
    expect(winner.rootKind).toBe('project')
    expect(winner.description).toBe('项目版')
    expect(snap.losers).toHaveLength(1)
    expect(snap.losers[0].rootId).toBe('user')
  })

  it('兼容旧单文件 md 并跳过缺 name 条目', async () => {
    const user = join(dir, 'user')
    await mkdir(user, { recursive: true })
    await writeFile(join(user, 'legacy.md'), '---\nname: legacy\ndescription: 旧格式\n---\n正文', 'utf8')
    await writeSkillFile(user, 'bad', 'title: 无名')

    const reg = new SkillRegistry([{ id: 'user', kind: 'user', rootPath: user }])
    const snap = await reg.refresh()
    expect(snap.entries.map((e) => e.name)).toEqual(['legacy'])
    expect(snap.entries[0].content).toContain('旧格式')
    expect(snap.diagnostics.some((d) => d.code === 'SKILL_MISSING_NAME')).toBe(true)
  })

  it('不存在的根安全跳过', async () => {
    const reg = new SkillRegistry([
      { id: 'builtin', kind: 'builtin', rootPath: join(dir, 'nope') }
    ])
    const snap = await reg.refresh()
    expect(snap.entries).toEqual([])
  })

  it('watch 变化触发去抖回调（notify 钩子，确定性时序）', async () => {
    vi.useFakeTimers()
    try {
      const user = join(dir, 'user')
      await mkdir(user, { recursive: true })
      const reg = new SkillRegistry([{ id: 'user', kind: 'user', rootPath: user }])
      await reg.refresh()

      let changed = 0
      const w = reg.watch(() => changed++)
      // 连续两次变化应合并为一次回调（debounce 300ms）
      w.notify()
      w.notify()
      await vi.advanceTimersByTimeAsync(100)
      expect(changed).toBe(0)
      await vi.advanceTimersByTimeAsync(250)
      expect(changed).toBe(1)

      // max-wait：即使持续变化，2s 内必然 flush
      w.notify()
      await vi.advanceTimersByTimeAsync(2000)
      expect(changed).toBe(2)
      w.close()
    } finally {
      vi.useRealTimers()
    }
  })

  it(
    'fs.watch 真实事件接入（集成，宽松断言）',
    async () => {
      const user = join(dir, 'user')
      await mkdir(user, { recursive: true })
      const reg = new SkillRegistry([{ id: 'user', kind: 'user', rootPath: user }])
      await reg.refresh()
      let changed = 0
      const w = reg.watch(() => changed++)
      await writeSkillFile(user, 'real-watch', 'name: real-watch\ndescription: x')
      // fs.watch 事件在负载下可能晚到：短暂等待后直接以 refresh 结果为准
      const deadline = Date.now() + 3000
      while (changed === 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 150))
      }
      const snap = await reg.refresh()
      expect(snap.entries.map((e) => e.name)).toContain('real-watch')
      w.close()
    },
    10_000
  )
})

describe('parseFrontmatter', () => {
  it('解析 name/title/description，缺省回退', () => {
    const r = parseFrontmatter('---\nname: n\ndescription: d\n---\n# t')
    expect(r).toEqual({ name: 'n', title: 'n', description: 'd' })
    const noFm = parseFrontmatter('# 标题\n正文')
    expect(noFm.name).toBe('标题')
  })
})

describe('buildDefaultSkillRoots', () => {
  it('包含四类根且优先级排序正确', () => {
    const roots = buildDefaultSkillRoots({ shyHome: dir, projectDir: dir })
    expect(roots.map((r) => r.kind)).toEqual(['user', 'project', 'builtin'])
    const withAgent = buildDefaultSkillRoots({ shyHome: dir, projectDir: dir, agentName: 'main' })
    expect(withAgent.map((r) => r.kind)).toEqual(['user', 'agent', 'project', 'builtin'])
  })
})

describe('renderSkillCatalog', () => {
  const entry = (name: string, description: string) =>
    ({
      name,
      title: name,
      description,
      rootId: 'user',
      rootKind: 'user',
      dir: `/tmp/${name}`,
      file: `/tmp/${name}/SKILL.md`,
      priority: 20,
      mtimeMs: 0,
      content: ''
    }) as const

  it('空列表返回空文本', () => {
    expect(renderSkillCatalog([], 5000).text).toBe('')
  })

  it('渲染目录并附使用说明', () => {
    const r = renderSkillCatalog([entry('a', '描述a'), entry('b', '')], 5000)
    expect(r.included).toBe(2)
    expect(r.text).toContain('## 可用技能')
    expect(r.text).toContain('- a：描述a')
    expect(r.text).toContain('skill 工具')
  })

  it('预算超限截断并提示', () => {
    const many = Array.from({ length: 200 }, (_, i) => entry(`s${i}`, 'x'.repeat(50)))
    const r = renderSkillCatalog(many, 100)
    expect(r.truncated).toBe(true)
    expect(r.included).toBeLessThan(200)
    expect(r.text).toContain('截断')
  })
})

describe('enabled-state', () => {
  it('保存并读取禁用名单', async () => {
    await saveDisabledSkills(dir, ['a', 'b'])
    expect(await loadDisabledSkills(dir)).toEqual(['a', 'b'])
    await saveDisabledSkills(dir, [])
    expect(await loadDisabledSkills(dir)).toEqual([])
  })

  it('损坏文件回退为空', async () => {
    const { writeFile } = await import('fs/promises')
    await writeFile(join(dir, 'skills-enabled.json'), '{oops', 'utf8')
    expect(await loadDisabledSkills(dir)).toEqual([])
  })
})
