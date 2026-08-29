/**
 * Active-file provider — 本轮发送瞬间用户正在查看的文件。
 *
 * 非 critical：无路径或空字符串不输出。
 * 规则：有关则 fs_read 后再答；无关则忽略且不要主动提及。
 */
import type { ReminderProviderFn } from '../types'

export const activeFileReminderProvider: ReminderProviderFn = (input) => {
  const view = input.env.activeView
  if (!view?.relativePath) return undefined
  return `<active-file>
  kind: ${view.kind}  # 当前查看文件类型（code | material）
  relativePath: ${view.relativePath}  # 项目内 posix 相对路径
  rule: 若用户问题与该文件有关，MUST 使用 fs_read 后再答；若无关 MUST 忽略本块且不要主动提及该文件。
</active-file>`
}
