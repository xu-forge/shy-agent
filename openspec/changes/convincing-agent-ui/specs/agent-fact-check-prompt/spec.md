## ADDED Requirements

### Requirement: 事实类问题工具门禁
`REACT_GUIDE_BLOCK`（及 goal 模式等价 context）MUST 规定：涉及时效信息、地点推荐、价格、政策、可核实事实列表等问题时，Agent MUST 先调用 `web_search`、`web_fetch` 或等价 web 工具获取观测，MUST NOT 无工具直接生成答案。

#### Scenario: 地点推荐问题
- **WHEN** 用户问「广州周末去哪玩」类需外部信息的问题
- **THEN** system prompt MUST 要求先 web 检索或抓取，且 MUST NOT 允许「简单 Q&A 可直接答」覆盖该场景

#### Scenario: 纯概念解释
- **WHEN** 用户问无需外部数据的定义题（如「什么是递归」）
- **THEN** prompt MAY 允许直接回答且不强制工具

### Requirement: final_answer 自洽
Agent 最终面向用户的 visible 回复 MUST 直接回答 user_query，且 MUST 携带或总结关键工具观测（搜索摘要、指南要点、widget 结论），MUST NOT 与中间工具结果矛盾或忽略已呈现产物。

#### Scenario: 搜索后总结
- **WHEN** turn 内曾成功 `web_search`、`web_fetch` 或 `browser_fetch`
- **THEN** final assistant 消息 MUST 引用或整合观测要点，且 MUST NOT 仅重复未证实的模型臆测

### Requirement: Visualizer 主动触发规则
Prompt MUST 包含 visualizer 触发指引（对齐 WorkBuddy `<instructions_for_visualizer>` 要点）：教学/解释/对比/架构类请求 SHOULD 先 `read_me` 再 `show_widget`；复杂主题 MUST 多 widget 穿插 prose，MUST NOT 连续堆叠 widget。

#### Scenario: 教学类请求
- **WHEN** 用户问「讲解 TCP/IP」类教学请求
- **THEN** prompt MUST 鼓励使用 `read_me` + `show_widget`，且 MUST NOT 仅输出长文

### Requirement: 产物呈现强制规则
当任务产生可查看 deliverable（HTML、报告、pptx、代码产物等）时，Agent MUST 在 turn 末调用 `present_artifact`（对齐 WorkBuddy present_files CRITICAL 规则）。

#### Scenario: HTML 报告完成
- **WHEN** Agent 刚写入 HTML 报告到 artifacts
- **THEN** MUST 调用 `present_artifact` 呈现，且 MUST NOT 仅口头描述文件路径

#### Scenario: 有 widget 中间产物
- **WHEN** turn 内曾调用 `show_widget` 或 `present_artifact`
- **THEN** final 回复 MUST 与 widget/产物内容一致，且 SHOULD 引导用户查看已呈现卡

### Requirement: 反模式与工具列表一致
Prompt 中列出的工具名与描述 MUST 与 `registerTool` 实际注册一致；MUST 保留「不要文字描述打算做什么 — 直接调工具」类反模式指引。

#### Scenario: 工具名对齐
- **WHEN** 审计 `react-prompt.ts` 与 tools 目录
- **THEN** prompt 中每条工具 MUST 对应已注册工具，且无 ghost 工具名

#### Scenario: 反模式保留
- **WHEN** 更新 fact-check gate
- **THEN** prompt MUST 仍含禁止「我先打开…」式空述、须直接 function call 的条款
