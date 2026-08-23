/**
 * 文件改动 diff 捕获（inspector-func-panel）。
 *
 * - fs_write 覆盖已存在文件前：快照旧内容到 {sessionDir}/diffs/，计算 unified diff 入库
 * - fs_delete：删除前捕获（全减）
 * - 超过 2MB 的文件跳过内容（防内存/库体积炸）；diff 文本超 200KB 截断
 */
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join, basename } from 'path'
import { computePatch } from './unified'
import { recordDiff } from '../memory/db'
import { getShyPaths } from '../paths'

const MAX_CONTENT_BYTES = 2 * 1024 * 1024
const MAX_DIFF_CHARS = 200 * 1024

async function readIfSmall(path: string): Promise<string | null> {
  try {
    const buf = await readFile(path)
    if (buf.length > MAX_CONTENT_BYTES) return null
    return buf.toString('utf8')
  } catch {
    return null // 不存在
  }
}

async function snapshot(sessionId: string, path: string, content: string): Promise<string | null> {
  try {
    const dir = join(getShyPaths().sessionsDir, sessionId, 'diffs')
    await mkdir(dir, { recursive: true })
    const file = join(dir, `${Date.now()}-${basename(path)}.old`)
    await writeFile(file, content, 'utf8')
    return file
  } catch {
    return null
  }
}

function truncateDiff(text: string): string {
  if (text.length <= MAX_DIFF_CHARS) return text
  return `${text.slice(0, MAX_DIFF_CHARS)}\n…（diff 超过 200KB 已截断）`
}

/** fs_write 覆盖前调用 */
export async function captureWriteDiff(
  sessionId: string,
  path: string,
  newContent: string
): Promise<void> {
  const old = await readIfSmall(path)
  if (old === null) return // 新文件或大文件：新增 diff 由调用方按 recordFileOp 常规记录；大文件跳过 diff
  const snap = await snapshot(sessionId, path, old)
  const patch = computePatch(old, newContent, basename(path))
  recordDiff({
    sessionId,
    path,
    op: 'write',
    added: patch.added,
    removed: patch.removed,
    diffText: truncateDiff(patch.text),
    snapshotPath: snap
  })
}

/** fs_delete 删除前调用 */
export async function captureDeleteDiff(sessionId: string, path: string): Promise<void> {
  const old = await readIfSmall(path)
  if (old === null) return
  const snap = await snapshot(sessionId, path, old)
  const patch = computePatch(old, '', basename(path))
  recordDiff({
    sessionId,
    path,
    op: 'delete',
    added: patch.added,
    removed: patch.removed,
    diffText: truncateDiff(patch.text),
    snapshotPath: snap
  })
}
