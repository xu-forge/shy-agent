# Design: inspector-func-panel

## Diff 捕获

- `src/main/diff/unified.ts`：纯函数 `diffLines(oldText, newText)` → LCS 行 diff → hunks；`formatUnifiedDiff(path, hunks)` → unified diff 文本（@@ hunk 头 + ' '/'+'/'-' 行）。无依赖。
- `src/main/diff/capture.ts`：
  - `captureWriteDiff(sessionId, absPath, newContent)`：文件存在则读旧内容 → 存快照 `{sessionDir}/diffs/{ts}-{basename}.old` → 计算 diff → `recordDiff` 入库；文件不存在 = 新增（全 +）。
  - `captureDeleteDiff(sessionId, absPath)`：读当前内容 → 删除 diff（全 -）。
  - 大文件（>2MB）跳过快照，只记计数（防内存炸）。
- `memory/db.ts` 新表 `session_diffs(id, session_id, path, op, added, removed, diff_text, occurred_at)` + `recordDiff` / `listSessionDiffs`。
- `fs_write` 在覆盖前调用 capture；`fs_delete` 在删除前调用。

## 面板

- InspectorPanel：tab 条（任务/文件/浏览器，图标+文字，active 墨色下划线）；`shy.inspectorTab` localStorage。
- 文件 tab：记录列表（文件名 + 相对路径 + +/-徽标 + 时间），点按展开 diff 卡（mono，+ 绿 - 红，hunk 头灰）；空态「Agent 的文件改动会显示 diff」。
- 浏览器 tab：直接渲染现有 `<BrowserPanel onClose>`？tab 模式下不需要 onClose —— BrowserPanel 加 `embedded` prop 隐藏关闭按钮；卸载即 browserHide（现有逻辑）。
- ChatWorkspace：删 browserOpen state、toggle 按钮、左列渲染；BrowserPanel import 移除。

## 风险

- BrowserPanel 在右栏宽度较窄（~300px）：native view bounds 跟随 slot rect，无需改 main。
- diff 文本入库体积：单条 cap 200KB，超出截断并标注。

## 测试

- unified.ts：新增/删除/修改/空文件/hunk 头正确性。
- capture.ts：tmp 目录覆盖写 → 记录 + 快照；删除 → 全减；新文件 → 全加；>2MB 跳过。
