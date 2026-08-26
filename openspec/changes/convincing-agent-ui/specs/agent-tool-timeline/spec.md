## ADDED Requirements

### Requirement: Turn 内事件序时间轴
Renderer MUST 按 emit 顺序维护 turn 内片段列表，片段 kind MUST 至少支持 `reasoning`、`tool`、`text`；工具调用与思考、正文 MUST 在同一时间轴 visual 中穿插展示。

#### Scenario: tool_call 插入时间轴
- **WHEN** 收到 `tool_call` 且尚未有对应 `tool_result`
- **THEN** 片段列表 MUST append `{ kind: 'tool', status: 'running', ... }` 于当前 turn 末尾

#### Scenario: 工具完成后更新片段
- **WHEN** 收到匹配的 `tool_result`
- **THEN** 对应 tool 片段 MUST 更新为 `status: 'done'` 或 `failed`，且 MUST 保留在原时间序位置

#### Scenario: 正文 delta 追加
- **WHEN** 收到 `assistant_delta` 且当前无进行中 reasoning-only 段
- **THEN** MUST append 或合并到 `{ kind: 'text' }` 片段

### Requirement: 工具人话标签
每个工具调用在时间轴收起态 MUST 展示人话标签，而非仅 raw 工具名；MUST 提供可扩展的 `toolLabelMap` 或等价 registry。

#### Scenario: browser_fetch 标签
- **WHEN** 工具名为 `browser_fetch`
- **THEN** 收起态 MUST 展示「抓取网页」或含 URL 摘要的等价中文标签

#### Scenario: web_search 标签
- **WHEN** 工具名为 `web_search`
- **THEN** 收起态 MUST 展示「搜索网页」及 query 摘要

#### Scenario: web_fetch 标签
- **WHEN** 工具名为 `web_fetch` 或 `browser_fetch`
- **THEN** 收起态 MUST 展示「抓取网页」及 URL 摘要

#### Scenario: grep 标签
- **WHEN** 工具名为 `grep`
- **THEN** 收起态 MUST 展示「搜索代码」及 pattern 摘要

#### Scenario: glob 标签
- **WHEN** 工具名为 `glob`
- **THEN** 收起态 MUST 展示「查找文件」及 pattern 摘要

#### Scenario: fs_edit 标签
- **WHEN** 工具名为 `fs_edit`
- **THEN** 收起态 MUST 展示「编辑文件」及 path 摘要

#### Scenario: show_widget 标签
- **WHEN** 工具名为 `show_widget`
- **THEN** 收起态 MUST 展示「可视化」及 widgetType 摘要

#### Scenario: present_artifact 标签
- **WHEN** 工具名为 `present_artifact`
- **THEN** 收起态 MUST 展示「呈现产物」及文件/URL 数量

#### Scenario: ask_user 标签
- **WHEN** 工具名为 `ask_user`
- **THEN** 收起态 MUST 展示「询问用户」及 question 摘要

#### Scenario: 未知工具 fallback
- **WHEN** 工具名无映射
- **THEN** MUST fallback 显示 raw 工具名，且 MUST 仍可展开 JSON 详情

### Requirement: 工具 Renderer 注册表
Renderer MUST 提供按工具名解析专用组件的 registry；已知工具 MUST 使用定制 UI，未知工具 MUST 使用通用 `ToolCallCard`。

#### Scenario: registry 命中
- **WHEN** `getToolRenderer('web_search')` 已注册
- **THEN** 时间轴 MUST 渲染 SearchToolRenderer（或 Phase 2 等价组件）而非纯 JSON

#### Scenario: registry 未命中
- **WHEN** 工具名无专用 Renderer
- **THEN** MUST 使用 `ToolCallCard` 展示输入/结果

### Requirement: 运行态与失败态
工具片段 MUST 区分 `running`、`done`、`failed` 三态；running 时 MUST 展示进行中指示（spinner 或文案「进行中…」）。

#### Scenario: 运行中工具
- **WHEN** tool 片段 `status` 为 `running`
- **THEN** UI MUST 显示进行中状态且 MUST NOT 显示最终结果

#### Scenario: 失败工具
- **WHEN** `tool_result` 含 `error`
- **THEN** 片段 MUST 为 `failed` 且 MUST 展示错误摘要
