## ADDED Requirements

### Requirement: 侧栏独立「日历」导航
系统 MUST 在主界面侧栏提供独立导航项「日历」（视图键建议 `calendar`），与对话、工作流、技能等并列；选中后 MUST 展示日历主视图而非嵌在工作流设置页内。

#### Scenario: 进入日历
- **WHEN** 用户点击侧栏「日历」
- **THEN** 主内容区 MUST 切换为月历视图（含当月任务实例）

### Requirement: 月视图展示任务实例
日历主视图 MUST 以月网格展示当前月份；各日格 MUST 显示该日展开后的任务实例摘要（标题或等价短文案）。用户 MUST 能切换上一月/下一月并重新加载展开数据。

#### Scenario: 有任务的日期可见
- **WHEN** 某日存在至少一条展开实例
- **THEN** 该日格 MUST 显示可点击的任务芯片或列表项

### Requirement: 点空新建与点任务编辑
用户 MUST 能点击空白日期（或日格空白区域）打开新建任务表单（默认调度对齐该日/合理默认 time）；MUST 能点击已有任务打开编辑（改标题、调度、动作、启用、删除）。表单 MUST 支持三种动作类型及对应载荷字段（工作流选择、提醒文案、技能选择）。

#### Scenario: 点空新建
- **WHEN** 用户点击某日空白区域并提交合法表单
- **THEN** 系统 MUST 创建任务并刷新月历展示

#### Scenario: 编辑删除
- **WHEN** 用户打开某任务并删除或保存修改
- **THEN** 系统 MUST 调用对应 IPC，月历 MUST 反映最新状态

### Requirement: 拖改时间并持久化
任务芯片 MUST 可拖拽到其他日期格（及若实现则时间槽）；松手后系统 MUST 更新该任务系列的调度字段（至少 `time`；weekly/monthly 时同步 weekdays/dayOfMonth 以匹配落点），并持久化。UI MUST 简短说明拖拽会改该系列调度而非「仅此一次」例外。

#### Scenario: 拖到另一天
- **WHEN** 用户将任务从日期 A 拖到日期 B 并成功
- **THEN** 任务调度 MUST 更新为匹配 B；刷新后实例出现在 B 对应规则下，且 A 日不再按旧规则错误展示（在规则允许的范围内）

### Requirement: 冲突警告展示
当 IPC 返回双跑相关 `warnings` 时，日历 UI MUST 以非阻断方式展示提示（黄条或等价），不得静默忽略。

#### Scenario: 保存后见警告
- **WHEN** 保存 `run_workflow` 任务且后端返回双跑 warning
- **THEN** 用户 MUST 能在日历界面看到提示文案
