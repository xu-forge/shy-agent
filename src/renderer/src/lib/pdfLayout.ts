export type PdfPageBox = { width: number; height: number }

/** 与 pdf.js 画布缩放一致：宽不超过 maxWidth，且 scale ≤ 1.25 */
export function pdfPageBox(pageWidth: number, pageHeight: number, maxWidth: number): PdfPageBox {
  if (!pageWidth || !pageHeight) return { width: 1, height: 1 }
  const scale = Math.min(1.25, maxWidth / pageWidth)
  return {
    width: Math.max(1, Math.round(pageWidth * scale)),
    height: Math.max(1, Math.round(pageHeight * scale))
  }
}

export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}
