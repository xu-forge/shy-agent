# Spec: session-side-panel

## ADDED Requirements

### Requirement: 会话右侧可折叠面板
Renderer MUST 在 `ChatWorkspace` 右侧提供可折叠面板，默认收起；顶栏右上提供切换按钮。展开宽度 320px。

#### Scenario: 顶栏切换按钮
- **WHEN** 用户点击顶栏「侧栏」按钮
- **THEN** 面板展开或收起；按钮 `aria-expanded` 状态同步
- **AND** 状态持久化到 `localStorage.myAgent.sidePanelOpen`

#### Scenario: 默认收起
- **WHEN** 应用首次启动或新会话创建
- **THEN** 面板 MUST 默认收起
- **AND** 不占用内容区宽度

#### Scenario: 任务 tab 计数
- **WHEN** 当前会话任务数 > 0
- **THEN** 任务 tab 显示数字角标 `N`

#### Scenario: 文件 tab 计数
- **WHEN** 当前会话文件操作数 > 0
- **THEN** 文件 tab 显示数字角标 `M`

### Requirement: 任务 tab 渲染
任务 tab MUST 列出当前 session 的所有任务（含目标模式 checklist 与 Agent 动态任务），按 `updated_at` 倒序。

#### Scenario: 任务条目展示
- **WHEN** 任务 tab 渲染某任务
- **THEN** 展示勾选框、标题、来源（Goal/Agent）chip、更新时间、可选证据
- **AND** 鼠标悬停时显示「编辑 / 删除」按钮

#### Scenario: 用户切换完成状态
- **WHEN** 用户点击任务勾选框
- **THEN** 渲染层立即更新勾选态
- **AND** 异步调用 `session:tasks:update` 写回 DB

#### Scenario: Agent 覆盖用户改动
- **WHEN** Agent 通过 `task` 事件更新某任务，且其 `updated_at` 晚于本地最近一次用户改动时间
- **THEN** UI 立即以 Agent 数据为准
- **AND** 任务条目右上显示「Agent 已更新」角标 1.5s 后淡出

#### Scenario: 删除任务
- **WHEN** 用户点击任务删除按钮
- **THEN** 弹出 `ConfirmDialog` 二次确认
- **AND** 确认后调用 `session:tasks:delete` 并从 UI 移除

### Requirement: 文件 tab 渲染
文件 tab MUST 列出当前 session 所有文件操作记录，按 `occurred_at` 倒序；同路径合并显示最新 op 与次数。

#### Scenario: 文件条目展示
- **WHEN** 文件 tab 渲染某文件
- **THEN** 展示 op 类型 chip（read/write/edit/copy/move/delete）、路径、操作次数、最后操作时间

#### Scenario: 复制路径
- **WHEN** 用户点击文件条目的「复制路径」按钮
- **THEN** 调用 `navigator.clipboard.writeText`
- **AND** 顶部出现「已复制」提示 1.5s

#### Scenario: 在系统资源管理器打开
- **WHEN** 用户点击文件条目的「在文件管理器打开」按钮
- **THEN** Renderer 调用 `session:files:reveal` IPC
- **AND** main 端根据平台调用 `explorer /select,<path>`（Windows）或 `open -R <path>`（macOS）

#### Scenario: 从视图移除（不删 DB）
- **WHEN** 用户点击文件条目的「从视图移除」按钮
- **THEN** 该条目从 UI 列表移除
- **AND** DB 记录保留（用于审计与重新加载）

### Requirement: ChatWorkspace 顶部 checklist 移除
`ChatWorkspace` MUST 不再渲染 `.goal-panel`；`goal` / `checklist` 事件改由侧栏「任务」tab 消费。

#### Scenario: checklist 事件路由
- **WHEN** 收到 `goal` 事件含 `checklist`
- **THEN** 数据写入 `session_tasks` 表（source='goal'）并由侧栏渲染
- **AND** ChatWorkspace 中无任何 checklist DOM

## MODIFIED Requirements

### Modified Requirement: renderer-shell-ui
- 顶栏新增「侧栏」切换按钮（与 Settings 按钮相邻）
- 主内容区在面板展开时 padding-right 增加 320px
- 移除 ChatWorkspace 中的 `.goal-panel` 渲染
- 全局替换 `window.confirm` / `confirm()` 为 `ConfirmDialog`（删除会话、删除记忆、删除技能、删除任务）
