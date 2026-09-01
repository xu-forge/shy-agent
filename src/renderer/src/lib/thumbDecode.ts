/** 卡片在画布上缩得太小时不必跑 pdf.js / 视频截帧（适应画布会让上百张同时「可见」）。 */
export const THUMB_DECODE_MIN_WIDTH = 96

export function shouldDecodeThumb(
  entry: { isIntersecting: boolean; width: number },
  minWidth = THUMB_DECODE_MIN_WIDTH
): boolean {
  return entry.isIntersecting && entry.width >= minWidth
}
