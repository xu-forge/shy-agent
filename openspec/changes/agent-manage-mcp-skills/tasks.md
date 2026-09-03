## 1. MCP Agent 工具

- [x] 1.1 实现 `mcp_list` / `mcp_upsert` / `mcp_remove` / `mcp_set_enabled`，复用 config store + `McpManager.applyConfig`
- [x] 1.2 `mcp_remove` 与禁用路径接入 `confirmHighRisk`；启用与 upsert 免确认
- [x] 1.3 将工具注册进 builtin registry（含描述与参数 schema）
- [x] 1.4 为 mcp 工具编写单元测试（upsert 落盘+apply mock、remove 拒绝不改文件）

## 2. Skill 启停工具

- [x] 2.1 实现 `skill_set_enabled`，调用既有 `setSkillEnabled` / store API
- [x] 2.2 禁用路径确认闸门；启用免确认
- [x] 2.3 注册工具并补充测试

## 3. 管理 Skill

- [x] 3.1 编写 `manage-integrations` SKILL.md：list → URL/JSON → ask_user → 正式工具；禁止无依据装包
- [x] 3.2 接入 builtin seed / 安装路径，确保新环境可见
- [ ] 3.3 冒烟：对话「按此 JSON 加 MCP」能走到 upsert（可手工）
- [x] 3.4 更新 manage-integrations：覆盖 HTTP url/headers 与 `mcp_authorize`

## 4. Streamable HTTP + OAuth

- [x] 4.1 扩展 `McpServerEntry` 解析/写入：stdio vs url（互斥）；shared IPC 同步
- [x] 4.2 `createHttpSession`（StreamableHTTP + headers）；fingerprint / ensureServer 分支
- [x] 4.3 OAuth store（mcp-oauth.json）+ loopback provider；静默连接 vs `authorize(id)`
- [x] 4.4 IPC / preload / Settings：传输切换、headers、登录按钮
- [x] 4.5 Agent `mcp_upsert` 支持 HTTP；新增 `mcp_authorize`；remove 清理 oauth
- [x] 4.6 单元测试：parse 互斥、HTTP connector mock、oauth store、authorize 闸门语义

## 5. 验收收尾

- [x] 5.1 typecheck / 相关 vitest 通过
- [ ] 5.2 对照 specs 手动清单（stdio 回归、HTTP+headers、OAuth 登录、删除确认）
