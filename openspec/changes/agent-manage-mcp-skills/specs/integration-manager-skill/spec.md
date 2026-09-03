## ADDED Requirements

### Requirement: 管理集成引导 Skill
系统 MUST 提供可用的管理 skill（默认 id 可为 `manage-integrations`），指导 Agent：先 list 现状 → 从用户给出的教学 URL 或 JSON 解析 MCP/Skill 意图 → 缺字段时 `ask_user` → 再调用正式配置工具；禁止在无 URL/JSON/用户确认字段依据时臆造 MCP 包名并安装。

#### Scenario: JSON 加 MCP
- **WHEN** 用户提供合法 mcpServers 条目 JSON 并要求添加
- **THEN** Agent 按 skill 指引调用 `mcp_upsert`（必要时先 `mcp_list`），不得仅用裸 `fs_write` 作为推荐路径

#### Scenario: URL 缺字段则询问
- **WHEN** 用户给出教学 URL 且解析后缺少 command 或必要 args
- **THEN** Agent MUST 使用 `ask_user` 补齐后再 upsert

#### Scenario: 删除前确认语义
- **WHEN** 用户要求删除某 MCP 或禁用某 skill
- **THEN** skill 指引 Agent 调用对应 remove/set_enabled 工具并依赖系统确认闸门，不得跳过工具私自改文件规避确认
