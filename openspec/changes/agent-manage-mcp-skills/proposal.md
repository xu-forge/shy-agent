## Why

用户希望用一句话（贴教学 URL 或 JSON）让 Agent 自动增删 MCP、管理 Skill。Skill 侧工具已齐；MCP Agent 工具已落地，但传输仍仅 stdio。远程 MCP 普遍使用 **Streamable HTTP**（常带 headers / OAuth），不支持则「一句话配置」与 Settings 都无法覆盖真实用法。本 change 在同一能力内补齐 HTTP 传输与完整 OAuth（loopback）。

## What Changes

**MCP Agent 配置工具**
- From: 无 / 仅 stdio upsert
- To: `mcp_list` / `mcp_upsert`（stdio 或 HTTP）/ `mcp_remove` / `mcp_set_enabled` / `mcp_authorize`，写盘后 apply
- Reason: 一句话加删 MCP 且立即生效，含远程服务器
- Impact: non-breaking；扩展配置形状

**Streamable HTTP + OAuth**
- From: 仅 stdio `command/args/env`
- To: 条目可 `url` + 可选 `headers`；OAuth token 存 `mcp-oauth.json`；Settings 登录 + Agent `mcp_authorize`
- Reason: 一次做完整远程接入
- Impact: 扩展 `mcp.json` 字段；Settings UI 增传输类型

**Skill 启停 / 管理 Skill**
- （既有）`skill_set_enabled` + `manage-integrations`；文档补充 HTTP/OAuth

**确认闸门**
- （既有）仅 remove / 禁用确认；authorize 免确认

## Capabilities

### New Capabilities
- `agent-mcp-config`: Agent 通过专用工具读写 MCP 配置（stdio 与 Streamable HTTP）并应用重连；含 OAuth 授权触发
- `agent-skill-lifecycle`: Agent 启停 Skill
- `integration-manager-skill`: 管理 MCP/Skill 的引导 skill（URL/JSON/ask_user；含 HTTP）

### Modified Capabilities
<!-- 无归档主规格需 delta；以本 change specs 为准 -->

## Impact

- `src/main/mcp/*`（config 联合、HTTP session、OAuth provider、loopback）
- Settings `McpSettingsPanel`、shared IPC、preload
- Agent tools + manage-integrations seed
- 不做 SSE / 自定义协议回调
