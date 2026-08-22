# Design: minimax-ui-redesign

## Context

shy 是 Electron + React + Vite 桌面 Agent 客户端，`src/renderer` 现有五视图（对话 / 记忆 / 技能 / 日历 / 设置），布局为「左栏 Sidebar + 主列(main-column) + 右侧 InspectorPanel(仅对话)」。视觉样式集中在 `styles/app.css`(3.5k 行) 与 `styles/tokens.css`(设计令牌)。工具确认走 `createConfirmWaiter` → EventBus `confirm_required` → renderer `ConfirmDialog` → `toolConfirm` IPC。模型配置在 `ModelSettings`（`~/.shy/config`）。本轮按 MiniMax 截图重构整站视觉并补一个真实授权开关。

## Goals / Non-Goals

**Goals:**
- 左栏对齐图一：主按钮 / 搜索 / 导航 / 会话列表 / 底部卡片，真实功能可点。
- 空态对齐图二：居中 logo + 标语 + 大输入框 + `始终授权` + 展示型模型选择 + 功能 pills。
- 对话区对齐图三：消息线程 + 工具卡片 + 产出文件卡片 + 右侧环境面板。
- 移除独立「交互式 / 目标」ModeToggle；在输入框键入 `/` 弹出命令菜单（模式选择 + 技能选择）。
- `始终授权` 真实可用并持久化，开启后工具确认自动放行。

**Non-Goals:**
- 不引入项目树 / 项目分组持久化。
- 不做多模型切换（仅展示当前模型名）。
- 不做分支 / git / 本地/远端模式 / 「打开终端」。
- 不改各视图对外 IPC 契约（对话/记忆/技能/日历/设置）。
- 产出文件卡片的「diff/行数」不做真实数据源，展示 `listSessionFiles` 汇总或空态。

## Decisions

### D1：布局骨架保留，重做各列视觉
- **选择**：沿用 `app-shell`（Sidebar + main-column + InspectorPanel）。重写 `Sidebar.tsx` 结构；`App.tsx` 归置 nav；空态与线程样式重写。
- **理由**：无需动 IPC 与状态流，改动集中在渲染层。

### D2：左栏导航（混合）
- **选择**：顶部导航 = `新对话`（点击即 `onNewSession`）+ `技能` + `日历`（保留真实功能视图），去掉独立的「新建任务」按钮与 `搜索` 框。底部会话列表 + 设置入口（shy 账户卡）。
- **理由**：用户要求 记忆/设置 不进导航；`新对话` 兼具「当前对话视图 + 开新会话」语义；`定时任务` 是日历视图的一部分（`CalendarView` 承载调度），不单独设导航项。

### D2b：设置入口与设置弹窗
- **选择**：底部 `shy` 账户卡作为设置入口：hover 弹出 记忆 / 常规设置 / 运行日志 选项；点击打开 `SettingsDialog`。`SettingsDialog` 左侧为 tab（记忆 / 常规设置 / 运行日志），内容分别复用 `MemoryView`、`SettingsPanel`、新增 `LogsView`（`listAgentLogs`/`readAgentLog`）。
- **理由**：记忆/设置从全页视图收进弹窗，减少导航噪音；运行日志用现有 agent-logs IPC 即可。

### D3：空态主页
- **选择**：居中 logo（shy 图标 + 标语）；大输入框；框内一行：`+`、`始终授权` toggle、模型名（只读）、发送键；框下方功能 pills 复用 `ChatWorkspace` 既有 `SUGGESTIONS`。
- **理由**：对齐图二，且功能 pills 直接映射现有建议文案，零新语义。

### D4：`始终授权` 真做
- **选择**：`ModelSettings` 新增 `autoApproveTools?: boolean`（默认 `false`）。`createConfirmWaiter` 在弹窗前 `getSettings()`：若 `autoApproveTools` 为真，直接 `resolve(true)` 跳过确认（仍记审计日志可选）。renderer 开关经 `settingsGet/settingsSet` 持久化，主进程重启仍生效。
- **理由**：复用现有 settings 流，改动最小；符合「默认全自动，删除等高危需确认」的产品基调。
- **已考虑 alternative**：仅前端占位不落地 → 用户已明确要「真做」，拒绝。

