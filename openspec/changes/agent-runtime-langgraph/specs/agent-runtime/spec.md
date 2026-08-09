## ADDED Requirements

### Requirement: 双模式 Agent 执行
系统 MUST 支持 interactive 与 goal 两种模式；goal 模式 MUST 在未完成且未达步数上限时自动续跑。

#### Scenario: 交互式发送
- **WHEN** 用户以 interactive 模式发送消息且模型配置有效
- **THEN** 系统 MUST 调用模型并返回助手回复事件

#### Scenario: 目标模式续跑
- **WHEN** 用户以 goal 模式发送目标
- **THEN** 系统 MUST 自动多步推进直至完成、错误、需确认或达到 maxSteps

### Requirement: 可取消
系统 MUST 允许取消进行中的 agent 运行。

#### Scenario: 取消运行
- **WHEN** 用户请求取消
- **THEN** 系统 MUST 停止后续步骤并发出取消事件
