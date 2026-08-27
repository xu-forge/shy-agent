## 1. 配置模型与路径

- [x] 1.1 `paths.ts` 增加 `configMcp`（`~/.shy/config/mcp.json`）
- [x] 1.2 解析/校验 `mcpServers`（command/args/env/enabled）；缺文件视为空
- [x] 1.3 读写 store 单测（含非法条目、enabled 缺省 true）

## 2. stdio 客户端

- [x] 2.1 依赖 `@modelcontextprotocol/sdk`
- [x] 2.2 `McpManager`：stdio connect / close / listTools / callTool / 状态快照
- [x] 2.3 spawn 合并 PATH（homebrew / usr/local / ~/.local/bin）；ENOENT 写入错误摘要
- [x] 2.4 连接超时与单点失败隔离单测（mock transport）
- [x] 2.5 同名工具前缀 `mcp_<serverId>_<name>` 单测

## 3. 注入 Agent 并删除内置搜索

- [x] 3.1 MCP tools → `ShyTool`（JSON Schema → zod 或宽松 object）并入 `buildTools`
- [x] 3.2 `service.ts` / `goal-driver.ts` 使用合并后的工具表
- [x] 3.3 删除 `registerTool('web_search')` 与 `runWebSearch` 调用路径；保留 `web_fetch`
- [x] 3.4 `react-prompt.ts`：web_search 改为「工具表有则必须用」；更新 `react-prompt.test.ts`
- [x] 3.5 enrichment / allowlist 测试：无 MCP 时无 `web_search`，有 mock MCP 时有

## 4. 生命周期

- [x] 4.1 `app.whenReady` 后并行连接 enabled server；`before-quit` 关闭全部
- [x] 4.2 保存配置后 diff 重连（增删改 env/command）

## 5. IPC 与设置 UI

- [x] 5.1 IPC：读/写 mcp.json、列出连接状态
- [x] 5.2 preload 类型
- [x] 5.3 设置弹窗 MCP tab：列表、表单（command/args/env/enabled）、掩码 env、状态与错误
- [x] 5.4 样式与空状态

## 6. 验收

- [x] 6.1 `npm run typecheck && npm test` 通过
- [ ] 6.2 手测：配置 MiniMax MCP 后「广州周末去哪玩」时间轴 `web_search` 有命中；关掉 MCP 后无该工具且 `web_fetch` 仍在
