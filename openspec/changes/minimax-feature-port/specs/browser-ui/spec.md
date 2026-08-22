## ADDED Requirements

### Requirement: 浏览器面板
对话视图 MUST 提供「浏览器」开关；开启时主窗口内 MUST 显示内嵌浏览器区域（面板含 URL/标题状态条与后退/刷新/关闭控制），关闭时区域移出且状态保留。

#### Scenario: 开关面板
- **WHEN** 用户点击「浏览器」开关
- **THEN** 浏览器区域按面板 bounds 显示/隐藏，窗口缩放时区域跟随重排

### Requirement: 截图预览
浏览器工具产生截图时，面板 MUST 显示截图缩略图（来自 artifacts 路径）。

#### Scenario: 截图缩略图
- **WHEN** browser 工具产生新截图事件
- **THEN** 面板缩略图列表追加该截图

### Requirement: 工具卡片增强
`browser` 工具卡片 MUST 显示 action 摘要并在结果含截图路径时展示缩略图；`dispatch_subagent` 卡片 MUST 显示子代理类型徽标与结果摘要。

#### Scenario: browser 卡片
- **WHEN** 会话产生 browser 工具事件
- **THEN** 卡片显示 action 与目标（ref/url），截图可见缩略图

### Requirement: 技能视图适配
技能视图与 `/` 菜单 MUST 使用新 registry 数据（来源徽章、启用状态），并在收到 `skills_changed` 后自动刷新。

#### Scenario: 自动刷新
- **WHEN** 渲染层收到 skills_changed 事件
- **THEN** 技能视图与 `/` 菜单数据无手动操作即更新
