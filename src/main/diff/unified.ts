/**
 * 行级 diff 封装（基于开源库 jsdiff / `diff`@9）。
 *
 * - computePatch(oldText, newText, path) → hunks + 增删计数 + unified diff 文本
 * - parseUnifiedDiff(text) → hunks（渲染层解析入库文本用）
 * 大文件由调用方（capture.ts）在上游限制。
 */
import { structuredPatch } from 'diff'

export type DiffHunk = {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: Array<{ mark: ' ' | '+' | '-'; text: string }>
}

export type ComputedPatch = {
  hunks: DiffHunk[]
  added: number
  removed: number
  text: string
}

export function computePatch(oldText: string, newText: string, path: string): ComputedPatch {
  const res = structuredPatch('a/' + path, 'b/' + path, oldText, newText, '', '', { context: 3 })
  const hunks: DiffHunk[] = res.hunks.map((h) => ({
    oldStart: h.oldStart,
    oldLines: h.oldLines,
    newStart: h.newStart,
    newLines: h.newLines,
    lines: h.lines.map((l) => ({
      mark: (l.startsWith('+') ? '+' : l.startsWith('-') ? '-' : ' ') as ' ' | '+' | '-',
      text: l.slice(1)
    }))
  }))
  let added = 0
  let removed = 0
  for (const h of hunks) {
    for (const l of h.lines) {
      if (l.mark === '+') added++
      else if (l.mark === '-') removed++
    }
  }
  return { hunks, added, removed, text: formatUnifiedDiff(path, hunks) }
}

export function formatUnifiedDiff(path: string, hunks: DiffHunk[]): string {
  const head = `--- a/${path}\n+++ b/${path}`
  if (hunks.length === 0) return head
  const body = hunks
    .map(
      (h) =>
        `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@\n` +
        h.lines.map((l) => `${l.mark}${l.text}`).join('\n')
    )
    .join('\n')
  return `${head}\n${body}`
}

/** 解析 unified diff 文本（渲染层用；只识别 @@ 头与 +/-/空 三种行） */
export function parseUnifiedDiff(text: string): DiffHunk[] {
  const hunks: DiffHunk[] = []
  let cur: DiffHunk | null = null
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
    cur.lines.push({ mark: mark as ' ' | '+' | '-', text: raw.slice(1) })
  }
  return hunks
}
