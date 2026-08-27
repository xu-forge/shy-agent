# custom-mcp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户通过 `~/.shy/config/mcp.json` + 设置页接入 stdio MCP（如 MiniMax `web_search`），并删除不可靠的内置 Bing/DDG 搜索。

**Architecture:** `McpManager` 在主进程 spawn stdio、维护连接状态与 tool 快照；`buildTools` 合并 MCP→`ShyTool`；app ready 并行 connect，保存配置后 diff 重连。Renderer 只编辑 JSON 并展示状态。

**Tech Stack:** Electron 主进程、`@modelcontextprotocol/sdk` StdioClientTransport、Zod、React 设置弹窗、vitest。

## Global Constraints

- 规格与任务以简体中文为主
- 数据根 `~/.shy`（`SHY_HOME` 可覆盖）
- 仅 stdio；不实现 SSE/HTTP、Resources/Prompts
- 删除内置 `web_search`，保留 `web_fetch`
- 高危闸门不套到全部 MCP 调用

---

## File map

- Create: `src/main/mcp/config.ts` — 读写/校验 `mcp.json`
- Create: `src/main/mcp/config.test.ts`
- Create: `src/main/mcp/manager.ts` — connect/close/list/call/status
- Create: `src/main/mcp/manager.test.ts`
- Create: `src/main/mcp/to-shy-tool.ts` — MCP tool → `ShyTool`
- Create: `src/main/mcp/to-shy-tool.test.ts`
- Create: `src/renderer/src/components/McpSettingsPanel.tsx`
- Modify: `src/main/paths.ts` — `configMcp`
- Modify: `src/main/agent/tools/enrichment.ts` — 去掉 `web_search`
- Modify: `src/main/agent/service.ts`、`goal-driver.ts` — 合并 MCP 工具
- Modify: `src/main/agent/react-prompt.ts` — 有则必用
- Modify: `src/main/index.ts` — ready 连接 / quit 关闭
- Modify: `src/main/ipc.ts`、`src/shared/ipc.ts`、preload — MCP IPC
- Modify: `src/renderer/src/components/SettingsDialog.tsx` — MCP tab
- Modify: `package.json` — 依赖 sdk

---

## Task 1: 配置模型

**Files:** `paths.ts`、`src/main/mcp/config.ts`、`config.test.ts`

**Produces:** `readMcpConfig(): Promise<{ mcpServers: Record<string, McpServerEntry> }>`、`writeMcpConfig`

- [ ] **Step 1:** 单测：无文件 → 空 `mcpServers`；`enabled` 缺省 true；无 `command` 标无效但不崩溃
- [ ] **Step 2:** 实现路径与 JSON 读写（原子写：tmp + rename）
- [ ] **Step 3:** `npx vitest run src/main/mcp/config.test.ts`

---

## Task 2: McpManager（stdio）

**Files:** `manager.ts`、`manager.test.ts`；`package.json` 加 `@modelcontextprotocol/sdk`

**Produces:** `connectAll()`、`applyConfig(next)`、`getStatus()`、`getTools()`、`callTool(name, args)`、`shutdown()`

- [ ] **Step 1:** 单测 mock Client：并行 connect、ENOENT 隔离、同名后者 `mcp_<id>_<name>`、超时
- [ ] **Step 2:** StdioClientTransport；`env.PATH` 追加 `/opt/homebrew/bin`、`/usr/local/bin`、`$HOME/.local/bin`
- [ ] **Step 3:** `npx vitest run src/main/mcp/manager.test.ts`

---

## Task 3: 注入工具 + 删除内置搜索

**Files:** `to-shy-tool.ts`、`enrichment.ts`、`service.ts`、`goal-driver.ts`、`react-prompt.ts`、对应测试

**Consumes:** `McpManager.getTools()` / `callTool`

- [ ] **Step 1:** 单测：MCP tool schema → `ShyTool.run` 调用 `callTool`；无 MCP 时 `buildTools` 无 `web_search` 有 `web_fetch`
- [ ] **Step 2:** 从 `registerEnrichmentTools` 删除 `web_search`；可保留 `web-search.ts` 文件或删除（无引用即可）
- [ ] **Step 3:** prompt：若工具列表含 web_search 则事实类必须调用
- [ ] **Step 4:** `npx vitest run src/main/agent/tools/enrichment.test.ts src/main/agent/react-prompt.test.ts src/main/mcp/to-shy-tool.test.ts`

---

## Task 4: 生命周期

**Files:** `src/main/index.ts`、`ipc.ts`（保存配置后 `applyConfig`）

- [ ] **Step 1:** `whenReady` 后 `connectAll`；`before-quit` `shutdown`
- [ ] **Step 2:** `settings` 保存 MCP 后 `applyConfig`，无需重启

---

## Task 5: 设置 UI

**Files:** `shared/ipc.ts`、preload、`McpSettingsPanel.tsx`、`SettingsDialog.tsx`、`app.css`

**IPC 建议：** `shy:mcp-get`、`shy:mcp-set`、`shy:mcp-status`

- [ ] **Step 1:** 类型与 handle
- [ ] **Step 2:** MCP tab：增删改、enabled、env 掩码、状态（已连接/失败摘要）
- [ ] **Step 3:** ENOENT 文案提示绝对路径

---

## Task 6: 验收

- [ ] **Step 1:** `npm run typecheck && npm test`
- [ ] **Step 2:** 手测 MiniMax MCP +「广州周末去哪玩」；禁用后无 `web_search`、`web_fetch` 仍在
