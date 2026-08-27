# session-right-dock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 会话顶栏图一式四控件，右侧单一 Dock 互斥展示任务详情 / 内置浏览器 / 文件目录+预览，Finder 打开工作区。

**Architecture:** `dockMode` 存在 App（或 ChatWorkspace+SessionDock 提升状态）。`SessionDock` 复用现有 340px 滑动壳，三页互斥；`BrowserPanel embedded` 切走即卸载。文件树：未绑定列会话 workspace，已绑定复用 `projectTreeList`。预览按扩展名只读分流。

**Tech Stack:** Electron `shell.openPath`、现有 `BrowserPanel` / `MarkdownBody`、React 顶栏、vitest。

## Global Constraints

- 规格与任务以简体中文为主
- 数据根 `~/.shy`（`SHY_HOME` 可覆盖）
- 缺省 Dock 收起；收起无占位白边
- 代码 IDE / 素材主区不叠本 Dock
- 不做 Cursor/VS Code 打开、git 状态、Dock 内保存编辑
- HTML 预览必须沙箱

---

## File map

- Create: `src/renderer/src/lib/dockMode.ts` + `dockMode.test.ts` — parse/persist
- Create: `src/renderer/src/lib/filePreview.ts` + test — 扩展名 → kind
- Create: `src/renderer/src/components/SessionDock.tsx` — 壳（可由 InspectorPanel 重命名）
- Create: `src/renderer/src/components/dock/DockFilesView.tsx` — 树+预览
- Create: `src/renderer/src/components/dock/OpenWithMenu.tsx` — Finder 下拉
- Modify: `InspectorPanel.tsx` — 变为 tasks 页或并入 SessionDock
- Modify: `ChatWorkspace.tsx` — 四控件；展开时只留打开方式
- Modify: `App.tsx` — `dockMode` 替代 `inspectorOpen`
- Modify: `shellLayout.ts` / test — 何时 `showDock`
- Modify: `src/main/ipc.ts`、`shared/ipc.ts`、preload — `openWorkspace`、workspace 列树
- Modify: `app.css` — 工具条与 Dock 页

---

## Task 1: dockMode

**Files:** `src/renderer/src/lib/dockMode.ts`、`dockMode.test.ts`

- [ ] **Step 1:** 失败单测：`null`/`tasks`/`browser`/`files`；非法值 → `null`；旧 `shy.inspectorOpen=true` → `tasks`
- [ ] **Step 2:** 实现 parse + persist 键 `shy.dockMode`
- [ ] **Step 3:** `npx vitest run src/renderer/src/lib/dockMode.test.ts`

---

## Task 2: SessionDock 壳 + 任务详情页

**Files:** `SessionDock.tsx`（或演进 `InspectorPanel`）、`App.tsx`

- [ ] **Step 1:** 壳接收 `mode` / `onClose`；`is-closed` 当 `mode===null`；头栏标题随模式变
- [ ] **Step 2:** `tasks` 页保持进度+产物相对路径树
- [ ] **Step 3:** App 用 `dockMode` 驱动；去掉仅 `inspectorOpen` 布尔

---

## Task 3: 顶栏工具条

**Files:** `ChatWorkspace.tsx`、`shellLayout.ts`、`RightDockIcon.tsx`、地球/文件夹图标、`app.css`

- [ ] **Step 1:** layout 单测：未绑定有对话 `showDock true`；代码 IDE `false`；代码 chat 布局 `true`
- [ ] **Step 2:** 四控件；点模式 setDockMode；再点同一模式 → null
- [ ] **Step 3:** `mode!==null` 时顶栏只留打开方式，收起钮在 Dock 右上

---

## Task 4: 打开方式

**Files:** ipc / preload、`OpenWithMenu.tsx`

- [ ] **Step 1:** `openDockRoot({ sessionId })`：绑定则 `rootPath`，否则 workspace（mkdir）+ `shell.openPath`
- [ ] **Step 2:** 下拉一项「在访达中显示」；失败 toast/status

---

## Task 5: 浏览器模式

**Files:** `SessionDock.tsx`、`BrowserPanel.tsx`

- [ ] **Step 1:** `mode==='browser'` 渲染 `<BrowserPanel embedded />`
- [ ] **Step 2:** 切走卸载，确认 `browserHide`

---

## Task 6: 文件树 + 预览

**Files:** `filePreview.ts`、workspace tree IPC、`DockFilesView.tsx`

- [ ] **Step 1:** 单测 `previewKind('a.md'|'a.png'|'a.html'|'a.bin')`
- [ ] **Step 2:** 列树：未绑定 workspace guard；已绑定走 `projectTreeList`
- [ ] **Step 3:** UI 树相对路径；预览 img / MarkdownBody / sandbox iframe / pre；其它 reveal

---

## Task 7: 验收

- [ ] **Step 1:** `npm run typecheck && npm test`
- [ ] **Step 2:** 手测四控件、滑动互斥、Finder、浏览器、md/图预览、任务详情
