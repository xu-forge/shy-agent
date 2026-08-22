# Proposal: zcode-home-replica

## Why

用户提供了目标截图（ZCode 风格主界面），要求把 shy 当前首页（图一：蓝色 S logo + 「让工作更简单。」+ pills 建议）像素级复刻为图二布局：左栏「项目/分组」结构 + 主区「时段问候语 + 卡片式 composer + 列表式示例」。上一轮 `minimax-ui-redesign` 已完成第一轮对齐，本轮按新截图做第二轮布局复刻。

已确认的三个决策：
1. **品牌文案换成 shy**（「向 shy 提问」、顶部 shy 标题）。
2. **无对应功能的控件隐藏**：搜索、自动化/插件市场（换成 shy 真实功能「定时任务/技能」入口）、项目/环境选择器、质量选择、闲时任务推广与功能卡片均不渲染。
3. **会话当项目条目**：左栏「项目」tab 下把现有会话展示为条目（保留选中/删除），「分组」tab 为空态。

## What Changes

- **左栏**（约 220px）：顶部 shy 标题 → 「+ 新建任务」（新建会话）→ 定时任务 / 技能 入口 → 「分组 | 项目」tab → 会话条目列表（图标 + 标题 + 相对时间）→ 「任务」区（会话 checklist 摘要空态「还没有任务」）→ 底部 shy 账户卡（保留）。
- **主区空态**：时段问候语（按时段变化）替换 logo + 标语；composer 重做为卡片式（无顶行选择器；输入框 placeholder「向 shy 提问，使用 / 选择命令或能力」；底部行：橙色「完全访问」按钮（绑 `autoApproveTools`）+ 只读模型徽标 + 圆形发送键）；建议 pills 改为 3 条列表式示例。
- **线程视图 / 浏览器面板 / Inspector**：不动（仅空态与左栏布局变化波及的容器样式微调）。

## Capabilities

### New Capabilities
- `zcode-home-layout`：主界面空态与左栏的图二布局复刻（含控件取舍规则）。

### Modified Capabilities
- `minimax-layout`：空态主页与左栏结构由本 change 的 `zcode-home-layout` 取代（对外 IPC 契约不变）。

## Impact

- **renderer**：`Sidebar.tsx`（结构重写）、`ChatWorkspace.tsx`（空态重写）、`styles/app.css`（左栏/空态样式重写）、`styles/tokens.css`（如需新 token）。
- **main / shared / preload**：无契约变化（`autoApproveTools`、sessions、skills、schedule IPC 全部复用）。
- **测试**：现有测试不回归；无新 IPC。
