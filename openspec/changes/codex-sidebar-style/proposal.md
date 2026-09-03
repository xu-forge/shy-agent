# Proposal: codex-sidebar-style

## Why

当前左侧栏仍是「新建任务」大按钮 + 分组头垃圾桶 + 底栏账户卡的旧 ZCode 感，与用户提供的 Codex 侧栏参考图差距明显：缺少短导航行、项目文件夹树观感、选中圆角灰底与 `⋯` 菜单，且顶区还露出品牌标题。用户只要视觉与项目区交互对齐，不要工作 OS 大改；现在改侧栏可立刻改善开箱第一印象，且不动 Agent / 绑定契约。

## What Changes

**侧栏顶区与短导航**
- From: 展示「shy」品牌文案 +「新建任务」实心按钮 +「定时任务/技能」
- To: **不展示**应用名「shy ⌄」；「新对话」为图标+文字行；「已安排」「技能」同为细线图标行
- Reason: 对齐 Codex 顶区；用户明确不要品牌标题
- Impact: 非破坏；`Sidebar.tsx` + CSS

**项目区（重点）**
- From: 文字分组头 + 常驻垃圾桶；会话行挤时间戳与删除
- To: 「项目」分区标题；具名项目行为文件夹图标 + 名称；点击展开/收起子会话；hover/选中出现 `⋯`，菜单含「移除项目」；子会话缩进、轻量文字；选中态圆角浅灰底
- Reason: 用户要求项目块图标与交互好好复刻
- Impact: `Sidebar.tsx` 结构与样式；删除入口从常驻图标改为菜单

**最近**
- From: 无独立「最近」区
- To: 「最近」分区，按 `updatedAt` 列出跨项目最近会话（纯 UI，无新存储）
- Reason: 对齐 Codex 信息架构观感
- Impact: renderer 派生列表

**明确不做**
- 拉取请求、插件市场、永久工作树、置顶、归档、搜索/通知铃、顶栏前进后退、项目重命名（无 IPC）

## Capabilities

### New Capabilities

- `codex-sidebar-nav`：Codex 风格侧栏短导航、无品牌标题、项目文件夹树交互与 `⋯` 菜单、最近会话区

### Modified Capabilities

- `shell-layout-theme`：单列导航文案与分区结构从「新建任务 + 未选择/项目分组」更新为 Codex 风格短导航 +「项目」+「最近」（收起不展示历史等约束保留）

## Impact

- **renderer**：`Sidebar.tsx`、`app.css`（sidebar 段）、可能小纯函数（最近列表派生）+ 单测
- **main / IPC / Agent**：无契约变更（移除项目仍走现有 delete）
- **测试**：导航文案、最近排序、项目折叠与菜单；typecheck / 现有测不回归
