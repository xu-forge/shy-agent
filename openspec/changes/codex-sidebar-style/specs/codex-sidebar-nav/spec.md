## ADDED Requirements

### Requirement: 无品牌标题的短导航
侧栏展开态 MUST NOT 展示应用名品牌标题（例如「shy」或带下拉 chevron 的产品名）。展开态 MUST 提供三行短导航，顺序为：「新对话」「已安排」「技能」，每行含细线图标与文案。激活「新对话」MUST 创建新会话；「已安排」MUST 切换到定时任务视图；「技能」MUST 切换到技能视图。

#### Scenario: 无 shy 标题
- **WHEN** 用户展开左侧导航栏
- **THEN** 侧栏可见区域 MUST NOT 出现独立的应用名「shy」品牌标题节点

#### Scenario: 新对话
- **WHEN** 用户点击短导航「新对话」
- **THEN** 系统 MUST 创建一条新会话并选中它

#### Scenario: 已安排与技能
- **WHEN** 用户依次点击「已安排」「技能」
- **THEN** 主区 MUST 分别进入定时任务视图与技能视图

---

### Requirement: 项目分区与文件夹行
侧栏 MUST 在短导航之下展示分区标题「项目」。每个具名项目（`group.id` 非 null）MUST 显示为带文件夹线图标的一行，行文案为项目名。点击该行 MUST 切换该项目下会话列表的展开/收起。未绑定分组（`group.id` 为 null）MUST 仍可折叠展示其会话，但 MUST NOT 使用文件夹图标。

#### Scenario: 文件夹图标仅具名项目
- **WHEN** 存在具名项目「my-agent」与未绑定会话分组
- **THEN** 「my-agent」行 MUST 显示文件夹图标；未绑定分组行 MUST NOT 显示文件夹图标

#### Scenario: 点击项目行折叠
- **WHEN** 用户点击已展开的具名项目行
- **THEN** 该项目下的会话列表 MUST 收起；其它项目展开状态 MUST NOT 被强制改变

#### Scenario: 子会话缩进
- **WHEN** 某具名项目处于展开且含至少一条会话
- **THEN** 这些会话行 MUST 相对项目行缩进显示

---

### Requirement: 项目行选中态与省略号菜单
具名项目行在鼠标悬停或被选为当前上下文时 MUST 显示右侧 `⋯` 按钮。点击 `⋯` MUST 打开菜单，菜单 MUST 包含「移除项目」并 MUST NOT 包含无实现的「置顶」「创建永久工作树」「归档聊天」「编辑」项。选择「移除项目」MUST 触发与现网一致的删除项目确认流（只解绑不删磁盘）。菜单打开时点击菜单外 MUST 关闭菜单。

#### Scenario: 悬停显示省略号
- **WHEN** 用户将指针移到具名项目行上
- **THEN** 该行 MUST 显示 `⋯` 控件

#### Scenario: 移除项目
- **WHEN** 用户打开某项目的 `⋯` 菜单并选择「移除项目」
- **THEN** 系统 MUST 走现有删除项目确认，确认后 MUST 删除项目记录并将该项目下会话解绑

#### Scenario: 菜单无空壳项
- **WHEN** 用户打开项目 `⋯` 菜单
- **THEN** 菜单 MUST NOT 列出置顶、永久工作树、归档或编辑（重命名）项

---

### Requirement: 最近会话区
侧栏在「项目」区之下 MUST 展示分区标题「最近」，并 MUST 列出按 `updatedAt` 降序排列的最近会话（条数实现可配置，默认在 8–12 之间）。点击某条 MUST 选中对应会话。同一会话可同时出现在项目树与「最近」中。

#### Scenario: 按更新时间排序
- **WHEN** 存在更新时间不同的多条会话
- **THEN** 「最近」列表 MUST 将较新的会话排在较旧的前面

#### Scenario: 点击最近项
- **WHEN** 用户点击「最近」中的一条会话标题
- **THEN** 该会话 MUST 成为当前选中会话

---

### Requirement: 收起态不展示历史
侧栏整栏收起时 MUST NOT 展示项目树或「最近」列表（与既有 flyout 行为一致：仅在展开或 flyout 打开时展示完整 body）。

#### Scenario: 收起无列表
- **WHEN** 用户收起导航栏且未打开悬停 flyout
- **THEN** 界面 MUST NOT 展示项目会话列表或「最近」列表
