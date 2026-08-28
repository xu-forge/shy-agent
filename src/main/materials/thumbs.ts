import { createHash } from 'crypto'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { nativeImage } from 'electron'
import { resolveShyHome } from '../paths'

/** 缩略图目标宽度（px）；更小的原图不放大 */
export const THUMB_WIDTH = 480

/** projectId 仅作为目录段使用，剔除路径分隔符等危险字符 */
export function sanitizeProjectId(projectId: string): string {
  return projectId.replace(/[^a-zA-Z0-9_-]/g, '_')
}

/** 缓存键：路径 + mtime + size 任一变化即失效 */
export function thumbKeyOf(input: { absPath: string; mtimeMs: number; size: number }): string {
  return createHash('sha1')
    .update(`${input.absPath}\n${Math.round(input.mtimeMs)}\n${input.size}`)
    .digest('hex')
}

export function thumbsDirFor(projectId: string, home = resolveShyHome()): string {
  return join(home, 'cache', 'thumbs', sanitizeProjectId(projectId))
}

/** shy-asset:// 的 rel 首段是 host，会小写化；cache/thumbs 均为小写固定名，安全 */
export function thumbAssetUrl(projectId: string, key: string): string {
  return `shy-asset://cache/thumbs/${sanitizeProjectId(projectId)}/${key}.png`
}

export function findThumb(
  input: { projectId: string; absPath: string; mtimeMs: number; size: number },
  home = resolveShyHome()
): string | null {
  const key = thumbKeyOf(input)
  const file = join(thumbsDirFor(input.projectId, home), `${key}.png`)
  return existsSync(file) ? thumbAssetUrl(input.projectId, key) : null
}

/** nativeImage 支持的输入格式；webp/gif 等明确降级，不进缓存 */
export function isNativeImageSource(absPath: string): boolean {
  const lower = absPath.toLowerCase()
  return lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')
}

export function ensureImageThumb(
  input: { projectId: string; absPath: string; mtimeMs: number; size: number },
  home = resolveShyHome()
): { ok: true; url: string } | { ok: false; reason: 'unsupported' | 'not_found' } {
  if (!isNativeImageSource(input.absPath)) return { ok: false, reason: 'unsupported' }
  const hit = findThumb(input, home)
  if (hit) return { ok: true, url: hit }
  if (!existsSync(input.absPath)) return { ok: false, reason: 'not_found' }
  const source = nativeImage.createFromPath(input.absPath)
  if (source.isEmpty()) return { ok: false, reason: 'unsupported' }
  const resized =
    source.getSize().width > THUMB_WIDTH ? source.resize({ width: THUMB_WIDTH }) : source
  const dir = thumbsDirFor(input.projectId, home)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${thumbKeyOf(input)}.png`), resized.toPNG())
  return { ok: true, url: thumbAssetUrl(input.projectId, thumbKeyOf(input)) }
}

/** renderer 截帧产物（png/jpeg data URL）→ 缓存文件 */
export function putVideoThumb(
  input: { projectId: string; absPath: string; mtimeMs: number; size: number; dataUrl: string },
  home = resolveShyHome()
): { ok: true; url: string } | { ok: false; reason: 'invalid_data' } {
  const hit = findThumb(input, home)
  if (hit) return { ok: true, url: hit }
  const match = /^data:image\/(png|jpeg);base64,(.+)$/s.exec(input.dataUrl)
  if (!match) return { ok: false, reason: 'invalid_data' }
  const image = nativeImage.createFromBuffer(Buffer.from(match[2], 'base64'))
  if (image.isEmpty()) return { ok: false, reason: 'invalid_data' }
  const dir = thumbsDirFor(input.projectId, home)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${thumbKeyOf(input)}.png`), image.toPNG())
  return { ok: true, url: thumbAssetUrl(input.projectId, thumbKeyOf(input)) }
}
