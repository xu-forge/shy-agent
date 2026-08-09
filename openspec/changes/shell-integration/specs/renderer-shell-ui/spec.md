## ADDED Requirements

### Requirement: 聊天工作区可发送
系统 MUST 提供 ChatWorkspace：用户 MUST 可通过 agentChat 发送消息（interactive/goal）；MUST 支持 cancel；MUST 订阅 events 展示 assistant、tool、status、error、done 与 notify 消息。

#### Scenario: 发送并流式展示
- **WHEN** 用户输入消息并发送
- **THEN** 系统 MUST 调用 agentChat 并将 assistant 增量内容更新到消息列表

#### Scenario: 取消运行
- **WHEN** 用户点击取消
- **THEN** 系统 MUST 调用 agentCancel 并将 busy 状态结束

### Requirement: 模型设置入口
系统 MUST 在聊天顶栏提供设置按钮，打开 SettingsPanel 读写 baseURL、apiKey、model（apiKey 输入为 password 类型）。

#### Scenario: 保存设置
- **WHEN** 用户在 SettingsPanel 保存
- **THEN** 系统 MUST 调用 settingsSet 并提示已保存到本地

### Requirement: 记忆与技能真实 pane
Sidebar 的「记忆」「技能」入口 MUST 分别渲染 MemoryView 与 SkillsView，MUST NOT 再显示「后续版本」占位。

#### Scenario: 切换至记忆
- **WHEN** 用户点击侧栏记忆
- **THEN** 系统 MUST 显示 MemoryView 并可 CRUD 长期记忆

#### Scenario: Agent 记忆通知
- **WHEN** 收到 memory 或 notify 事件
- **THEN** App MUST 在聊天区展示 banner 或系统消息提示用户查看记忆 pane

### Requirement: 模式切换生效
「交互式」与「目标」模式切换 MUST 将所选 mode 传入 agentChat，MUST 驱动 Agent 不同 systemPrompt 与步数上限。

#### Scenario: 目标模式发送
- **WHEN** 用户选择目标模式并发送
- **THEN** agentChat 请求的 mode MUST 为 `goal`
