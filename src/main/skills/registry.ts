/**
 * 多根 Skill 注册表（移植自 MiniMaxCode mavis-packages/skills/registry.ts，小型化）。
 *
 * - 四类来源根：project > agent > user > builtin（priority 递减）
 * - 目录 + SKILL.md（YAML frontmatter：name/title/description）
 * - 兼容旧单文件 *.md（视作虚拟目录条目）
 * - 同名按 root priority 去重：winner 生效，loser 仅诊断
 */
import { readdir, readFile, stat } from 'fs/promises'
import { watch, type FSWatcher } from 'fs'
import { join, basename } from 'path'
import { randomUUID } from 'crypto'
import { homedir } from 'os'

export type SkillRootKind = 'project' | 'agent' | 'user' | 'builtin'

export type SkillRoot = {
  id: string
  kind: SkillRootKind
  rootPath: string
}

export type SkillEntry = {
  /** 生效名（去重键） */
  name: string
  title: string
  description: string
  rootId: string
  rootKind: SkillRootKind
  /** 技能目录（单文件条目为文件所在目录） */
  dir: string
  /** 入口文件绝对路径 */
  file: string
  priority: number
  mtimeMs: number
  content: string
}

export type SkillDiagnostic = {
  level: 'warning' | 'error'
  code: string
  message: string
  rootId?: string
  name?: string
}

export type SkillLoser = {
  name: string
  rootId: string
  file: string
}

export type SkillSnapshot = {
  version: number
  generatedAt: number
  entries: SkillEntry[]
  losers: SkillLoser[]
  diagnostics: SkillDiagnostic[]
}

const ROOT_PRIORITY: Record<SkillRootKind, number> = {
  project: 40,
  agent: 30,
  user: 20,
  builtin: 10
}

export function parseFrontmatter(md: string): {
  name: string
  title: string
  description: string
} {
  const match = md.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) {
    const title = md.match(/^#\s+(.+)$/m)?.[1]?.trim() || ''
    return { name: title, title, description: '' }
  }
  const block = match[1]
  const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim() || ''
  const title = block.match(/^title:\s*(.+)$/m)?.[1]?.trim() || name
  const description = block.match(/^description:\s*(.+)$/m)?.[1]?.trim() || ''
  return { name, title, description }
}

async function readIfExists(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8')
  } catch {
    return null
  }
}

async function scanRoot(
  root: SkillRoot,
  priority: number,
  diagnostics: SkillDiagnostic[]
): Promise<SkillEntry[]> {
  let dirEntries
  try {
    dirEntries = await readdir(root.rootPath, { withFileTypes: true })
  } catch {
    return [] // 根不存在（builtin/agent/project 常见）
  }
  const out: SkillEntry[] = []
  for (const ent of dirEntries) {
    if (ent.name.startsWith('.') || ent.name.startsWith('_')) continue
    let file: string | null = null
    if (ent.isDirectory()) {
      const candidate = join(root.rootPath, ent.name, 'SKILL.md')
      if ((await readIfExists(candidate)) !== null) file = candidate
    } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.md')) {
      file = join(root.rootPath, ent.name)
    }
    if (!file) continue
    const md = await readIfExists(file)
    if (md === null) continue
    const meta = parseFrontmatter(md)
    if (!meta.name) {
      diagnostics.push({
        level: 'warning',
        code: 'SKILL_MISSING_NAME',
        message: `${file} 缺少 frontmatter name，已跳过`,
        rootId: root.id
      })
      continue
    }
    let mtimeMs = 0
    try {
      mtimeMs = (await stat(file)).mtimeMs
    } catch {
      // ignore
    }
    out.push({
      name: meta.name,
      title: meta.title || meta.name,
      description: meta.description,
      rootId: root.id,
      rootKind: root.kind,
      dir: ent.isDirectory() ? join(root.rootPath, ent.name) : root.rootPath,
      file,
      priority,
      mtimeMs,
      content: md
    })
  }
  return out
}

export class SkillRegistry {
  private snapshot: SkillSnapshot = {
    version: 1,
    generatedAt: 0,
    entries: [],
    losers: [],
    diagnostics: []
  }
  private watcher: FSWatcher[] = []
  private watchTimer: NodeJS.Timeout | null = null
  private watchMaxTimer: NodeJS.Timeout | null = null
  private pendingChange = false

