import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import { exec } from 'child_process'
import { promisify } from 'util'
import { readFile, writeFile, rm, mkdir } from 'fs/promises'
import { dirname } from 'path'
import { registerTool } from './registry'
import { upsertLongMemory, deleteLongMemory, listLongMemory } from '../../memory/db'
import { writeSkill, listSkills, deleteSkill } from '../../skills/store'

const execAsync = promisify(exec)

const SENSITIVE_PATH = /(\.ssh|\.gnupg|AppData\\Roaming\\my-agent\\settings\.json|\/etc\/passwd)/i

function isHighRiskOverwrite(path: string): boolean {
  return SENSITIVE_PATH.test(path) || /\.(exe|dll|sys|bat|cmd|ps1|sh)$/i.test(path)
}

export function registerBuiltinTools(): void {
  registerTool(
    'shell_exec',
    (ctx) =>
      new DynamicStructuredTool({
        name: 'shell_exec',
        description: '在本机执行 shell 命令（Windows 用 powershell/cmd，macOS 用 zsh/bash）',
        schema: z.object({
          command: z.string(),
          cwd: z.string().optional()
        }),
        func: async ({ command, cwd }) => {
          const risky =
            /(irm\s+|curl\s+.*\|\s*sh|npm\s+i(nstall)?\s+-g|winget\s+install|brew\s+install|rm\s+-rf\s+\/)/i.test(
              command
            )
          if (risky) {
            const ok = await ctx.confirmHighRisk('执行未知/安装类命令', command)
            if (!ok) return JSON.stringify({ ok: false, error: '用户拒绝' })
          }
          ctx.emit('tool', { name: 'shell_exec', command })
          try {
            const { stdout, stderr } = await execAsync(command, {
              cwd,
              timeout: 60_000,
              maxBuffer: 2_000_000,
              shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh'
            })
            return JSON.stringify({ ok: true, stdout, stderr })
          } catch (err) {
            const e = err as { message?: string; stdout?: string; stderr?: string }
            return JSON.stringify({
              ok: false,
              error: e.message,
              stdout: e.stdout,
              stderr: e.stderr
            })
          }
        }
      })
  )

  registerTool(
    'fs_read',
    (ctx) =>
      new DynamicStructuredTool({
        name: 'fs_read',
        description: '读取本地文件文本内容',
        schema: z.object({ path: z.string(), maxChars: z.number().optional() }),
        func: async ({ path, maxChars }) => {
          ctx.emit('tool', { name: 'fs_read', path })
          const text = await readFile(path, 'utf8')
          const clipped = text.slice(0, maxChars ?? 50_000)
          return JSON.stringify({
            ok: true,
            content: clipped,
            truncated: text.length > clipped.length
          })
        }
      })
  )

  registerTool(
    'fs_write',
    (ctx) =>
      new DynamicStructuredTool({
        name: 'fs_write',
        description: '写入本地文件（覆盖）。敏感/可执行文件需确认',
        schema: z.object({ path: z.string(), content: z.string() }),
        func: async ({ path, content }) => {
          if (isHighRiskOverwrite(path)) {
            const ok = await ctx.confirmHighRisk('覆盖写敏感/可执行文件', path)
            if (!ok) return JSON.stringify({ ok: false, error: '用户拒绝' })
          }
          ctx.emit('tool', { name: 'fs_write', path })
          await mkdir(dirname(path), { recursive: true })
          await writeFile(path, content, 'utf8')
          return JSON.stringify({ ok: true })
        }
      })
  )

  registerTool(
    'fs_delete',
    (ctx) =>
      new DynamicStructuredTool({
        name: 'fs_delete',
        description: '删除本地文件或目录（高危，需确认）',
        schema: z.object({ path: z.string(), recursive: z.boolean().optional() }),
        func: async ({ path, recursive }) => {
          {
            const ok = await ctx.confirmHighRisk('删除文件/目录', path)
            if (!ok) return JSON.stringify({ ok: false, error: '用户拒绝' })
          }
          ctx.emit('tool', { name: 'fs_delete', path })
          await rm(path, { recursive: Boolean(recursive), force: true })
          return JSON.stringify({ ok: true })
        }
      })
  )

  registerTool(
    'memory_upsert',
    (ctx) =>
      new DynamicStructuredTool({
        name: 'memory_upsert',
        description: '写入或更新长期记忆（偏好/工作流/规范）。会通知用户',
        schema: z.object({
          id: z.string().optional(),
          title: z.string(),
          content: z.string(),
          tags: z.array(z.string()).optional()
        }),
        func: async (input) => {
          const entry = upsertLongMemory({ ...input, source: 'agent' })
          ctx.emit('memory', { action: 'upsert', entryId: entry.id, title: entry.title })
          return JSON.stringify({ ok: true, entry })
        }
      })
  )

  registerTool(
    'memory_list',
    (ctx) =>
      new DynamicStructuredTool({
        name: 'memory_list',
        description: '列出长期记忆条目',
        schema: z.object({}),
        func: async () => {
          ctx.emit('tool', { name: 'memory_list' })
          return JSON.stringify({ ok: true, entries: listLongMemory() })
        }
      })
  )

  registerTool(
    'memory_delete',
    (ctx) =>
      new DynamicStructuredTool({
        name: 'memory_delete',
        description: '删除长期记忆（需确认）',
        schema: z.object({ id: z.string() }),
        func: async ({ id }) => {
          const ok = await ctx.confirmHighRisk('删除长期记忆', id)
          if (!ok) return JSON.stringify({ ok: false, error: '用户拒绝' })
          deleteLongMemory(id)
          ctx.emit('memory', { action: 'delete', entryId: id })
          return JSON.stringify({ ok: true })
        }
      })
  )

  registerTool(
    'skill_write',
    (ctx) =>
      new DynamicStructuredTool({
        name: 'skill_write',
        description: '创建或更新本地 SKILL.md 技能包',
        schema: z.object({
          id: z.string().optional(),
          markdown: z.string(),
          scripts: z.record(z.string(), z.string()).optional()
        }),
        func: async (input) => {
          const skill = await writeSkill(input)
          ctx.emit('tool', { name: 'skill_write', id: skill.id })
          return JSON.stringify({ ok: true, skill })
        }
      })
  )

  registerTool(
    'skill_list',
    (ctx) =>
      new DynamicStructuredTool({
        name: 'skill_list',
        description: '列出本地技能',
        schema: z.object({}),
        func: async () => {
          ctx.emit('tool', { name: 'skill_list' })
          return JSON.stringify({ ok: true, skills: await listSkills() })
        }
      })
  )

  registerTool(
    'skill_delete',
    (ctx) =>
      new DynamicStructuredTool({
        name: 'skill_delete',
        description: '删除本地技能（需确认）',
        schema: z.object({ id: z.string() }),
        func: async ({ id }) => {
          const ok = await ctx.confirmHighRisk('删除技能', id)
          if (!ok) return JSON.stringify({ ok: false, error: '用户拒绝' })
          await deleteSkill(id)
          ctx.emit('tool', { name: 'skill_delete', id })
          return JSON.stringify({ ok: true })
        }
      })
  )
}
