# Verify: inspector-func-panel

## 自动化验证（2026-08-23）

- `npm run typecheck`：0 错误
- `npm test`：61 files / 404 tests，391 passed + 13 skipped，0 failed（新增 11：unified 6 + capture 5）
- `npm run build`：通过（bundle +~350KB，来自 highlight.js/lib/common ~35 种语言）
- `npx openspec validate inspector-func-panel --strict`：valid

## 实现说明

- **开源库**（用户指定）：diff 计算用 `diff@9`（jsdiff structuredPatch，上下文 3 行）；代码高亮用 `highlight.js@11`（lib/common 子集，github 主题，按扩展名选语言，失败回退转义纯文本）。自研 LCS 实现已废弃。
- main：`src/main/diff/unified.ts`（jsdiff 封装 + parseUnifiedDiff）、`capture.ts`（覆盖前快照到 `sessions/{id}/diffs/`、删除捕获、>2MB 跳过、diff 文本 200KB 截断）、`memory/db.ts` 新表 `session_diffs` + recordDiff/listSessionDiffs；`fs_write`/`fs_delete`（非递归）挂捕获。
- IPC：`sessionDiffsList` 通道 + preload `listSessionDiffs`；`SessionDiffRecord` 共享类型。
- renderer：InspectorPanel tab 化（任务/文件/浏览器，localStorage 持久化）；DiffView（列表 + 展开 hljs 着色 diff，+绿/−红/hunk 头灰）；BrowserPanel 迁入浏览器 tab（embedded 模式隐藏关闭钮，切 tab 卸载即隐藏原生视图）；ChatWorkspace 移除左列与顶栏 toggle。

## 未完成（待人工）

- 3.3 手动走查：GUI 下 fs_write 产生 diff、三 tab 切换、浏览器 tab 显示/隐藏（需图形环境）。

## 修订（2026-08-23，用户反馈）

- 右侧面板支持展开/收起：参考 ZCode 右侧 activity rail —— 常驻 44px 竖向图标栏（任务/文件/浏览器），点图标展开对应 tab，再点当前图标收起；收起时仅剩图标栏；展开态 372px（rail + 328 内容）；激活图标带 amber 竖条；展开/收起与当前 tab 均持久化 localStorage（shy.inspectorOpen / shy.inspectorTab）。收起浏览器 tab 时 BrowserPanel 卸载 → 原生视图隐藏（复用既有行为）。typecheck 0 错误、404 测试回归、build 通过。

## 修订 2（2026-08-23，用户澄清交互）

- tab 恢复横向条（任务/文件/浏览器 + 图标），竖向 activity rail 方案废弃。
- 展开/收起针对**整个右侧面板**：收起时面板整体消失，右缘留 26px 窄条 + 「›」展开把手按钮（参考 ZCode 最右缘图标按钮）；展开态 tab 条右端有「‹」收起按钮。状态持久化 shy.inspectorOpen。收起时 BrowserPanel 卸载 → 原生视图隐藏。typecheck 0 错误、404 测试回归、build 通过。
