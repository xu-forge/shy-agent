import { mkdir, writeFile, rm } from 'fs/promises'
import { join, basename } from 'path'
import type { SkillSummary } from '../../shared/ipc'
import { getShyPaths, resolveShyHome } from '../paths'
import {
  getDefaultSkillRegistry,
  parseFrontmatter,
  type SkillEntry
} from './registry'
import { loadDisabledSkills, saveDisabledSkills } from './enabled-state'
import { getDefaultBus } from '../event-bridge'

function shyHome(): string {
  return resolveShyHome()
}

export async function listSkills(): Promise<SkillSummary[]> {
  const registry = getDefaultSkillRegistry()
  const snap = await registry.refresh()
  const disabled = new Set(await loadDisabledSkills(shyHome()))
  return snap.entries.map((e) => ({
    id: basename(e.dir),
    name: e.name,
    description: e.description,
    path: e.dir,
    rootKind: e.rootKind,
    enabled: !disabled.has(e.name)
  }))
}

function findEntry(idOrName: string): SkillEntry | undefined {
  const snap = getDefaultSkillRegistry().getSnapshot()
  return (
    snap.entries.find((e) => e.name === idOrName) ??
    snap.entries.find((e) => basename(e.dir) === basename(idOrName))
  )
}

export async function readSkill(
  id: string
): Promise<{ id: string; markdown: string; path: string }> {
  const entry = findEntry(id)
  if (!entry) throw new Error(`skill not found: ${id}`)
  return { id: basename(entry.dir), markdown: entry.content, path: entry.dir }
}

export async function writeSkill(input: {
  id?: string
  markdown: string
  scripts?: Record<string, string>
}): Promise<SkillSummary> {
  const root = getShyPaths().skillsDir
  await mkdir(root, { recursive: true })
  const meta = parseFrontmatter(input.markdown)
  const id =
    input.id?.trim() ||
    meta.name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5-_]+/gi, '-')
      .replace(/^-|-$/g, '') ||
    `skill-${Date.now()}`
  const dir = join(root, id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'SKILL.md'), input.markdown, 'utf8')
  if (input.scripts) {
    const scriptsDir = join(dir, 'scripts')
    await mkdir(scriptsDir, { recursive: true })
    for (const [name, body] of Object.entries(input.scripts)) {
      await writeFile(join(scriptsDir, basename(name)), body, 'utf8')
    }
  }
  await getDefaultSkillRegistry().refresh()
  return {
    id,
    name: meta.name,
    description: meta.description,
    path: dir,
    rootKind: 'user',
    enabled: true
  }
}

export async function deleteSkill(id: string): Promise<void> {
  const entry = findEntry(id)
  if (entry && entry.rootKind !== 'user') {
    throw new Error(`仅支持删除用户级技能：${id} 来自 ${entry.rootKind} 根`)
  }
  const dir = join(getShyPaths().skillsDir, basename(id))
  await rm(dir, { recursive: true, force: true })
  await getDefaultSkillRegistry().refresh()
}

export async function setSkillEnabled(name: string, enabled: boolean): Promise<void> {
  const home = shyHome()
  const disabled = new Set(await loadDisabledSkills(home))
  if (enabled) disabled.delete(name)
  else disabled.add(name)
  await saveDisabledSkills(home, [...disabled])
  emitSkillsChanged()
}

/** registry 热重载 → 刷新 snapshot 并广播 skills_changed */
export function startSkillWatch(): { close: () => void } {
  const registry = getDefaultSkillRegistry()
  const w = registry.watch(() => {
    void registry.refresh().then(() => emitSkillsChanged())
  })
  return w
}

function emitSkillsChanged(): void {
  getDefaultBus().emitSync({ type: 'skills_changed' })
}

/** catalog 用：当前生效且启用的条目 */
export async function getEnabledSkillEntries(): Promise<SkillEntry[]> {
  const registry = getDefaultSkillRegistry()
  const snap = await registry.refresh()
  const disabled = new Set(await loadDisabledSkills(shyHome()))
  return snap.entries.filter((e) => !disabled.has(e.name))
}
