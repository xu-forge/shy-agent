## ADDED Requirements

### Requirement: turn-runner hooks
系统 MUST 在 turn 循环提供六类 hook 扩展点：beforeLlmCall、afterLlmCall、beforeToolCall、afterToolCall、onHistoryChanged、onStepEnd；hook MUST 按声明顺序执行。

#### Scenario: 触发顺序
- **WHEN** 一个含工具调用的步骤执行
- **THEN** hook 触发顺序 MUST 为 beforeLlmCall → afterLlmCall → beforeToolCall → afterToolCall → onHistoryChanged → onStepEnd

#### Scenario: beforeLlmCall 决策
- **WHEN** beforeLlmCall 返回 `{ type: 'replaceMessages', messages }`
- **THEN** 本次 LLM 调用 MUST 使用替换后的消息

#### Scenario: beforeToolCall 跳过
- **WHEN** beforeToolCall 返回 `{ type: 'skip', reason }`
- **THEN** 该工具调用 MUST 不执行，结果记录跳过原因

### Requirement: dispatch_subagent 工具
LLM MUST 可通过 `dispatch_subagent({ type, task, maxSteps?, maxTokens? })` 派发子代理，type ∈ explore/worker/verifier；并发 MUST ≤3；返回结果 MUST 截断至安全长度。

#### Scenario: 派发探索任务
- **WHEN** LLM 调用 dispatch_subagent type=explore
- **THEN** 子代理运行并返回探索结论，工具结果含其摘要
