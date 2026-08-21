/**
 * Identity provider — 身份 / 会话 / 模式上下文。
 *
 * 设计参考 minimax mavis-09 §3.3 例 1：
 * - turn 1：full block（agent / user / session ID 全部）
 * - turn 2+：slim block（只 reminder）
 *
 * 每行带 inline 注释，LLM 一眼能看懂每行含义。
 * Critical：即使 SR 关闭也注入（agent 必须知道自己是谁）。
 */
import type { ReminderProviderFn } from '../types'

export const identityReminderProvider: ReminderProviderFn = (input) => {
  const { env, turnCount } = input
  if (turnCount === 1) {
    const lines = ['<agent-context>']
    lines.push(`  agent: ${env.displayName ?? env.agentName}  # 显示名（向用户自称时用）`)
    if (env.userConfiguredName) {
      lines.push(`  user: ${env.userConfiguredName}  # 称呼用户时用`)
    }
    lines.push(`  agentName: ${env.agentName}  # agent ID（CLI / 路由 / 存储）`)
    lines.push(`  agentRole: ${env.agentRole}  # agent 类型（orchestrator | worker | unknown）`)
    lines.push(`  SESSION ROLE: ${env.sessionId}  # 当前 session ID`)
    lines.push('</agent-context>')
    return lines.join('\n')
  }
  // turn 2+：slim block
  return `<agent-context>
  继续推进；当前 session ${env.sessionId}
  agent ${env.displayName ?? env.agentName}（${env.agentRole}）
</agent-context>`
}
