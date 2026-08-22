## ADDED Requirements

### Requirement: 多根技能注册表
系统 MUST 支持四个技能来源根：用户全局（`~/.shy/skills`）、agent 级、项目级（workspace `.shy/skills`）、builtin 种子；同名技能 MUST 按 root priority（project > agent > user > builtin）取唯一生效项，其余列为诊断败者。

#### Scenario: 同名去重
- **WHEN** user 根与 project 根存在同名技能
- **THEN** 系统 MUST 让 project 根版本生效，另一版本不出现在 catalog

#### Scenario: 兼容旧格式
- **WHEN** 用户全局根下存在单文件 `*.md` 技能
- **THEN** 系统 MUST 能扫描并作为技能条目暴露

### Requirement: SKILL.md 格式
技能目录 MUST 以 `SKILL.md` 为入口，YAML frontmatter 至少含 name 与 description；缺少 name 的条目 MUST 产生 warning 诊断并被跳过。

#### Scenario: 缺少 name
- **WHEN** 某技能 SKILL.md frontmatter 无 name
- **THEN** 该条目被跳过且 snapshot 诊断含 warning

#### Scenario: 正常解析
- **WHEN** SKILL.md 含 name/title/description
- **THEN** 条目以对应元数据进入 snapshot

### Requirement: 热重载
技能根目录或技能目录内容变化时，系统 MUST 在去抖后刷新 snapshot 并向渲染层推送 `skills_changed` 事件。

#### Scenario: 编辑后自动刷新
- **WHEN** 用户在编辑器保存某技能 SKILL.md
- **THEN** 渲染层技能列表 MUST 无手动刷新即反映新内容

### Requirement: 目录注入与 skill 工具
system prompt MUST 注入 token 预算内（min(2% × contextWindow, 5000)）的技能目录文本；LLM MUST 可通过 `skill` 工具按 name 读取技能全文；禁用技能 MUST 不出现在目录且 `skill` 工具拒绝读取。

#### Scenario: 预算截断
- **WHEN** 技能描述总量超过预算
- **THEN** 系统 MUST 按序截断并附溢出提示

#### Scenario: 读取技能
- **WHEN** LLM 调用 `skill({ name })` 且该技能生效
- **THEN** 工具 MUST 返回该技能 SKILL.md 全文

### Requirement: 启用开关
系统 MUST 持久化每个技能的启用/禁用状态；渲染层技能视图 MUST 显示来源徽章与启用开关，并支持切换。

#### Scenario: 禁用技能
- **WHEN** 用户关闭某技能的启用开关
- **THEN** 该技能从 catalog 移除且 `skill` 工具返回未找到，重启后状态保持
