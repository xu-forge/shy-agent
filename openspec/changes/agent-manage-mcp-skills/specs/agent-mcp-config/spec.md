## ADDED Requirements

### Requirement: Agent MCP 列表与状态
系统 MUST 向 Agent 提供工具以列出当前 MCP 配置项及其连接状态（至少包含 id、enabled、state；错误时含 error 摘要）。HTTP 条目 MUST 能区分「需 OAuth 授权」类错误文案（可含提示调用授权）。

#### Scenario: 列出已配置服务器
- **WHEN** Agent 调用 `mcp_list`
- **THEN** 返回当前 `mcpServers` 中各条目及对应 runtime status，且不修改配置

### Requirement: Agent 增改 MCP 并应用（stdio 与 HTTP）
系统 MUST 提供 `mcp_upsert`：按 server id 新增或覆盖一条配置，写入 `~/.shy/config/mcp.json` 后 MUST 调用既有 apply/重连路径。

条目形状：
- **stdio**：`command`（必填）、`args`、`env`、`enabled`；MUST NOT 同时带非空 `url`
- **http（Streamable HTTP）**：`url`（必填）、可选 `headers`、`enabled`；MUST NOT 同时带非空 `command`

同时提供非空 `command` 与 `url` 时，系统 MUST 拒绝或标为 invalid，且 MUST NOT 半更新连接。

#### Scenario: 用 JSON 新增 stdio 并重连
- **WHEN** Agent 以合法 stdio 字段调用 `mcp_upsert` 新增 id
- **THEN** 配置落盘，apply 执行，返回的 status 对应该 id 的最新连接结果

#### Scenario: 用 JSON 新增 HTTP 并重连
- **WHEN** Agent 以合法 `url`（及可选 `headers`）调用 `mcp_upsert` 新增 id
- **THEN** 配置落盘，apply 尝试 Streamable HTTP 连接，返回最新 status（含 connected / error / disabled）

#### Scenario: 覆盖已有服务器
- **WHEN** Agent 对已存在 id 再次 `mcp_upsert`
- **THEN** 该 id 配置被新值替换并重新 apply，不得留下半更新的内存状态

#### Scenario: command 与 url 同时出现
- **WHEN** upsert 或保存的条目同时含非空 `command` 与非空 `url`
- **THEN** 该条目视为无效（invalid 或工具返回错误），不得当作已连接

### Requirement: Agent 删除 MCP 需确认
系统 MUST 提供 `mcp_remove`；执行删除前 MUST 经高危确认闸门；用户拒绝或超时则 MUST NOT 修改配置。删除成功后 SHOULD 清理该 id 对应 OAuth 持久化数据。

#### Scenario: 确认后删除
- **WHEN** Agent 调用 `mcp_remove` 且用户确认
- **THEN** 该 id 从配置移除并 apply，列表中不再出现该 id

#### Scenario: 拒绝则保持原样
- **WHEN** Agent 调用 `mcp_remove` 且用户拒绝或确认超时
- **THEN** mcp.json 与连接状态保持不变

### Requirement: Agent 启停 MCP
系统 MUST 提供 `mcp_set_enabled`；将服务器设为禁用时 MUST 经确认闸门；启用 MUST NOT 要求确认；变更后 MUST apply。

#### Scenario: 禁用需确认
- **WHEN** Agent 请求禁用某 MCP 且用户确认
- **THEN** 该条目 `enabled=false`，apply 后该服务器工具不可用

#### Scenario: 启用免确认
- **WHEN** Agent 请求启用某 MCP
- **THEN** 无需确认闸门即可 `enabled=true` 并 apply

### Requirement: Streamable HTTP 连接
系统 MUST 使用 MCP SDK 的 Streamable HTTP 客户端传输连接带 `url` 的条目；可选 `headers` MUST 随请求发送。系统 MUST NOT 在本能力中实现旧版 SSE 传输。

#### Scenario: 带 headers 的 HTTP 服务器连接成功
- **WHEN** 配置合法 `url` 与 `headers` 且服务端接受
- **THEN** status 为 connected，工具可被注入 Agent

### Requirement: OAuth（loopback）与显式授权
系统 MUST 将 OAuth tokens（及必要的 client 注册信息）持久化到 `~/.shy/config/mcp-oauth.json`（或等价路径），MUST NOT 写入 `mcpServers` 正文。

`applyConfig` / 普通重连 MUST 仅使用已存凭证静默尝试；若需用户授权，MUST 将 status 标为 error（或等价）并提示需授权，MUST NOT 在静默路径自动打开浏览器。

系统 MUST 提供显式授权入口：Settings「登录/重新授权」与 Agent 工具 `mcp_authorize`。授权流程 MUST：
1. 在本机 loopback（`127.0.0.1` 或 `localhost`）监听 ephemeral 端口回调
2. 通过系统浏览器打开授权 URL
3. 收到 code 后 `finishAuth` 并重连

#### Scenario: 静默连接缺 token
- **WHEN** HTTP 服务器需要 OAuth 且本地无有效 token
- **THEN** apply 后该 id 为 error，文案提示需要授权；浏览器未被自动打开

#### Scenario: 显式授权成功
- **WHEN** 用户在 Settings 点登录或 Agent 调用 `mcp_authorize`，并在浏览器完成授权
- **THEN** token 落盘，该服务器重连为 connected（服务端正常时）

#### Scenario: 授权超时或失败
- **WHEN** 用户取消、回调错误或超时
- **THEN** 配置文件不被错误覆盖；status 保持/变为 error，可再次尝试授权
