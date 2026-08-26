## ADDED Requirements

### Requirement: 推理流式事件
Agent 运行时 MUST 在 LLM 流式输出中识别推理内容（`<think>`、`<thinking>` 或等价 reasoning 字段），并通过 IPC emit 独立的 `reasoning_delta` 与 `reasoning_done` 事件；推理内容 MUST NOT 仅依赖 renderer 对最终 assistant 字符串的事后解析。

#### Scenario: 流式 emit reasoning_delta
- **WHEN** turn-runner 从 stream chunk 中解析出推理文本增量
- **THEN** main MUST emit `{ type: 'reasoning_delta'; content: string; sessionId?: string }`

#### Scenario: 推理段结束
- **WHEN** 当前推理块闭合或 turn 内推理阶段结束
- **THEN** main MUST emit `{ type: 'reasoning_done'; sessionId?: string }`

#### Scenario: 向后兼容
- **WHEN** renderer 未订阅 `reasoning_delta`
- **THEN** assistant 最终 content MAY 仍含 thinking 标签，且 MUST 不导致崩溃

### Requirement: 思考区默认可读展示
Renderer MUST 在 assistant 消息时间轴中展示思考区：默认展开首段摘要或全文（可折叠）；MUST 显示思考耗时（从首 chunk 至 `reasoning_done` 或等价计时）。

#### Scenario: 默认展开思考摘要
- **WHEN** 用户打开含 reasoning 事件的 assistant turn
- **THEN** 思考区 MUST 默认可见（非仅「思考 N 次」深折叠标题）

#### Scenario: 显示思考耗时
- **WHEN** 该 turn 存在 `reasoning_done`
- **THEN** UI MUST 展示耗时（秒，至少整数秒）

### Requirement: 避免重复展示推理
当时间轴已通过 `reasoning_delta` 展示推理内容时，`ReActContent` MUST NOT 再次渲染相同 thinking 标签块。

#### Scenario: timeline 已含 reasoning
- **WHEN** 消息片段列表含 `kind: 'reasoning'` 且内容非空
- **THEN** `ReActContent` 对该 turn MUST 跳过 `<think>` / `<thinking>` 折叠块
