## ADDED Requirements

### Requirement: 左栏结构
左栏 MUST 依次包含：shy 标题、「+ 新建任务」（新建会话）、定时任务入口、技能入口、会话历史列表（无分组/项目概念）、「任务」区、底部 shy 账户卡；宽度约 220px；无搜索与插件市场入口。

#### Scenario: 新建任务
- **WHEN** 用户点击「+ 新建任务」
- **THEN** 系统 MUST 新建交互式会话并进入对话视图

#### Scenario: 会话条目
- **WHEN** 存在会话
- **THEN** 列表 MUST 以「标题 + 相对时间」条目展示（不显示模式徽标），支持选中与删除，删除图标 MUST 仅在悬停时出现

### Requirement: 主区空态
空会话主区 MUST 显示：时段问候语、卡片式 composer（输入框 + 底部操作行）、3 条列表式示例；不显示项目/环境选择器、质量选择、闲时任务与功能推广卡片。

#### Scenario: 时段问候
- **WHEN** 用户在晚间打开空会话
- **THEN** 问候语 MUST 按当前时段显示对应文案

#### Scenario: 完全授权开关
- **WHEN** 用户点按「完全访问」按钮
- **THEN** 系统 MUST 切换 `autoApproveTools` 并持久化，按钮呈选中态

#### Scenario: 发送
- **WHEN** 用户在 composer 输入并点发送
- **THEN** 系统 MUST 发送消息进入线程视图

### Requirement: 示例列表
示例 MUST 以 3 条独立行呈现（非胶囊），点击后填入输入框。

#### Scenario: 点击示例
- **WHEN** 用户点击某条示例
- **THEN** 输入框 MUST 填入该示例文本并聚焦
