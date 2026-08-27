## REMOVED Requirements

### Requirement: 未选择项目右侧两 tab

**Reason**: 未绑定会话右侧改为图一式 Dock 工具条（打开方式 / 浏览器 / 文件目录 / 任务详情），不再使用「会话详情 + 浏览器」两 tab。

**Migration**: 实现与验收改走 `session-right-dock`。产物列表在任务详情下方面板；浏览器为 Dock 的 `browser` 模式。

---

## MODIFIED Requirements

### Requirement: 绑定后布局
会话绑定 `type=code` 且为 IDE 布局之后，主壳 MUST 使用「文件树 | Monaco | 右侧会话」布局，且 MUST NOT 再渲染会话主列用的右侧 Dock。会话绑定 `type=material` 之后，主壳 MUST 使用「素材网格 | 右侧会话」布局，且 MUST NOT 渲染该 Dock。代码项目若切换为普通会话布局，则 MUST 允许展示会话右侧 Dock。

#### Scenario: 代码 IDE 布局
- **WHEN** 会话已绑定代码项目且为 IDE 布局
- **THEN** 界面 MUST 同时可见文件树、编辑器区域与右侧会话，MUST NOT 显示会话主列右侧 Dock

#### Scenario: 素材布局
- **WHEN** 会话已绑定素材项目
- **THEN** 界面 MUST 同时可见素材网格与右侧会话，MUST NOT 显示会话主列右侧 Dock

#### Scenario: 代码普通会话布局可开 Dock
- **WHEN** 会话已绑定代码项目且用户切换为普通会话布局
- **THEN** 会话主列 MUST 可展示右侧 Dock 工具条
