import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { resolveShyHome } from '../paths'

const MANAGE_INTEGRATIONS_MARKDOWN = `---
name: manage-integrations
description: 用一句话增删 MCP、启停/管理 Skill。从用户给的教学 URL 或 JSON 解析配置，缺字段 ask_user，再调用正式工具。支持 stdio 与 Streamable HTTP。
---

# 管理 MCP 与 Skill

## 何时用

用户要求添加/删除/启用/禁用 MCP 或 Skill，或丢来一段 \`mcpServers\` JSON / 配置教学链接。

## 流程（必须遵守）

1. **先摸底**：\`mcp_list\` 和/或 \`skill_list\`。
2. **取配置**：
   - 用户给了 JSON → 直接用；
   - 给了教学 URL → \`web_fetch\` 抽取字段；
   - **stdio** 需要 \`command\`（及可选 \`args\`/\`env\`）；
   - **Streamable HTTP** 需要 \`url\`（及可选 \`headers\`）；
   - \`command\` 与 \`url\` **互斥**；
   - 缺任一必要字段 → \`ask_user\` 补齐，**禁止无依据臆造 npm 包名并安装**。
3. **落盘**：
   - MCP 增改 → \`mcp_upsert\`（会写盘并重连）；
   - HTTP 若 status 提示需要 OAuth → \`mcp_authorize\`（浏览器授权）；
   - MCP 删除 → \`mcp_remove\`（确认闸门）；
   - MCP 启停 → \`mcp_set_enabled\`（禁用需确认）；
   - Skill 新建/改 → \`skill_write\`；
   - Skill 删除 → \`skill_delete\`（确认）；
   - Skill 启停 → \`skill_set_enabled\`（禁用需确认）。
4. **不要**用 \`fs_write\` 直接改 \`mcp.json\` 作为推荐路径（不会走 apply）。

## 成功标准

向用户回报：改了哪个 id、传输类型、当前 status（connected/error/disabled），以及若失败则给出 error 摘要。
`

/** 幂等写入 builtin 种子 skill 到 ~/.shy/skills-builtin */
export async function ensureBuiltinSkills(home = resolveShyHome()): Promise<void> {
  const root = join(home, 'skills-builtin', 'manage-integrations')
  await mkdir(root, { recursive: true })
  const path = join(root, 'SKILL.md')
  await writeFile(path, MANAGE_INTEGRATIONS_MARKDOWN, 'utf8')
}
