import { z } from 'zod'
import { exec } from 'child_process'
import { promisify } from 'util'
import { readFile, writeFile, rm, mkdir } from 'fs/promises'
import { dirname, isAbsolute, join } from 'path'
import { registerTool } from './registry'
import { upsertLongMemory, deleteLongMemory, listLongMemory, recordFileOp } from '../../memory/db'
import { writeSkill, listSkills, deleteSkill, getEnabledSkillEntries } from '../../skills/store'
import { registerTaskTools } from './builtin/task'
import { registerBrowserTool } from './browser'
import { captureWriteDiff, captureDeleteDiff } from '../../diff/capture'

/**
 * shell-session-side-panel：本文件内置工具中需要打点文件操作到 session_files 表的工具：
 *   - fs_read   → op='read'
 *   - fs_write  → op='write'
 *   - fs_delete → op='delete'
 * 未来 builtin 添加 fs_edit / fs_copy / fs_move 时继续按本约定扩展。
 */

const execAsync = promisify(exec)

const SENSITIVE_PATH =
  /(\.ssh|\.gnupg|\.shy[/\\]config[/\\]settings\.json|AppData\\Roaming\\my-agent\\settings\.json|\/etc\/passwd)/i

function isHighRiskOverwrite(path: string): boolean {
  return SENSITIVE_PATH.test(path) || /\.(exe|dll|sys|bat|cmd|ps1|sh)$/i.test(path)
}

/** 相对路径 → 会话工作区内绝对路径；绝对路径原样返回 */
export function resolveWorkspacePath(workspaceDir: string, path: string): string {
  if (isAbsolute(path)) return path
  return join(workspaceDir, path)
}

