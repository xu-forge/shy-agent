export const NEAR_BOTTOM_PX = 80

/** 是否靠近滚动容器底部（用于流式输出时决定是否跟随滚到底）。 */
export function isNearBottom(
  el: Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'clientHeight'>,
  thresholdPx = NEAR_BOTTOM_PX
): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= thresholdPx
}
