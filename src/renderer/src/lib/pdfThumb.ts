import './mapUpsertPolyfill'
import {
  getDocument,
  GlobalWorkerOptions,
  PDFWorker,
  type PDFDocumentProxy,
  type PDFPageProxy
} from 'pdfjs-dist/legacy/build/pdf.mjs'
import PdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker'
import pdfjsWorkerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { pdfPageBox, yieldToMain, type PdfPageBox } from './pdfLayout'

/**
 * 解析放到 Web Worker：主线程只负责把页画到 canvas。
 * 用 Vite `?worker` 生成 blob Worker，避开 file:// 不同源，也符合 CSP worker-src blob:。
 * 不要 import worker 模块本身——那会在主线程挂上 pdfjsWorker，pdf.js 就会走 fake worker。
 */
GlobalWorkerOptions.workerSrc = pdfjsWorkerSrc

let sharedWorker: PDFWorker | null = null

function sharedPdfWorker(): PDFWorker {
  if (!sharedWorker || sharedWorker.destroyed) {
    sharedWorker = PDFWorker.create({ name: 'shy-pdf', port: new PdfjsWorker() })
  }
  return sharedWorker
}

function pdfData(bytes: ArrayBuffer): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(new Uint8Array(bytes))
  return copy
}

const PDF_OPTIONS = {
  useWasm: false,
  useWorkerFetch: false,
  disableFontFace: true
} as const

function openPdf(bytes: ArrayBuffer) {
  return getDocument({
    data: pdfData(bytes),
    worker: sharedPdfWorker(),
    ...PDF_OPTIONS
  })
}

async function renderPageToCanvas(
  page: PDFPageProxy,
  maxWidth: number,
  className?: string
): Promise<HTMLCanvasElement | null> {
  const base = page.getViewport({ scale: 1 })
  if (!base.width || !base.height) return null
  const box = pdfPageBox(base.width, base.height, maxWidth)
  const viewport = page.getViewport({ scale: box.width / base.width })
  const canvas = document.createElement('canvas')
  if (className) canvas.className = className
  canvas.width = box.width
  canvas.height = box.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, viewport }).promise
  return canvas
}

export type PdfSession = {
  numPages: number
  measurePages(
    maxWidth: number,
    cancelled?: () => boolean,
    onProgress?: (boxes: PdfPageBox[]) => void
  ): Promise<PdfPageBox[]>
  renderPage(
    pageNumber: number,
    maxWidth: number,
    className?: string
  ): Promise<HTMLCanvasElement | null>
  destroy(): Promise<void>
}

/** 打开一份 PDF，供灯箱按页测量/渲染；调用方必须 destroy。 */
export async function createPdfSession(bytes: ArrayBuffer): Promise<PdfSession> {
  const task = openPdf(bytes)
  const doc: PDFDocumentProxy = await task.promise
  return {
    numPages: doc.numPages,
    async measurePages(maxWidth, cancelled, onProgress) {
      const boxes: PdfPageBox[] = []
      for (let i = 1; i <= doc.numPages; i++) {
        if (cancelled?.()) return boxes
        const page = await doc.getPage(i)
        const v = page.getViewport({ scale: 1 })
        boxes.push(pdfPageBox(v.width, v.height, maxWidth))
        if (i === 1 || i % 8 === 0 || i === doc.numPages) onProgress?.([...boxes])
        if (i % 8 === 0) await yieldToMain()
      }
      return boxes
    },
    async renderPage(pageNumber, maxWidth, className) {
      try {
        const page = await doc.getPage(pageNumber)
        return await renderPageToCanvas(page, maxWidth, className)
      } catch {
        return null
      }
    },
    destroy: async () => {
      try {
        await task.destroy()
      } catch {
        /* 重复 destroy（StrictMode / 取消竞态）忽略 */
      }
    }
  }
}

/** 渲染首页 → PNG dataURL；失败/无内容返回 null（调用方降级到类型图标）。 */
export async function renderPdfFirstPage(
  bytes: ArrayBuffer,
  maxWidth = 480
): Promise<string | null> {
  const task = openPdf(bytes)
  try {
    const doc = await task.promise
    if (doc.numPages < 1) return null
    const page = await doc.getPage(1)
    const canvas = await renderPageToCanvas(page, maxWidth)
    return canvas ? canvas.toDataURL('image/png') : null
  } catch {
    return null
  } finally {
    await task.destroy()
  }
}
