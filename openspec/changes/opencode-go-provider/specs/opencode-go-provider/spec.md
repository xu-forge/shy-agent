## ADDED Requirements

### Requirement: Provider 预设持久化
系统 MUST 在 `ModelSettings` 中持久化 `provider` 字段，取值 MUST 为 `custom` 或 `opencode-go`。缺失或未知值 MUST 视为 `custom`。`custom` 模式下系统 MUST 继续使用用户配置的 `baseURL` / `apiKey` / `model`。

#### Scenario: 旧配置缺省为 custom
- **WHEN** 已有 `settings.json` 不含 `provider`
- **THEN** 系统 MUST 按 `custom` 运行，MUST NOT 覆盖用户已有 `baseURL`

#### Scenario: 切换并保存 Go
- **WHEN** 用户在设置中选择 OpenCode Go 并保存有效 API Key
- **THEN** 持久化的 `provider` MUST 为 `opencode-go`，且再次启动 MUST 读到同一值

---

### Requirement: OpenCode Go 固定端点
当 `provider` 为 `opencode-go` 时，系统用于 LLM 请求的 `baseURL` MUST 为 `https://opencode.ai/zen/go/v1`（或与 OpenAI SDK 兼容的等价根路径）。系统 MUST NOT 依赖用户手填该 URL 才能发出 Go 请求。

#### Scenario: Go 请求打到官方网关
- **WHEN** `provider` 为 `opencode-go` 且用户发起需要 LLM 的会话回合
- **THEN** 发出的客户端 `baseURL` MUST 指向 OpenCode Go 网关 `https://opencode.ai/zen/go/v1`

#### Scenario: Custom 不受影响
- **WHEN** `provider` 为 `custom` 且 `baseURL` 为用户自定义值
- **THEN** LLM 请求 MUST 使用该自定义 `baseURL`，MUST NOT 强制改为 Go 网关

---

### Requirement: Go 设置页字段
设置「模型接入」在 `provider === opencode-go` 时 MUST 提供 API Key 配置；MUST 明确展示或隐含固定的 Go baseURL。此时 MUST NOT 要求用户手填 baseURL 才能使用 Go。`settings.model` MUST 仍可作为新会话默认模型保存。

#### Scenario: Go 模式隐藏手填 baseURL 依赖
- **WHEN** 用户选择 OpenCode Go
- **THEN** UI MUST 允许仅凭 API Key（及默认/所选 model）保存并启用 Go，MUST NOT 因 baseURL 空白而拒绝保存（若 UI 仍展示 baseURL，则 MUST 为只读或自动填入 Go 地址）

---

### Requirement: 模型列表拉取与回退
系统 MUST 提供主进程能力，在具备 API Key 时请求 `GET https://opencode.ai/zen/go/v1/models` 获取可用模型 id 列表。请求失败、超时或非成功响应时，系统 MUST 回退到内置的 chat.completions 兼容模型白名单，MUST NOT 因列表失败导致应用崩溃或空白不可用界面。

#### Scenario: 远程成功
- **WHEN** API Key 有效且 `/v1/models` 返回模型列表
- **THEN** 调用方 MUST 能获得非空的模型 id 列表（以响应为准）

#### Scenario: 远程失败回退
- **WHEN** `/v1/models` 失败（网络错误或非 2xx）
- **THEN** 系统 MUST 返回内置白名单，MUST NOT 抛未捕获异常到渲染进程

---

### Requirement: 仅暴露 chat.completions 可用模型
本 capability 向 UI 提供的可选模型 MUST 限于可通过现有 OpenAI-compatible `chat.completions` 客户端调用的模型。系统 MUST NOT 将仅支持 Anthropic Messages 或 OpenAI Responses 且本客户端无法调用的模型作为默认可选项（过滤或标注不可选，实现二选一，默认过滤）。

#### Scenario: 列表不含不可用协议模型为默认可选
- **WHEN** 远程或白名单中存在仅 Messages/Responses 的模型
- **THEN** 默认可选列表 MUST NOT 包含这些模型，或 MUST 明确标记为不可选且选择后 MUST NOT 用 chat.completions 静默失败而无提示
