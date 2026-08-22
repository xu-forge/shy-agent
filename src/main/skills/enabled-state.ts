/** 技能启用/禁用状态：~/.shy/skills-enabled.json 记录禁用名单（按技能 name）。 */
import { readFile, writeFile, mkdir } from 'fs/promises'
import { dirname, join } from 'path'

export function disabledSkillsFile(shyHome: string): string {
  return join(shyHome, 'skills-enabled.json')
}

export async function loadDisabledSkills(shyHome: string): Promise<string[]> {
  try {
    const raw = JSON.parse(await readFile(disabledSkillsFile(shyHome), 'utf8'))
    if (Array.isArray(raw.disabled)) return raw.disabled.filter((x: unknown) => typeof x === 'string')
  } catch {
    // 不存在或损坏 → 空
  }
  return []
}

export async function saveDisabledSkills(shyHome: string, disabled: string[]): Promise<void> {
  const file = disabledSkillsFile(shyHome)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify({ disabled }, null, 2), 'utf8')
}
