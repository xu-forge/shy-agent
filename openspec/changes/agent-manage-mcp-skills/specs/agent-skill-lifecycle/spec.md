## ADDED Requirements

### Requirement: Agent 启停 Skill
系统 MUST 向 Agent 提供 `skill_set_enabled` 工具，以按 skill 名称（与现有 enabled 列表语义一致）启用或禁用 skill。

#### Scenario: 启用 skill
- **WHEN** Agent 调用 `skill_set_enabled` 且目标为启用
- **THEN** 该 skill 从禁用列表移除（或等价启用），后续 skill 注入反映启用状态，且 MUST NOT 要求确认闸门

#### Scenario: 禁用 skill 需确认
- **WHEN** Agent 调用 `skill_set_enabled` 且目标为禁用
- **THEN** MUST 经高危确认闸门；确认后写入禁用状态；拒绝或超时则保持原样

### Requirement: 与既有 skill 写删工具共存
`skill_set_enabled` MUST NOT 取代既有 `skill_write` / `skill_list` / `skill_delete`；删除仍 MUST 经确认，写入用户 skills 根目录的行为保持不变。

#### Scenario: 删除仍走原工具
- **WHEN** Agent 需要删除用户 skill
- **THEN** 继续使用 `skill_delete`（确认闸门），而非 `skill_set_enabled`