export function registerBuiltinTools(): void {
  registerTool('shell_exec', (ctx) => ({
    name: 'shell_exec',
    description:
      '在本机执行 shell 命令（Windows 用 powershell，macOS/Linux 用 zsh/bash）。\n\n' +
      '何时用：跑命令拿信息（ls / cat / grep / git status）、构建测试（npm test / make）、启动服务（python -m http.server）。\n' +
      '何时不用：读取文件请用 fs_read（不要 cat 整个文件）；列文件请用 glob（不要 find / ls -R）；需要纯文本输出请用 printf 不要 echo -e。\n' +
      '高危命令（curl | sh、npm i -g、winget install、brew install、rm -rf /）会自动弹确认框 — 用户拒绝则取消。\n' +
      '超时 60 秒，输出上限 2MB；长输出请重定向到文件再读。\n' +
      '相对路径/不传 cwd 时以会话工作区（~/.shy/sessions/{会话}/workspace）为基准。\n' +
      '参数：`command` 必填（要执行的命令字符串）；`cwd` 可选（默认会话工作区）。',
    schema: z.object({
      command: z.string(),
      cwd: z.string().optional()
    }),
    run: async ({ command, cwd }) => {
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
        const runCwd = cwd ? resolveWorkspacePath(ctx.workspaceDir, cwd) : ctx.workspaceDir
        await mkdir(runCwd, { recursive: true })
        const { stdout, stderr } = await execAsync(command, {
          cwd: runCwd,
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
  }))

  registerTool('fs_read', (ctx) => ({
    name: 'fs_read',
    description:
      '读取本地文件文本内容。\n\n' +
      '何时用：查看文件内容（源码 / 配置 / 日志）、读大文件指定行号段、确认文件存在。\n' +
      '何时不用：列出文件用 glob；搜内容用 grep（不要 cat 全文件再 grep）；读二进制用专用工具。\n' +
      '默认截断到 50000 字符；用 `maxChars` 调大或调小。文件不存在 / 权限不足会返回 ok=false。\n' +
      '文件操作会记录到 session_files 表（用于「文件侧栏」）。\n' +
      '相对路径以会话工作区（~/.shy/sessions/{会话}/workspace）为基准。\n' +
      '参数：`path` 必填（绝对路径或相对会话工作区）；`maxChars` 可选（默认 50000）。',
    schema: z.object({ path: z.string(), maxChars: z.number().optional() }),
    run: async ({ path, maxChars }) => {
      const abs = resolveWorkspacePath(ctx.workspaceDir, path)
      ctx.emit('tool', { name: 'fs_read', path: abs })
      const text = await readFile(abs, 'utf8')
      const clipped = text.slice(0, maxChars ?? 50_000)
      recordFileOp(ctx.sessionId, 'read', abs)
      return JSON.stringify({
        ok: true,
        content: clipped,
        truncated: text.length > clipped.length
      })
    }
  }))

  registerTool('fs_write', (ctx) => ({
    name: 'fs_write',
    description:
      '写入本地文件（覆盖模式）。自动创建父目录。\n\n' +
      '何时用：创建新文件、覆盖整个文件（不能增量编辑时）。\n' +
      '何时不用：改文件某几行用 fs_edit（待加）；追加内容用 cat << EOF 配合 shell_exec。\n' +
      '**安全：写入敏感路径（.ssh / .gnupg / shy settings）或可执行文件（.exe/.sh/.bat/.ps1）会弹确认框 — 用户拒绝则取消。**\n' +
      '注意：是「覆盖」不是「合并」；误用会丢内容。相对路径以会话工作区为基准。\n' +
      '参数：`path` 必填（写入位置，绝对路径或相对会话工作区）；`content` 必填（完整新内容）。',
    schema: z.object({ path: z.string(), content: z.string() }),
    run: async ({ path, content }) => {
      const abs = resolveWorkspacePath(ctx.workspaceDir, path)
      if (isHighRiskOverwrite(abs)) {
        const ok = await ctx.confirmHighRisk('覆盖写敏感/可执行文件', abs)
        if (!ok) return JSON.stringify({ ok: false, error: '用户拒绝' })
      }
      ctx.emit('tool', { name: 'fs_write', path: abs })
      await captureWriteDiff(ctx.sessionId, abs, content)
      await mkdir(dirname(abs), { recursive: true })
      await writeFile(abs, content, 'utf8')
      recordFileOp(ctx.sessionId, 'write', abs)
      return JSON.stringify({ ok: true, path: abs })
    }
  }))

  registerTool('fs_delete', (ctx) => ({
    name: 'fs_delete',
    description:
      '删除本地文件或目录。\n\n' +
      '何时用：清理临时文件、删除过时资源、目标模式下"删除这个文件"指令。\n' +
      '何时不用：修改文件用 fs_edit；移走用 mv（shell_exec）；删整个项目目录用 git rm + commit。\n' +
      '**必须弹确认框**（不可跳过）— 任何删除操作都强制用户手动确认。\n' +
      '`recursive=true` 时会删整个目录（包括子目录）— 谨慎使用。\n' +
      '不可恢复（不进回收站）；删错了只能从 git/restore 找回。相对路径以会话工作区为基准。\n' +
      '参数：`path` 必填（绝对路径或相对会话工作区）；`recursive` 可选（默认 false，仅删文件；true 时删目录及子项）。',
    schema: z.object({ path: z.string(), recursive: z.boolean().optional() }),
    run: async ({ path, recursive }) => {
      const abs = resolveWorkspacePath(ctx.workspaceDir, path)
      {
        const ok = await ctx.confirmHighRisk('删除文件/目录', abs)
        if (!ok) return JSON.stringify({ ok: false, error: '用户拒绝' })
      }
      ctx.emit('tool', { name: 'fs_delete', path: abs })
      if (!recursive) await captureDeleteDiff(ctx.sessionId, abs)
      await rm(abs, { recursive: Boolean(recursive), force: true })
      recordFileOp(ctx.sessionId, 'delete', abs)
      return JSON.stringify({ ok: true })
    }
  }))

  registerTool('memory_upsert', (ctx) => ({
    name: 'memory_upsert',
    description:
      '写入或更新长期记忆条目（用户偏好 / 工作流 / 规范 / 稳定知识）。\n\n' +
      '何时用：用户说"以后默认用 X" / "记一下" / "不要做 Y"；agent 发现可复用工作流；用户给硬性约束。\n' +
      '何时不用：临时上下文 / 一次性任务参数（应写到短期记忆）；agent 内部状态。\n' +
      '**审计友好**：每次 upsert 都会通知用户 + 写入 memory_audit 表（user/agent 来源可追溯）。\n' +
      '重复内容会更新 revision（+1），不是覆盖。\n' +
      '参数：`title` 必填（条目标题，3-10 字）；`content` 必填（条目内容，可 markdown）；`id` 可选（不传则新建，传则更新）；`tags` 可选（用于后续分类）。',
    schema: z.object({
      id: z.string().optional(),
      title: z.string(),
      content: z.string(),
      tags: z.array(z.string()).optional()
    }),
    run: async (input) => {
      const entry = upsertLongMemory({ ...input, source: 'agent' })
      ctx.emit('memory', { action: 'upsert', entryId: entry.id, title: entry.title })
      return JSON.stringify({ ok: true, entry })
    }
  }))

  registerTool('memory_list', (ctx) => ({
    name: 'memory_list',
    description:
      '列出全部长期记忆条目（按 updated_at 倒序）。\n\n' +
      '何时用：检查已有偏好 / 找冲突的工作流 / 决策前查"用户之前定过没有"。\n' +
      '何时不用：写新条目用 memory_upsert；删条目用 memory_delete。\n' +
      '返回完整条目（含 id/title/content/tags/source/revision），无参数。\n' +
      '调用前应先用本工具确认没有相关已有记忆，避免重复 upsert。',
    schema: z.object({}),
    run: async () => {
      ctx.emit('tool', { name: 'memory_list' })
      return JSON.stringify({ ok: true, entries: listLongMemory() })
    }
  }))

  registerTool('memory_delete', (ctx) => ({
    name: 'memory_delete',
    description:
      '删除一条长期记忆（软删除，标记 deleted_at，仍可审计恢复）。\n\n' +
      '何时用：用户说"忘了那条偏好" / "这条记忆过期了" / 检测到跟当前指令矛盾。\n' +
      '何时不用：想覆盖旧内容用 memory_upsert（同 id 替换 + revision 自增）。\n' +
      '**必须弹确认框**（不可跳过）— 删错记忆会导致后续决策失忆。\n' +
      '参数：`id` 必填（要删的条目 id，可从 memory_list 拿）。',
    schema: z.object({ id: z.string() }),
    run: async ({ id }) => {
      const ok = await ctx.confirmHighRisk('删除长期记忆', id)
      if (!ok) return JSON.stringify({ ok: false, error: '用户拒绝' })
      deleteLongMemory(id)
      ctx.emit('memory', { action: 'delete', entryId: id })
      return JSON.stringify({ ok: true })
    }
  }))

  registerTool('skill_write', (ctx) => ({
    name: 'skill_write',
    description:
      '创建或更新本地 SKILL.md 技能包（落盘到 ~/.shy/skills/）。\n\n' +
      '何时用：用户给稳定的工作流（"以后做 X 都要这样"）；agent 抽出可复用模式（"这个流程值得固化"）。\n' +
      '何时不用：临时步骤用 plan checklist；一次性流程不需要技能化。\n' +
      'SKILL.md 内容是 markdown 说明 + 可选 scripts 字典（脚本会被存到同目录）。\n' +
      '新技能写入后立即生效：出现在下次对话的技能目录里，LLM 会用 skill 工具读取全文。\n' +
      '参数：`markdown` 必填（SKILL.md 完整内容）；`id` 可选（不传则新建，传则更新）；`scripts` 可选（脚本名 → 脚本内容）。',
    schema: z.object({
      id: z.string().optional(),
      markdown: z.string(),
      scripts: z.record(z.string(), z.string()).optional()
    }),
    run: async (input) => {
      const skill = await writeSkill(input)
      ctx.emit('tool', { name: 'skill_write', id: skill.id })
      return JSON.stringify({ ok: true, skill })
    }
  }))

  registerTool('skill_list', (ctx) => ({
    name: 'skill_list',
    description:
      '列出本地所有技能包（~/.shy/skills/*）。\n\n' +
      '何时用：检查现有能力（避免重复创建）/ 找适合当前任务的技能 id。\n' +
      '何时不用：用某个技能做实际事 — 技能目录已在 system prompt 里，LLM 会用 skill 工具按需读取，不需要先列一遍。\n' +
      '返回技能 id/name/description/path，无参数。\n' +
      '与 skill_list 不同：本工具只列"我自己管理的技能"，不是用户视角的全集。',
    schema: z.object({}),
    run: async () => {
      ctx.emit('tool', { name: 'skill_list' })
      return JSON.stringify({ ok: true, skills: await listSkills() })
    }
  }))

  registerTool('skill_delete', (ctx) => ({
    name: 'skill_delete',
    description:
      '删除本地技能包（从 ~/.shy/skills/ 移除整个目录）。\n\n' +
      '何时用：技能过期 / 内容错误 / 用户不想再要。\n' +
      '何时不用：临时禁用（目前没有 disable 机制；要么删要么改内容用 skill_write）。\n' +
      '**必须弹确认框**（不可跳过）— 删错技能下次就没法自动命中。\n' +
      '参数：`id` 必填（技能 id，可从 skill_list 拿）。',
    schema: z.object({ id: z.string() }),
    run: async ({ id }) => {
      const ok = await ctx.confirmHighRisk('删除技能', id)
      if (!ok) return JSON.stringify({ ok: false, error: '用户拒绝' })
      await deleteSkill(id)
      ctx.emit('tool', { name: 'skill_delete', id })
      return JSON.stringify({ ok: true })
    }
  }))
  // 读取技能全文（catalog 注入后 LLM 按需展开）
  registerTool('skill', (ctx) => ({
    name: 'skill',
    description:
      '读取一个本地技能的完整 SKILL.md 内容。\n\n' +
      '何时用：system prompt 的「可用技能」目录中某技能与当前任务相关，需要其完整说明再操作。\n' +
      '何时不用：目录中没有相关技能；或已在本会话读取过同一技能。\n' +
      '参数：`name` 必填（技能名，来自技能目录）。',
    schema: z.object({ name: z.string() }),
    run: async ({ name }) => {
      const enabled = await getEnabledSkillEntries()
      const entry = enabled.find((e) => e.name === name)
      if (!entry) {
        return JSON.stringify({ ok: false, error: `技能不存在或已禁用：${name}` })
      }
      ctx.emit('tool', { name: 'skill', skill: entry.name })
      return JSON.stringify({ ok: true, name: entry.name, root: entry.rootKind, markdown: entry.content })
    }
  }))
  // sub-agent 派活工具（task / task_output / task_query / task_stop）
  registerTaskTools()
  // 内嵌浏览器工具（minimax-feature-port）
  registerBrowserTool()
}
