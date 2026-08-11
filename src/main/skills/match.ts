import { listSkills, readSkill } from './store'

export type MatchedSkill = {
  id: string
  name: string
  description: string
  markdown: string
  score: number
}

/** Rank local skills against a user message for prompt injection. */
export async function matchSkills(query: string, limit = 3): Promise<MatchedSkill[]> {
  const q = query.toLowerCase()
  const tokens = q.split(/[\s,，。；;、/\\_-]+/).filter((t) => t.length >= 2)
  const skills = await listSkills()
  const scored: MatchedSkill[] = []

  for (const s of skills) {
    let score = 0
    const hay = `${s.name} ${s.description} ${s.id}`.toLowerCase()
    for (const t of tokens) {
      if (hay.includes(t)) score += 2
    }
    if (score === 0) continue
    try {
      const full = await readSkill(s.id)
      // boost if body mentions tokens
      const body = full.markdown.toLowerCase()
      for (const t of tokens) {
        if (body.includes(t)) score += 1
      }
      scored.push({
        id: s.id,
        name: s.name,
        description: s.description,
        markdown: full.markdown.slice(0, 4000),
        score
      })
    } catch {
      // ignore unreadable
    }
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit)
}

export function formatSkillsForPrompt(skills: MatchedSkill[]): string {
  if (!skills.length) return ''
  return skills
    .map(
      (s, i) =>
        `### 技能 ${i + 1}: ${s.name} (${s.id})\n${s.description}\n\n${s.markdown}`
    )
    .join('\n\n---\n\n')
}
