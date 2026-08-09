## ADDED Requirements

### Requirement: OpenAI-compatible 设置
系统 MUST 允许用户配置 baseURL、apiKey、model，并持久化到本地 userData。

#### Scenario: 保存并读取设置
- **WHEN** 用户保存模型设置
- **THEN** 系统 MUST 将配置写入本地，并在下次读取时返回相同值（apiKey 可原样返回给本机 UI）
