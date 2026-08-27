# Proposal: custom-mcp

## Why

内置 `web_search` 本机抓 Bing/DDG HTML，在国内 Electron 下经常「请求成功、零命中」，无法支撑事实类问题。用户已有可用的 MiniMax Token Plan MCP（stdio `uvx minimax-coding-plan-mcp`），WorkBuddy/dream 也是托管搜索而非扒 SERP。现在做自定义 MCP 客户端，让搜索等能力通过用户配置接入，去掉不可靠的内置搜索。

## What Changes

**MCP 配置与客户端**
- From: 无 MCP；工具仅 `registerTool` 静态表
- To: `~/.shy/config/mcp.json` 为源（Cursor 风格 `mcpServers`）；设置 MCP tab 编辑；应用启动连接所有 enabled stdio server；tools 注入主 Agent 与目标模式
- Reason: 用户用 MiniMax MCP 提供 `web_search`，无需内置搜索 API
- Impact: 新增 `@modelcontextprotocol/sdk`；IPC 读写配置与连接状态；非破坏（旧会话无 MCP 则无搜索工具）

**内置 web_search**
- From: Bing HTML + DDG Instant
- To: 删除内置实现；同名工具仅来自 MCP
- Reason: 内置不可用；与 MiniMax 导出名对齐
- Impact: `enrichment.ts` / prompt 仍可写「有则用 web_search」；无 MCP 时该工具不出现

**web_fetch**
- 保留现有 HTTP GET 剥标签实现。MiniMax MCP 不提供 fetch。

## Capabilities

### New Capabilities

- `mcp-stdio-client`：stdio MCP 配置、启动连接、工具注入、设置页编辑与状态；删除内置 `web_search`

### Modified Capabilities

（无 `openspec/specs/` 下既有 capability 的 REQUIREMENTS 语义变更。）

## Impact

- **config**：`~/.shy/config/mcp.json`（非仓库 `config/mcporter.json`）
- **main**：MCP 管理器（spawn/stdio/listTools/callTool）；`buildTools` 合并 MCP 工具；启动钩子；去掉 `runWebSearch` 注册
- **shared/preload**：MCP 配置 CRUD、连接状态 IPC
- **renderer**：设置弹窗 MCP tab
- **依赖**：`@modelcontextprotocol/sdk`
- **测试**：配置解析、撞名、连接失败隔离、无 MCP 时无 `web_search`
