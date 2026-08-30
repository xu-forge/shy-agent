/**
 * Active-file provider — 本轮发送瞬间用户正在查看的文件。
 *
 * 非 critical：无路径或空字符串不输出。
 * 只给路径与使用规则，不内嵌正文；由模型自行 fs_read。
 *
 * 「无关则忽略」必须写得很窄：模型容易把对话历史里的旧文件当成「当前问题」，
 * 再据此判定本块无关（例如 lightbox 已是 B，却用历史里的 A 回答「这个文档」）。
 */
import type { ReminderProviderFn } from '../types'

export const activeFileReminderProvider: ReminderProviderFn = (input) => {
  const view = input.env.activeView
  if (!view?.relativePath) return undefined
  const path = view.relativePath
  return `<active-file>
  kind: ${view.kind}
  relativePath: ${path}
  viewing: 用户正在查看 ${path}。
  bind: 「这个文档 / 该文件 / 这篇 / 这段 / 这里」= ${path}。对话历史里出现过的其他文件名不是所指对象。
  must: 用户在问文档/文件/这段内容时，MUST 先 fs_read ${path} 再答；不得用历史里其他文件的内容作答。
  ignore-only-if: 仅当问题明显不涉及任何文件（闲聊），或本轮用户消息用 @ 明确点了另一个路径。禁止因为「历史聊过别的文件」而判定本块无关。
</active-file>`
}
