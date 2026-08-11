# Proposal: shell-session-side-panel

## Why

`finalize-agent-product` 收尾后，renderer 还差两块产品级体验：

1. **MemoryView / SkillsView 视觉与交互粗糙**，信息密度低、无搜索/过滤，无法匹配产品简报中的「Codex 风」定位。
2. **会话工作区缺乏上下文侧栏**：用户在长任务中无法快速回看「目标 checklist、本会话动过哪些文件、Agent 临时列的子任务」，而这正是 Codex / Cursor 类工具的标配。

本 change 收敛这两块短板，同时为后续可能引入的「计划/任务」等概念铺好基础设施（侧栏 + task 事件）。

## What Changes

- **MemoryView 升级**：搜索、来源/标签过滤、分类展示、批量选择、视觉与 tokens 对齐；保留全部 CRUD 行为。
- **SkillsView 升级**：列表搜索/排序、frontmatter 实时预览、保存校验、视觉精修；保留全部 CRUD 行为。
- **会话右侧可折叠面板**（默认收起）：顶栏切换按钮；「任务」+「文件」两个 tab，可独立计数角标。
- **后端文件追踪**：builtin.ts 全操作打点（**本期 fs_read/fs_write/fs_delete**；edit/copy/move 留待 builtin 添加工具后扩展），成功才记录；存 `session_files` 表。
- **Agent 动态任务事件**：新增 `task` 事件，独立于 `checklist`；可勾选/取消/删除；存 `session_tasks` 表。
- **统一 checklist 呈现**：ChatWorkspace 顶部 `goal-panel` 移除，改由侧栏「任务」tab 统一承载。
- **小瑕疵清理**：`window.confirm` 替换为 `ConfirmDialog`、错字、重复样式、命名一致。

## Capabilities

### New Capabilities

- `session-side-panel`: 会话右侧可折叠面板（任务/文件 tab + 顶栏切换）
- `session-file-tracking`: 本次会话文件操作追踪（DB + IPC + computer.ts 埋点）
- `session-tasks`: Agent 动态任务事件 + 用户可手动管理（DB + IPC + 新事件类型）

### Modified Capabilities

- `final-runtime`：原 checklist 在 ChatWorkspace 顶部独立面板呈现，改为仅在侧栏「任务」tab 中呈现。
- `renderer-shell-ui`：顶栏新增「侧栏」切换按钮；MemoryView / SkillsView 视觉与结构重做。
- `long-memory`：UI 层（MemoryView）增加搜索/过滤/分类，IPC 协议不变。
- `local-skills`：UI 层（SkillsView）增加搜索/排序/预览，IPC 协议不变。

## Impact

- **renderer**：
  - `src/renderer/src/components/MemoryView.tsx`（重做）
  - `src/renderer/src/components/SkillsView.tsx`（重做）
  - `src/renderer/src/components/ChatWorkspace.tsx`（移除 goal-panel；顶栏加切换按钮）
  - `src/renderer/src/components/SessionPanel.tsx`（新增，任务+文件 tab）
  - `src/renderer/src/components/SessionPanel/*.tsx`（新增子组件：TaskList, TaskItem, FileList, FileItem）
  - `src/renderer/src/styles/app.css`（侧栏/任务/文件样式；refine Memory/Skills）
  - `src/renderer/src/styles/tokens.css`（如需新增 token 变量）
- **main**：
  - `src/main/memory/db.ts`（新增 `session_files` / `session_tasks` 表与 CRUD）
  - `src/main/agent/tools/computer.ts`（埋点）
  - `src/main/agent/graph.ts` / `service.ts`（新增 `task` 事件 emit；保留 checklist 流）
  - `src/main/ipc.ts`（新增 `session:files:list` / `session:tasks:list` / `session:tasks:update` / `session:tasks:delete`）
  - `src/main/sessions/store.ts`（接入文件/任务存储）
- **preload**：
  - `src/preload/index.ts` + `index.d.ts`（暴露新 IPC）
- **shared**：
  - `src/shared/ipc.ts`（新增 IPC channel 名 + 新类型 `SessionFileRecord` / `SessionTaskRecord` / 新事件 `task`）
- **测试**：新增 `tests/session_files.test.ts` / `tests/session_tasks.test.ts`；扩展 computer.test.ts；扩展 event payload 类型测试。
