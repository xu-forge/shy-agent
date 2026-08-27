## ADDED Requirements

### Requirement: MCP 配置文件为唯一源
系统 MUST 将 MCP server 配置持久化到 `~/.shy/config/mcp.json`（`SHY_HOME` 覆盖数据根时 MUST 使用该根下的 `config/mcp.json`）。文件 MUST 使用 `{ "mcpServers": { "<id>": { "command": string, "args"?: string[], "env"?: object, "enabled"?: boolean } } }`；`enabled` 缺省 MUST 视为 true。文件缺失或 `mcpServers` 为空对象 MUST 视为合法（零 server）。

#### Scenario: 读取缺省文件
- **WHEN** 配置文件不存在
- **THEN** 系统 MUST 按零 server 运行，MUST NOT 抛未捕获异常

#### Scenario: 保存后落盘
- **WHEN** 用户在设置页保存一条 stdio server（含 command / args / env / enabled）
- **THEN** `mcp.json` MUST 含该 id 及字段，再次启动 MUST 读到同一内容

---

### Requirement: 仅 stdio 传输
系统 MUST 仅连接 `command` 非空的 stdio MCP server。配置中若出现 `url` / `type: sse` 等远程字段，系统 MUST 忽略该 server 或标记为不支持，MUST NOT 尝试 HTTP/SSE 连接。

#### Scenario: MiniMax 风格配置可连接
- **WHEN** server 为 `{ "command": "uvx", "args": ["minimax-coding-plan-mcp", "-y"], "env": { "MINIMAX_API_KEY": "…", "MINIMAX_API_HOST": "https://api.minimaxi.com" }, "enabled": true }`
- **THEN** 系统 MUST 以 stdio spawn 该进程并完成 MCP initialize / list tools（在 `uvx` 可用且凭证有效的前提下）

#### Scenario: 无 command 不连接
- **WHEN** 某 server 条目缺少 `command`
- **THEN** 该 server MUST 保持未连接，状态 MUST 标明配置无效

---

### Requirement: 启动时连接已启用 server
应用主进程就绪后，系统 MUST 并行连接所有 `enabled !== false` 的 stdio server。单个连接失败 MUST 只影响该 server 的状态，MUST NOT 阻止应用启动或其它 server 连接。单次连接 MUST 有超时（建议不超过 20s）。

#### Scenario: 一个失败其余仍连
- **WHEN** 两个 enabled server，其中一个 spawn 失败（如 `ENOENT`）
- **THEN** 失败者 MUST 记录错误状态；成功者 MUST 仍可列出 tools

#### Scenario: 禁用者不连接
- **WHEN** server `enabled` 为 false
- **THEN** 启动 MUST NOT spawn 该进程

---

### Requirement: 保存后重连变更
用户保存 `mcp.json` 后，系统 MUST 对删除或禁用的 server 关闭连接，MUST 对新增或 command/args/env 变更的 enabled server 重新连接，MUST NOT 要求用户整应用重启。

#### Scenario: 改 env 后重连
- **WHEN** 用户修改某 enabled server 的 `env` 并保存
- **THEN** 系统 MUST 关闭旧进程并以新 env 再连

---

### Requirement: MCP 工具注入 Agent
已连接 server 的 MCP tools MUST 转为 `ShyTool` 并并入 interactive 与 goal 模式 act 阶段的工具表（与 `buildTools` 结果合并）。工具名 MUST 使用 MCP 导出名；若与已注入工具同名，后连接者 MUST 使用前缀名 `mcp_<serverId>_<toolName>`。调用 MUST 转发至对应 MCP `callTool`，结果 MUST 经既有 `tool_call` / `tool_result` 事件到达时间轴。

#### Scenario: MiniMax web_search 可用
- **WHEN** MiniMax MCP 已连接且导出 `web_search`
- **THEN** 主 agent 工具表 MUST 含名为 `web_search` 的工具，LLM 调用后 MUST 得到该 MCP 的返回文本/JSON

#### Scenario: 同名加前缀
- **WHEN** 两个已连接 server 均导出 `foo`
- **THEN** 先连接者 MUST 占用 `foo`，后者 MUST 注册为 `mcp_<后者id>_foo`

#### Scenario: 未连接则无 MCP 工具
- **WHEN** 无已连接 MCP server
- **THEN** 工具表 MUST NOT 含仅来自 MCP 的条目

---

### Requirement: 删除内置 web_search 并保留 web_fetch
系统 MUST NOT 再注册本机 Bing/DDG 实现的 `web_search`。系统 MUST 继续注册 `web_fetch`。事实类 prompt MUST 将 `web_search` 表述为「若工具列表中存在则必须使用」，MUST NOT 在无该工具时要求模型调用不存在的函数。

#### Scenario: 无 MCP 时无内置搜索
- **WHEN** 未配置或未连上任何提供 `web_search` 的 MCP
- **THEN** `registeredToolNames` / `buildTools` MUST NOT 含内置 `web_search`，MUST 仍含 `web_fetch`

#### Scenario: 有 MCP 时搜索来自 MCP
- **WHEN** MCP 导出 `web_search` 且 LLM 调用之
- **THEN** 执行路径 MUST 为 MCP `callTool`，MUST NOT 走 `runWebSearch` HTML 解析

---

### Requirement: 设置页 MCP 编辑与状态
设置弹窗 MUST 提供 MCP 管理界面：列出 server、编辑 command/args/env/enabled、保存到 `mcp.json`。每条 MUST 显示连接状态（已连接 / 已禁用 / 失败及错误摘要）。env 值在 UI 中 MUST 默认可掩码。`uvx`/`command` 因 PATH 找不到而失败时，错误摘要 MUST 提示改用绝对路径。

#### Scenario: 状态可见
- **WHEN** 用户打开设置 MCP tab 且某 server spawn 失败
- **THEN** 该行 MUST 显示非「已连接」状态及错误摘要（含 ENOENT 或等价信息）

#### Scenario: 开关禁用
- **WHEN** 用户将某已连接 server 设为 disabled 并保存
- **THEN** 该进程 MUST 被关闭，工具表 MUST 不再含其 tools
