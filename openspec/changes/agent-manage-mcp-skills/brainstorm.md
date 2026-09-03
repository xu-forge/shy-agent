<!--
Raw capture of superpowers:brainstorming output.
本檔原樣捕捉 brainstorming 產出；design.md 另做結構化重組。
-->

# Brainstorm：一句话让 Agent 增删 MCP / Skill

## 背景

用户希望用自然语言（例如贴教学 URL 或 JSON）让 Agent 自动增加/删除 MCP，以及管理 Skill。  
现状：Skills 已有 `skill_write` / `skill_list` / `skill_delete`；MCP 仅 Settings UI + IPC，无 Agent 配置工具；用 `fs_write` 改 `mcp.json` 不会走 `applyConfig` 重连。

## 决议链

### Q1 — 实现方式
- 选项：A 专用工具 / B 只靠 fs / C 专用工具 + 管理 skill  
- **决定：C**

### Q2 — 确认闸门
- 选项：全写确认 / 仅删禁用 / 删+新增 MCP / 跟始终授权  
- **决定：B — 仅删除/禁用确认；新增、改配置、`skill_write` 免确认**

### Q3 — MCP 配置从哪来
- 用户可能给：**配置教学 URL** 或 **JSON**  
- 缺字段用 **`ask_user` 补齐**  
- Agent 可用既有 `web_fetch` 拉 URL

## 设计取捨（已批准）

**In：**  
- Agent 专用工具：MCP list / upsert / remove / set_enabled；Skill `set_enabled`（写/删沿用现有）  
- 内置管理 skill：教何时用工具、如何从 URL/JSON 解析、缺字段 ask_user  
- MCP 写入必须经 store + `applyConfig` 重连  
- 删除/禁用走 `confirmHighRisk`

**Out：**  
- MCP 市场 / 图形安装向导  
- 非 stdio 传输（保持 `command/args/env`）  
- Settings UI 大改版

**推荐工具面：**

| 工具 | 确认 |
|---|---|
| `mcp_list` | 否 |
| `mcp_upsert` | 否 |
| `mcp_remove` | 是 |
| `mcp_set_enabled`（禁用） | 是 |
| `skill_set_enabled`（禁用） | 是 |
| 既有 `skill_write` / `skill_delete` | delete 已确认 |

**验收要点：** JSON 加 MCP 后重连可见状态；URL 可解析或 ask_user；删/禁用弹确认；skill 写删启停可一句话完成。
