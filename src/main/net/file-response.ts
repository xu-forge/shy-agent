import { statSync } from 'fs'
import { open } from 'fs/promises'
import { extname } from 'path'

/** 常见素材 MIME；未知扩展走 octet-stream，Chromium 仍能按内容嗅探 */
const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  avif: 'image/avif',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  json: 'application/json; charset=utf-8',
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8'
}

function mimeFor(absPath: string): string {
  const ext = extname(absPath).replace(/^\./, '').toLowerCase()
  return MIME[ext] ?? 'application/octet-stream'
}

/**
 * material-canvas: 以自定义协议响应素材文件，支持 HTTP Range。
 * net.fetch(file://) 不返回 Accept-Ranges/Content-Type，导致 <video> 读不到
 * metadata（首帧截不出、点进去显示"不支持查看"）；这里按 Range 手动切片返回 206。
 */
export async function respondFileWithRange(absPath: string, request: Request): Promise<Response> {
  let size: number
  try {
    size = statSync(absPath).size
  } catch {
    return new Response('not found', { status: 404 })
  }
  const type = mimeFor(absPath)
  const baseHeaders: Record<string, string> = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    // renderer 页面源与 shy-material 不同源；截帧 toDataURL / fetch PDF 都需要 CORS
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD'
  }
  const rangeHeader = request.headers.get('range')
  if (!rangeHeader) {
    return new Response(await readFileBytes(absPath, 0, size), {
      status: 200,
      headers: { ...baseHeaders, 'Content-Length': String(size) }
    })
  }
  const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader)
  let start: number
  let end: number
  if (match && (match[1] || match[2])) {
    start = match[1] ? Number(match[1]) : 0
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
    if (match[1] === '' && match[2]) {
      // 后缀范围 bytes=-N → 取末尾 N 字节
      const suffix = Number(match[2])
      start = Math.max(0, size - suffix)
      end = size - 1
    }
  } else {
    start = 0
    end = size - 1
  }
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
    return new Response(null, {
      status: 416,
      headers: { ...baseHeaders, 'Content-Range': `bytes */${size}` }
    })
  }
  const length = end - start + 1
  return new Response(await readFileBytes(absPath, start, length), {
    status: 206,
    headers: {
      ...baseHeaders,
      'Content-Length': String(length),
      'Content-Range': `bytes ${start}-${end}/${size}`
    }
  })
}

async function readFileBytes(absPath: string, start: number, length: number): Promise<ArrayBuffer> {
  if (length <= 0) return new ArrayBuffer(0)
  const handle = await open(absPath, 'r')
  try {
    const buf = Buffer.alloc(length)
    await handle.read(buf, 0, length, start)
    return new Uint8Array(buf).slice().buffer
  } finally {
    await handle.close()
  }
}