  constructor(private readonly roots: SkillRoot[]) {}

  getRoots(): SkillRoot[] {
    return this.roots
  }

  async refresh(): Promise<SkillSnapshot> {
    const diagnostics: SkillDiagnostic[] = []
    const all: SkillEntry[] = []
    for (const root of this.roots) {
      const entries = await scanRoot(root, ROOT_PRIORITY[root.kind], diagnostics)
      all.push(...entries)
    }
    // 同名去重：高 priority 胜出
    const byName = new Map<string, SkillEntry>()
    const losers: SkillLoser[] = []
    for (const e of all.sort((a, b) => b.priority - a.priority)) {
      const winner = byName.get(e.name)
      if (winner) {
        losers.push({ name: e.name, rootId: e.rootId, file: e.file })
      } else {
        byName.set(e.name, e)
      }
    }
    this.snapshot = {
      version: 1,
      generatedAt: Date.now(),
      entries: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
      losers,
      diagnostics
    }
    return this.snapshot
  }

  getSnapshot(): SkillSnapshot {
    return this.snapshot
  }

  getByName(name: string): SkillEntry | undefined {
    return this.snapshot.entries.find((e) => e.name === name || basename(e.dir) === name)
  }

  /** fs.watch 热重载：debounce 300ms + max-wait 2s（notify 暴露给测试直接触发去抖） */
  watch(onChange: () => void): { close: () => void; notify: () => void } {
    const schedule = (): void => {
      this.pendingChange = true
      if (!this.watchTimer) {
        this.watchTimer = setTimeout(flush, 300)
      }
      if (!this.watchMaxTimer) {
        this.watchMaxTimer = setTimeout(flush, 2000)
      }
    }
    const flush = (): void => {
      if (this.watchTimer) clearTimeout(this.watchTimer)
      if (this.watchMaxTimer) clearTimeout(this.watchMaxTimer)
      this.watchTimer = null
      this.watchMaxTimer = null
      if (!this.pendingChange) return
      this.pendingChange = false
      onChange()
    }
    for (const root of this.roots) {
      try {
        const w = watch(root.rootPath, { recursive: true }, schedule)
        this.watcher.push(w)
      } catch {
        // 根不存在或平台不支持 recursive
      }
    }
    return {
      close: () => {
        for (const w of this.watcher) w.close()
        this.watcher = []
        if (this.watchTimer) clearTimeout(this.watchTimer)
        if (this.watchMaxTimer) clearTimeout(this.watchMaxTimer)
      },
      notify: schedule
    }
  }
}

/** 默认根集合：user 全局 / agent 级 / 项目级 / builtin 种子 */
export function buildDefaultSkillRoots(opts: {
  shyHome: string
  projectDir?: string
  agentName?: string
}): SkillRoot[] {
  const { shyHome, projectDir, agentName } = opts
  const roots: SkillRoot[] = [
    { id: 'user', kind: 'user', rootPath: join(shyHome, 'skills') }
  ]
  if (agentName) {
    roots.push({
      id: 'agent',
      kind: 'agent',
      rootPath: join(shyHome, 'agents', agentName, 'skills')
    })
  }
  if (projectDir) {
    roots.push({ id: 'project', kind: 'project', rootPath: join(projectDir, '.shy', 'skills') })
  }
  roots.push({
    id: 'builtin',
    kind: 'builtin',
    rootPath: join(shyHome, 'skills-builtin')
  })
  return roots
}

/** 进程级单例注册表（主进程用；测试用 new SkillRegistry(...)） */
let _defaultRegistry: SkillRegistry | null = null

export function getDefaultSkillRegistry(): SkillRegistry {
  if (!_defaultRegistry) {
    // project 根取进程启动目录（打包后为 app 根，通常不存在，安全）
    _defaultRegistry = new SkillRegistry(
      buildDefaultSkillRoots({
        shyHome: process.env.SHY_HOME?.trim() || join(homedir(), '.shy'),
        projectDir: process.cwd()
      })
    )
  }
  return _defaultRegistry
}

export function setDefaultSkillRegistry(r: SkillRegistry | null): void {
  _defaultRegistry = r
}

export function newSkillChangeId(): string {
  return randomUUID()
}
