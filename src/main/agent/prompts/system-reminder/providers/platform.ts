/**
 * Platform provider — 操作系统 / shell / 路径 / 权限层上下文。
 *
 * 设计参考 minimax mavis-09 §3.3 例 2：
 * - 仅在支持的平台注入（macOS / Windows / Linux）
 * - 包含 shell / 路径分隔符 / 权限提示
 *
 * Critical：tool 调用时 LLM 必须知道当前平台才能选对命令语法。
 */
import type { ReminderProviderFn } from '../types'

const PLATFORM_HINTS: Record<NodeJS.Platform, string> = {
  darwin: 'macOS — 使用 zsh；路径用 /；权限用 chmod/chown；GUI 操作可用 osascript。',
  win32: 'Windows — 使用 PowerShell；路径用 \\ 或 /；注意路径前缀 C:\\；GUI 用 PowerShell 脚本。',
  linux: 'Linux — 使用 bash/zsh；路径用 /；权限用 sudo（需确认）；包管理用 apt/yum/dnf。',
  aix: 'AIX — ksh；/etc/profile；compat',
  freebsd: 'FreeBSD — tcsh/csh；/usr/local；ports',
  openbsd: 'OpenBSD — ksh；pf 防火墙；sysctl',
  sunos: 'Solaris — ksh；/usr/xpg4/bin；svcs',
  cygwin: 'Cygwin — bash；/cygdrive/c 路径转换',
  netbsd: 'NetBSD — sh；pkgsrc',
  haiku: 'Haiku — bash；/boot/home',
  android: 'Android — toybox；/sdcard'
}

export const platformReminderProvider: ReminderProviderFn = (input) => {
  const hint = PLATFORM_HINTS[input.env.platform]
  if (!hint) return undefined
  return `<platform-context>
  platform: ${input.env.platform}  # 当前 OS
  shell: ${input.env.shell}  # 默认 shell
  cwd: ${input.env.cwd}  # 默认工作目录
  rule: ${hint}
</platform-context>`
}
