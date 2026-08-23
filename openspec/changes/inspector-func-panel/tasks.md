# Tasks: inspector-func-panel

## 1. main：diff 捕获与存储

- [x] 1.1 `src/main/diff/unified.ts`：LCS 行 diff + unified 格式化（含单测）
- [x] 1.2 `memory/db.ts`：session_diffs 表 + recordDiff/listSessionDiffs
- [x] 1.3 `src/main/diff/capture.ts`：覆盖前快照 + 删除捕获 + 大文件跳过（含单测）
- [x] 1.4 `fs_write` / `fs_delete` 接入 capture；IPC `sessionDiffsList` + preload

## 2. renderer：面板 tab 化

- [x] 2.1 InspectorPanel tab 条（任务/文件/浏览器）+ localStorage 持久化；任务内容原样迁入
- [x] 2.2 DiffView：记录列表 + 展开 unified diff（+/- 着色）+ 空态
- [x] 2.3 BrowserPanel 迁入浏览器 tab（embedded 模式）；ChatWorkspace 移除左列与 toggle
- [x] 2.4 app.css：tab 条 / diff 视图样式

## 3. 验收

- [x] 3.1 `npm run typecheck && npm test` 通过
- [x] 3.2 `npm run build` + `openspec validate --strict` 通过
- [ ] 3.3 手动走查：fs_write 产生 diff、面板三 tab 切换、浏览器 tab 显示/隐藏
