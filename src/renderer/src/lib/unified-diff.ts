/** 渲染层 unified diff 解析（与 main/diff/unified.ts 的 parseUnifiedDiff 同构，避免跨层 import） */
export type ParsedHunk = {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: Array<{ mark: ' ' | '+' | '-'; text: string }>
}

export function parseUnifiedDiffLines(text: string): ParsedHunk[] {
  const hunks: ParsedHunk[] = []
  let cur: ParsedHunk | null = null
  for (const raw of text.split('\n')) {
    const m = raw.match(/^@@ -(\d+),(\d+) \+(\d+),(\d+) @@/)
    if (m) {
      cur = {
        oldStart: Number(m[1]),
        oldLines: Number(m[2]),
        newStart: Number(m[3]),
        newLines: Number(m[4]),
        lines: []
      }
      hunks.push(cur)
      continue
    }
    if (!cur) continue
    if (raw.startsWith('+++') || raw.startsWith('---')) continue
    const mark = raw.startsWith('+') ? '+' : raw.startsWith('-') ? '-' : ' '
    cur.lines.push({ mark, text: raw.slice(1) })
  }
  return hunks
}
