# Proposal: minimax-ui-redesign

## Why

当前 shy 的 UI 功能完整但视觉与信息层级朴素（顶栏标题 + 扁平菜单 + 简单线程），用户希望整体对齐 MiniMax Code 的观感：一个「主导航 + 会话列表」的左栏、居中的空态主页、带工具卡片与产出/环境面板的对话区。此外，shy 现有工具确认是「每步逐条弹窗」，缺少「始终授权」的便捷开关，与 MiniMax 的「始终授权」心智不一致。本轮同时补齐视觉重构与真实可用的授权开关。

## What Changes

- **左侧栏重构**：顶部导航改为「新对话（点击开新会话）/ 技能 / 日历」，去掉独立的「新建任务」按钮与搜索框；底部为图一风格的会话列表 + 设置入口（shy 账户卡）；设置入口 hover 弹选项、点击打开设置弹窗（左 tab：记忆 / 常规设置 / 运行日志）。
- **主区空态重构**：居中 logo + 标语 + 大输入框；输入框内/旁含「+」、`始终授权` toggle、`展示型模型选择器`（只读当前模型）、发送；下方功能 pills 复用 shy 现有建议文案。
- **`/` 命令菜单（替代独立模式切换）**：移除顶栏独立的「交互式 / 目标」ModeToggle；在输入框键入 `/` 弹出命令菜单，含**模式选择**（交互式 / 目标）与**相关技能选择**（来自 `listSkills`，可搜索，命中后插入技能引用草稿）。
- **对话区重构**：重做消息线程与 Composer 样式；新增「已编辑 N 个文件」产出卡片（复用 `listSessionFiles`，无记录时显示空态占位）；右侧「环境」面板沿用现有 inspector 三 tab，改造成图三右侧布局。
- **`始终授权` 开关（真实）**：`ModelSettings` 新增 `autoApproveTools`；`confirm.ts` 闸门读到该值时为 `true`，跳过弹窗直接放行；开关经现有 `settingsSet` IPC 持久化。

## Capabilities

### New Capabilities

- `minimax-layout`：渲染层整站布局（左栏 / 空态 / 对话区 / 环境面板）对齐 MiniMax 截图，真实功能保留。
- `always-authorize`：始终授权开关的配置与闸门联动，本地持久化。

### Modified Capabilities

（无既有主规格能力被语义性破坏；`对话/记忆/技能/日历/设置` 能力在 `minimax-layout` 下仅调整呈现，不改其对外 IPC 契约。）

## Impact

- **renderer**：`App.tsx`（nav 模型与布局）、`Sidebar.tsx`（重做）、`ChatWorkspace.tsx`（空态 + 线程 + 产出卡片）、`Header.tsx`、`InspectorPanel.tsx`（环境面板样式）、`Composer`/`ModeToggle`、`styles/app.css` 与 `styles/tokens.css`（大量视觉样式）。
- **shared**：`ModelSettings` 增加 `autoApproveTools?`。
- **main**：`settings/store.ts`（默认值 + 合并）、`confirm.ts`（闸门读开关）、`ipc.ts`（无新增通道，复用 settingsGet/settingsSet）。
- **preload**：`window.shy` 无需新方法（沿用 `settingsGet`/`settingsSet`）。
- **测试**：`confirm` 的自动放行分支；`settings` 合并默认值；既有渲染快照若受影响则更新。
