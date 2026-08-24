## ADDED Requirements

### Requirement: 图一主题 token
渲染层 MUST 使用图一色板：浅色主色 `#4ADE80`、背景 `#F8FAFC`、正文 `#1E293B`、次要文字 `#64748B`、边框 `#CBD5E1`。控件圆角 MUST 为 8px，卡片/面板圆角 MUST 为 16px。深色模式 MUST 仍可通过现有主题开关切换，并使用同一色相的深色衍生值。

#### Scenario: 浅色主色
- **WHEN** 主题为 light
- **THEN** `--accent` MUST 为 `#4ADE80`，页面背景 MUST 为 `#F8FAFC`

#### Scenario: 深色仍可切换
- **WHEN** 用户在设置中切换到 dark
- **THEN** `data-theme` MUST 为 `dark`，主色 MUST 仍为绿色相而非 MiniMax 蓝

### Requirement: 图标轨与分组二级栏
主壳 MUST 提供 64px 图标轨，至少包含项目、技能、日历、设置入口。项目视图的二级侧栏 MUST 按「未选择项目」与具名项目分组列出会话。进入代码项目工作区后，二级侧栏 MUST 改为该项目文件树；点击轨上「项目」MUST 回到分组会话列表。

#### Scenario: 分组
- **WHEN** 存在一条未绑定会话和一条已绑定到「后端」项目的会话
- **THEN** 二级栏 MUST 在「未选择项目」下列出前者，在「后端」下列出后者

#### Scenario: 代码模式切回列表
- **WHEN** 用户处于代码项目文件树，并点击图标轨「项目」
- **THEN** 二级栏 MUST 恢复为项目分组会话列表

### Requirement: Composer 项目选择器
空会话输入区左下角 MUST 提供项目选择器，选项包括：不选（默认）、已有项目、「添加项目…」（先选 `code` 或 `material`，再选本机文件夹）。发送第一条消息之前 MUST 允许更改选择且不切换主区布局。发送并绑定之后选择器 MUST 只读。

#### Scenario: 默认不选
- **WHEN** 用户新建会话且尚未操作选择器
- **THEN** 选择器 MUST 显示未选择项目，主区 MUST 仍为普通对话空态

#### Scenario: 选了代码项目也不提前切 IDE
- **WHEN** 用户在空会话选择器中选中一个代码项目但尚未发送
- **THEN** 主区 MUST 仍为普通对话，MUST NOT 展示文件树或 Monaco

### Requirement: 未选择项目右侧两 tab
当当前会话 `projectId` 为 null 且已有对话时，右侧面板 MUST 仅含「会话详情」与「浏览器」两个 tab。会话详情 MUST 展示会话元数据（标题、创建时间、当前模型、消息数）以及本会话产物文件列表（来自 `listSessionFiles`）。该面板 MUST NOT 展示任务清单 tab 或 diff tab。

#### Scenario: 两 tab
- **WHEN** 用户打开一条未绑定项目且已有消息的会话
- **THEN** 右侧 MUST 能切换「会话详情」与「浏览器」，MUST NOT 出现「任务」或「文件」diff tab

#### Scenario: 详情含产物
- **WHEN** 该会话 `session_files` 中有一条 `write` 记录
- **THEN** 会话详情 MUST 列出该文件路径

### Requirement: 绑定后布局
会话绑定 `type=code` 之后，主壳 MUST 使用「文件树 | Monaco | 右侧会话」布局，且 MUST NOT 再渲染未选择项目用的 Inspector。会话绑定 `type=material` 之后，主壳 MUST 使用「素材网格 | 右侧会话」布局。

#### Scenario: 代码布局
- **WHEN** 会话已绑定代码项目
- **THEN** 界面 MUST 同时可见文件树、编辑器区域与右侧会话，MUST NOT 显示三 tab Inspector

#### Scenario: 素材布局
- **WHEN** 会话已绑定素材项目
- **THEN** 界面 MUST 同时可见素材网格与右侧会话
