## Context

shy 已支持 Settings 管理 `~/.shy/config/mcp.json`（stdio：`command/args/env/enabled`），并由 `McpManager.applyConfig` 重连。本 change 已补齐 Agent `mcp_*` / `skill_set_enabled` 与 `manage-integrations` skill。用户要求同一能力内补齐 **Streamable HTTP** 远程 MCP，含 **headers** 与 **OAuth（本机 loopback 回调）**；明确不做旧版 SSE。

约束：高危删除/禁用需确认；规格与任务中文。

## Goals / Non-Goals

**Goals:**
- Agent 一句话 list / 增改 / 删除 / 启停 MCP（stdio **与** Streamable HTTP），写后自动重连
- HTTP 条目支持 `url` + 可选 `headers`；需 OAuth 时用 SDK `OAuthClientProvider` + `127.0.0.1`/`localhost` loopback 收 code
- Settings 可编辑 HTTP 条目，并提供「登录 / 重新授权」
- Agent `mcp_authorize`（或等价）可触发交互授权
- Token 另存 `~/.shy/config/mcp-oauth.json`，不进 `mcpServers` 正文
- Skill 启停与管理 skill 流程覆盖 HTTP JSON

**Non-Goals:**
- 旧版 SSE transport
- 自定义协议 OAuth 回调（如 `shy://`）
- MCP 市场、密钥保险柜（headers/env 仍明文落盘，与现 env 一致）
- Settings 全面重做（仅扩展传输类型与授权按钮）

## Decisions

### D1：专用工具 + 管理 skill（非纯 fs）
（既有）注册 `mcp_*` / `skill_set_enabled` + 管理 skill。

### D2：确认策略
（既有）删除与禁用确认；upsert / 启用 / skill_write 免确认。`mcp_authorize` 免确认（用户主动授权）。

### D3：配置输入 = URL 或 JSON + ask_user
（既有）扩展：HTTP JSON 缺 `url` 则 ask_user；stdio 缺 `command` 则 ask_user。

### D4：工具面
- 既有：`mcp_list`、`mcp_upsert`、`mcp_remove`、`mcp_set_enabled`、`skill_set_enabled`
- 新增：`mcp_authorize` — 对 HTTP 服务器发起 OAuth loopback 流程并重连

### D5：管理 skill 落点
（既有）builtin seed `manage-integrations`；文档补充 HTTP / 授权步骤。

### D6：传输与配置形状（方案 A）
- **选择**：同一 `mcpServers` map；有 `url` → Streamable HTTP；有 `command` → stdio；二者同时非空 → `invalid`
- **理由**：兼容常见远程 JSON；与 Settings/Agent 同源
- **已考虑**：单独 remote 配置文件 → 双 UI；仅加 url 无校验 → 歧义

### D7：OAuth = loopback + 显式授权
- **选择**：回调 `http://127.0.0.1:<ephemeral>/callback`（或 localhost）；`applyConfig` 仅用已存 token 静默连接，401 标 error 提示授权；交互流由 Settings「登录」或 `mcp_authorize` 触发（listen → openExternal → finishAuth → 重连）
- **理由**：避免启动时弹浏览器；对齐用户选 B
- **已考虑**：每次 connect 都交互 → 启动骚扰；自定义协议 → 本轮不做

### D8：Token 存储
- **选择**：`~/.shy/config/mcp-oauth.json` 按 server id 存 tokens / clientInformation
- **理由**：与 mcp.json 分离，删除 server 时可清理；本轮不做 OS keychain

## Risks / Trade-offs

- [Risk] 教学 URL HTML 各异 → ask_user 要 JSON
- [Risk] upsert 错误导致 error status → 返回 status，不假装成功
- [Risk] OAuth 提供方要求预注册固定 redirect → Mitigation: 文档说明需允许 localhost/127.0.0.1；动态端口按 RFC 8252
- [Risk] applyConfig 超时 vs 用户授权慢 → Mitigation: 静默连接短超时；authorize 单独长超时（约数分钟）
- [Trade-off] headers/token 明文落盘 → 与现 env 一致，密钥柜另议

## Migration Plan

- 既有仅含 command 的 mcp.json 原样可读
- 新增 url/headers 字段；oauth 文件缺省视为未授权
- 回滚：移除 HTTP 连接路径后，stdio 条目仍可用
- 验收：HTTP+headers 连上；OAuth 登录后重连成功；stdio 回归；Agent upsert HTTP；删除确认

## Open Questions

- （已决）管理 skill 名：`manage-integrations`
- （已决）不做 SSE；OAuth 用 loopback
