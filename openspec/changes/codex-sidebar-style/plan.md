# Codex 侧栏样式 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** 将 shy 左侧栏改为 Codex 风格短导航 + 项目文件夹树 + 最近区，去掉品牌标题，重点复刻项目行图标与 `⋯` 交互。

**Architecture:** 仅改 renderer：`Sidebar.tsx` 重排 DOM；新增纯函数派生「最近」列表；CSS token 对齐选中/hover。删除项目仍走现有 `onDeleteProject`。无 IPC / DB 变更。

**Tech Stack:** React、现有 `shellLayout` 分组、`app.css` tokens、vitest

**Spec/Design:** `openspec/changes/codex-sidebar-style/specs/`、`design.md`

---

## Task 1: 最近列表纯函数

**Files:**
- Create: `src/renderer/src/lib/sidebarRecent.ts`
- Create: `src/renderer/src/lib/sidebarRecent.test.ts`

- [ ] **Step 1:** 写失败单测：多条会话按 `updatedAt` 降序；`limit` 截断；空数组 → `[]`
- [ ] **Step 2:** 实现 `recentSessions(sessions, limit)` 并跑绿 `npx vitest run src/renderer/src/lib/sidebarRecent.test.ts`
- [ ] **Step 3:** Commit（中文）：`test(ui): 侧栏最近会话派生函数`

---

## Task 2: Sidebar 结构 — 顶区与短导航

**Files:**
- Modify: `src/renderer/src/components/Sidebar.tsx`

- [ ] **Step 1:** 删除 `.sb-brand` / 「shy」标题节点
- [ ] **Step 2:** 将「新建任务」改为「新对话」图标行；「定时任务」文案改为「已安排」；保持 `onNewSession` / `calendar` / `skills` 绑定
- [ ] **Step 3:** 目视：展开侧栏无「shy」大标题

---

## Task 3: 项目区交互

**Files:**
- Modify: `src/renderer/src/components/Sidebar.tsx`
- Modify: `src/renderer/src/styles/app.css`（项目行相关）

- [ ] **Step 1:** 「项目」分区标题；具名项目行加 folder SVG；点击行 `onToggleGroup`；子会话缩进 class
- [ ] **Step 2:** 未绑定组无 folder 图标，保留可折叠
- [ ] **Step 3:** 去掉项目行常驻垃圾桶；加 `⋯`（hover/active 显示）；菜单仅「移除项目」→ `onDeleteProject`；点击外侧关闭
- [ ] **Step 4:** 选中/hover：圆角浅灰底（token）
- [ ] **Step 5:** Commit：`feat(ui): 侧栏项目区对齐 Codex 文件夹与菜单`

---

## Task 4: 最近区 + flyout

**Files:**
- Modify: `src/renderer/src/components/Sidebar.tsx`
- Modify: `src/renderer/src/App.tsx`（仅当需要把扁平 sessions 传入 Sidebar；优先从 `groups` flatten）

- [ ] **Step 1:** 在 body 内「项目」下渲染「最近」，数据来自 `recentSessions(flatten(groups))`
- [ ] **Step 2:** 点击最近项 → `onSelectSession`
- [ ] **Step 3:** 确认收起且无 flyout 时不渲染列表；flyout 共用 `renderBody`

---

## Task 5: 样式抛光与验收

**Files:**
- Modify: `src/renderer/src/styles/app.css`

- [ ] **Step 1:** 分区标题、短导航行高、图标描边、菜单阴影/圆角、会话缩进与 Codex 截图对齐
- [ ] **Step 2:** 暗色主题扫一眼：文字对比度正常
- [ ] **Step 3:** `npm run typecheck` + `npx vitest run src/renderer/src/lib/sidebarRecent.test.ts`（及若有 Sidebar 相关测）
- [ ] **Step 4:** 勾选 `tasks.md`；Commit：`style(ui): Codex 侧栏视觉抛光`

---

## Non-goals checklist（实现时勿做）

- 不添加拉取请求 / 工作树 / 置顶 / 归档 / 编辑项目名
- 不恢复「shy ⌄」标题
- 不改 `project-entity` 绑定规则
