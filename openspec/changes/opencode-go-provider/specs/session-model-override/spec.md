## ADDED Requirements

### Requirement: 会话 model 持久化
系统 MUST 在会话记录上支持可空的 `model` 字段并持久化到 SQLite `sessions` 表。`SessionSummary` / `SessionDetail` MUST 暴露该字段。新会话的 `model` MUST 为 null 或空，表示尚未覆盖。

#### Scenario: 新会话无覆盖
- **WHEN** 用户创建新会话且未选择模型
- **THEN** 该会话 `model` MUST 为空/null

#### Scenario: 选择后落盘
- **WHEN** 用户为某会话选择模型 id `X` 并成功保存
- **THEN** 再次读取该会话 MUST 得到 `model === X`

---

### Requirement: 生效 model 解析
对关联到某会话的 LLM 调用，系统 MUST 使用 `session.model`（若非空）作为 model，否则 MUST 使用 `settings.model`。无会话上下文的调用 MUST 使用 `settings.model`。解析 MUST 与 `provider` 解析出的 `baseURL` / `apiKey` 一并用于客户端。

#### Scenario: 会话覆盖优先
- **WHEN** 会话 A 的 `model` 为 `glm-5.2`，全局 `settings.model` 为 `MiniMax-M3`
- **THEN** 会话 A 的 LLM 请求 model MUST 为 `glm-5.2`

#### Scenario: 回退全局默认
- **WHEN** 会话 B 的 `model` 为空，全局 `settings.model` 为 `MiniMax-M3`
- **THEN** 会话 B 的 LLM 请求 model MUST 为 `MiniMax-M3`

#### Scenario: 两会话互不影响
- **WHEN** 会话 A 覆盖为 `X`，会话 B 覆盖为 `Y`，分别发起需要 LLM 的回合
- **THEN** A 的请求 MUST 使用 `X`，B 的请求 MUST 使用 `Y`

---

### Requirement: Composer 模型选择器（仅 Go）
当 `provider` 为 `opencode-go` 时，聊天输入区（composer-bar）原模型展示控件 MUST 变为可选择的模型控件，选项来自模型列表能力（远程或回退白名单）。用户选择 MUST 写入**当前会话**的 `model`，MUST NOT 修改 `settings.model`。当 `provider` 为 `custom` 时，该控件 MUST 保持只读展示生效 model（通常为 `settings.model`），MUST NOT 提供远程 Go 下拉。

#### Scenario: Go 可选
- **WHEN** `provider` 为 `opencode-go` 且存在当前会话
- **THEN** 用户 MUST 能从输入旁控件选择模型并看到当前生效 model

#### Scenario: 选择只影响会话
- **WHEN** 用户在会话 A 将选择器改为 `kimi-k2.6`
- **THEN** 会话 A 的 `model` MUST 为 `kimi-k2.6`，且 `settings.model` MUST 保持不变

#### Scenario: Custom 只读
- **WHEN** `provider` 为 `custom`
- **THEN** 输入旁模型控件 MUST 只读，MUST NOT 打开 Go 模型下拉

---

### Requirement: 未知或过期会话 model 可继续展示
若会话已保存的 `model` 不在当前可选列表中，UI MUST 仍展示该 id，系统 MUST 允许继续使用该 id 发起请求（除非底层 API 拒绝），MUST NOT 静默清空会话 `model`。

#### Scenario: 不在列表仍显示
- **WHEN** 会话 `model` 为 `legacy-id` 且当前列表不含该项
- **THEN** 选择器/展示 MUST 仍显示 `legacy-id`，MUST NOT 自动改为 null
