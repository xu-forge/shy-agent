import { app } from 'electron'
import { mkdir, readdir, readFile, writeFile, rm, access } from 'fs/promises'
import { join, basename } from 'path'
import type { SkillSummary } from '../../shared/ipc'

function skillsRoot(): string {
  return join(app.getPath('userData'), 'skills')
}

async function ensureRoot(): Promise<string> {
  const root = skillsRoot()
  await mkdir(root, { recursive: true })
  return root
}

function parseFrontmatter(md: string): { name: string; description: string } {
  const match = md.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) {
    const title = md.match(/^#\s+(.+)$/m)?.[1]?.trim() || 'untitled'
    return { name: title, description: '' }
  }
  const block = match[1]
  const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim() || 'untitled'
  const description = block.match(/^description:\s*(.+)$/m)?.[1]?.trim() || ''
  return { name, description }
}

export async function listSkills(): Promise<SkillSummary[]> {
  const root = await ensureRoot()
  const entries = await readdir(root, { withFileTypes: true })
  const out: SkillSummary[] = []
  for (const ent of entries) {
    if (!ent.isDirectory()) continue
    const skillPath = join(root, ent.name, 'SKILL.md')
    try {
      await access(skillPath)
      const md = await readFile(skillPath, 'utf8')
      const meta = parseFrontmatter(md)
      out.push({
        id: ent.name,
        name: meta.name,
        description: meta.description,
        path: join(root, ent.name)
      })
    } catch {
      // skip invalid
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

export async function readSkill(
  id: string
): Promise<{ id: string; markdown: string; path: string }> {
  const dir = join(await ensureRoot(), basename(id))
  const skillPath = join(dir, 'SKILL.md')
  const markdown = await readFile(skillPath, 'utf8')
  return { id: basename(id), markdown, path: dir }
}

export async function writeSkill(input: {
  id?: string
  markdown: string
  scripts?: Record<string, string>
}): Promise<SkillSummary> {
  const root = await ensureRoot()
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
  return {
    id,
    name: meta.name,
    description: meta.description,
    path: dir
  }
}

export async function deleteSkill(id: string): Promise<void> {
  const dir = join(await ensureRoot(), basename(id))
  await rm(dir, { recursive: true, force: true })
}