### D5：展示型模型选择器
- **选择**：显示 `ModelSettings.model` 字符串（只读徽标）。空态与 Composer 都展示该值。
- **理由**：不多模型切换，只给「当前模型」心智。

### D6：对话区与产出卡片
- **选择**：保留 `ReActContent`/`ToolCallCard`/流式 delta 渲染；Composer 重做成图三样式（含模型徽标与发送键）。新增「已编辑文件」产出卡：调用 `listSessionFiles(sessionId)` 汇总 `write` 操作数量，无记录时显示空态。
- **理由**：职责单一、不新增数据源。

### D7：右侧「环境」面板
- **选择**：沿用 `InspectorPanel` 三 tab（任务 / 记忆 / 技能），仅重写为图三右侧样式（标题 + 内容区 + 进度条）。不做「打开终端/变更/提交推送」。
- **理由**：功能已存在，换皮即可。

### D8：样式复用与令牌化
- **选择**：新增/扩展 `tokens.css`（色板、圆角、间距），`app.css` 按区域重写；尽量用现有类名减少对测试与其余视图的扰动。
- **理由**：视觉集中管理，便于后续主题切换。

### D9：`/` 命令菜单（替代独立模式切换）
- **背景**：原顶栏 `ModeToggle` 提供「交互式 / 目标」切换；用户希望去掉独立切换，改为在输入框键入 `/` 弹出命令菜单。
- **选择**：`ChatWorkspace` 移除顶栏 `ModeToggle`；Composer 监听 `/`（输入框为空、光标在首位）打开命令菜单。菜单分两区：
  - **模式**：交互式 / 目标（选中即 `setMode`；目标模式不再有「验证命令」输入框，直接进入目标推进）。
  - **技能**：调 `window.shy.listSkills()` 拉取；**每个技能项显示 `name` 与一行 `description`**；选中后把技能引用（如 `使用技能 <name>：`）写入草稿，令 `skills/match.ts`（content-based）命中该技能，从而在 turn 阶段注入对应 `skillBlock`。
- **实时过滤**：键入 `/` 后，用户继续输入的文字作为查询串，**实时过滤菜单选项**（模式项按「交互式/目标」文案匹配，技能项按 `name`/`description`/`id` 匹配）；匹配则显示，无序命中时显示「无匹配」。键盘 ↑/↓ 移动、Enter 选中、Esc 关闭；查询串不再进入草稿，仅在菜单内部消费。
- **理由**：一个入口同时解决「模式选取」与「技能调用」，且复用现有 `matchSkills` 后台机制；输入即过滤符合 Mimic 心智。
- **已考虑 alternative**：保留顶栏 toggle 并新增 `/` → 用户明确「去掉 toggle」，拒绝。

## Risks / Trade-offs

- [Risk] `app.css` 大改可能影响记忆/技能/日历/设置等既有视图 → Mitigation: 分区块提交，跑 `typecheck` + 手工点验各视图。
- [Risk] `confirm.ts` 放行分支若被误用会静默放行高风险操作 → Mitigation: 开关仅本地可配；删除等高危 UI 仍在「确认」语义内（本轮只影响工具确认，不影响产品级低危前提下的删除闸门）。
- [Trade-off] 产出卡片仅汇总文件数、无 diff → 接受；后续 change 再接真实文件变更事件。
- [Trade-off] 模型选择器只读 → 后续多模型切换在另一 change 做。

## Migration Plan

1. 共享类型与 settings：`ModelSettings.autoApproveTools` 默认值 + 合并；`confirm.ts` 放行分支 + 单测。
2. 左栏重构（Sidebar + App 布局），保留导航行为。
3. 空态主页与功能 pills。
4. 对话区样式 + Composer + 产出卡片。
5. 环境面板样式。
6. 全量 `typecheck` + 手工点验；必要时更新受影响测试。
7. Rollback：样式回滚走 git；`autoApproveTools` 仅新增字段，旧数据兼容（undefined = 默认 false）。

## Open Questions

- （无阻塞）产出卡是否也统计 `read`/`delete`：本期仅统计 `write` 作「已编辑」语义，若产品要更全，手工点验后再加。
