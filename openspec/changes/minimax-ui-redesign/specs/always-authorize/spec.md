## ADDED Requirements

### Requirement: 始终授权开关
系统 MUST 提供「始终授权」开关，用于控制工具确认是否自动放行；状态 MUST 本地持久化，重启应用后仍生效。

#### Scenario: 开启后放行
- **WHEN** 用户开启「始终授权」且随后有工具需要确认
- **THEN** 系统 MUST 不再弹确认框，直接放行该工具调用

#### Scenario: 关闭后逐条确认
- **WHEN** 用户关闭「始终授权」且随后有工具需要确认
- **THEN** 系统 MUST 弹出确认框，由用户逐条决定

#### Scenario: 持久化
- **WHEN** 用户切换开关并重启应用
- **THEN** 系统 MUST 保持上次的开关状态

### Requirement: 设置模型
系统 MUST 在模型设置中可持久化 `autoApproveTools` 字段，且旧数据兼容（缺省为关闭）。

#### Scenario: 缺省兼容
- **WHEN** 读取不含 `autoApproveTools` 的旧配置
- **THEN** 系统 MUST 视为关闭（`false`）
