# Design: custom-mcp

## Context

shy 主进程用 `registerTool` → `buildTools` 把 Zod 工具交给 turn-runner。内置 `web_search`（`web-search.ts`）抓 Bing HTML / DDG Instant，session 日志为 `bing 无结构化命中；ddg 无命中`。`web_fetch` 走 `httpGet`（Electron `net.fetch` 优先）剥 HTML，与搜索无关。

用户搜索来源是 MiniMax Token Plan MCP：`command: uvx`，`args: ["minimax-coding-plan-mcp", "-y"]`，env `MINIMAX_API_KEY` / `MINIMAX_API_HOST`，stdio，工具 `web_search`。设置弹窗现有 tab：记忆 / 常规 / 日志。数据根 `~/.shy`。

## Goals / Non-Goals

**Goals:**

- 用户可配置任意 stdio MCP server，工具进入 interactive 与 goal 的 act 工具表
- JSON 为唯一源；设置页可编辑并显示连接状态
- 启动时并行连接 enabled server；单点失败不堵其余
- 删除内置 `web_search`；保留 `web_fetch`
- 验收：配 MiniMax MCP 后「广州周末去哪玩」能搜到结构化结果

**Non-Goals:**

- SSE / Streamable HTTP
- MCP Resources / Prompts
- MCP 市场 / 一键安装 MiniMax
- 为 MCP 工具单独做 Renderer（`web_search` 仍走现有 SearchFetch）

## Decisions

### D1：配置源 — JSON + 设置编辑

- **选择**：`~/.shy/config/mcp.json`；形状对齐 Cursor / Claude Desktop：`{ "mcpServers": { "<id>": { command, args?, env?, enabled? } } }`。`enabled` 缺省 true。设置 MCP tab 读写同一文件。
- **理由**：可手改、可备份；日常不用摸文件。
- **已考虑 alternative**：仅表单（难备份）；仅 JSON（无状态反馈）。

### D2：仅 stdio

- **选择**：`command` + `args` + `env`；用 `@modelcontextprotocol/sdk` 的 StdioClientTransport。
- **理由**：MiniMax / 多数本地 MCP 都是 stdio。
- **已考虑 alternative**：首版同时做 HTTP/SSE → 范围膨胀。

### D3：删除内置 web_search，保留 web_fetch

- **选择**：不再 `registerTool('web_search')`；MCP 导出名原样注入。两 server 同名时后者改为 `mcp_<serverId>_<name>`。
- **理由**：内置搜索不可用；MiniMax 工具就叫 `web_search`。fetch 不在该 MCP 里。
- **已考虑 alternative**：前缀所有 MCP 工具 → 模型要记新名；同名覆盖内置 → 用户要求内置不要。

### D4：启动连接 + 保存重连

- **选择**：app ready 后并行 `connect` 所有 `enabled !== false` 的 server；超时（建议 15s）记 `error`。设置保存后 diff：停掉删除/禁用的，重连变更/新增的。每个 session 的 `buildTools` 读当前已连接的 tool 快照。
- **理由**：进会话即可搜；不必整应用重启。
- **已考虑 alternative**：首条消息懒加载（首包延迟）；纯手动连接（易忘）。

### D5：Electron PATH

- **选择**：spawn 时合并常见 Unix 路径（`/usr/local/bin`、`/opt/homebrew/bin`、`$HOME/.local/bin`）到 `PATH`；仍失败则状态栏写明 `ENOENT` 并建议 `command` 填 `uvx` 绝对路径。
- **理由**：MiniMax 文档已提示 `spawn uvx ENOENT`。
- **已考虑 alternative**：设置里强制绝对路径 → 跨机器不友好。

### D6：权限

- **选择**：MCP 工具默认可跑（用户已启用该 server）。不把 MCP 一律当高危；shell/删文件仍走既有 builtin 闸门。
- **理由**：搜索类只读；额外 confirm 会打断 MiniMax `web_search`。
- **已考虑 alternative**：每个 MCP call 弹窗 → 体验差。

## Risks / Trade-offs

- [Risk] `uvx` 不在 Electron PATH → Mitigation: D5 补 PATH + 设置显示错误
- [Risk] MCP 子进程泄漏 → Mitigation: app quit / 禁用时 `client.close()`
- [Risk] 无 MCP 时事实类 prompt 仍要求 `web_search` → Mitigation: prompt 改为「若工具列表含 web_search 则必须用」；无则允许 web_fetch 或说明无法检索
- [Risk] env 含 API Key 明文落盘 → Mitigation: 与 Cursor 相同；设置页 env 值默认掩码
- [Trade-off] 不做 HTTP MCP → 接受；用户场景是 stdio
- [Trade-off] 不做 Resources/Prompts → 接受；首版只要 tools

## Migration Plan

1. 加 sdk 与 `mcp.json` 读写（空对象合法）
2. 管理器：connect / listTools / callTool / status
3. `buildTools` 合并；删除内置 `web_search`
4. 设置 MCP tab + IPC
5. 启动钩子；保存重连
6. Rollback：删 `mcp.json`、还原 `registerTool('web_search')` 即可（本 change 无 DB 迁移）

验收：写入 MiniMax 段落后重启（或保存重连），时间轴出现 `web_search` 且 results 非空。

## Open Questions

- Windows 上 `uvx` 路径探测是否与 macOS 同等（首版可只补 PATH，失败靠绝对路径）
- 子 agent 是否继承 MCP 工具（倾向：与主 agent 同一快照，allowlist 仍过滤）
