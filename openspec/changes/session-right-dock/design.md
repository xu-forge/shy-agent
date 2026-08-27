# Design: session-right-dock

## Context

shy 会话主列是 `ChatWorkspace`；有对话且非代码 IDE 时右侧渲染 `InspectorPanel`（任务详情：进度/步骤 + 产物相对路径树），宽度 340px，`is-closed` 时 width 过渡到 0。收起入口：关闭时在会话顶栏右上 `inspector-dock-btn`，打开时在面板 `inspector-head` 右上。

内置浏览器已有 `BrowserPanel`（`WebContentsView` + `browserShow`/`browserHide`）。代码项目主区有 `FileTree` + `projectTreeList`（受 `rootPath` 约束）。会话文件操作记在 `session_files`，产物树用 `artifactTree.ts` 相对化。打开目录走 Electron `shell.openPath`。

`shell-layout-theme` 仍写着未绑定会话右侧「会话详情 / 浏览器」两 tab，与当前任务详情实现和本设计都不一致，本 change 一并改契约。

## Goals / Non-Goals

**Goals:**

- 会话顶栏图一式四控件：打开方式、浏览器、文件目录、任务详情
- 单一右侧 Dock，三种模式互斥，滑动展开/收起
- Finder 打开绑定项目根或会话 workspace
- 文件树只显示相对路径；预览图片 / Markdown / HTML / 纯文本
- 任务详情保持现有两块面板

**Non-Goals:**

- 用 Cursor / VS Code 打开项目
- 文件 git 状态、Dock 内完整编辑保存
- 新浏览器引擎
- 代码 `ide` 布局再叠一套 Dock
- Agent 工具协议变更

## Decisions

### D1：一个 Dock，三种互斥模式

- **选择**：`dockMode: 'tasks' | 'browser' | 'files' | null`。`null` = 收起。地球/文件夹/任务详情切模式并展开；再点当前模式 → `null`。Finder 不改 `dockMode`。
- **理由**：参考图是「会话右侧一块预览区」；并排会挤。
- **已考虑 alternative**：多窗口；三面板并排。

### D2：工具条位置

- **选择**：四控件在 `ChatWorkspace` 顶栏右侧。Dock 展开时顶栏隐藏地球/文件夹/任务详情的「重复开关」，只留 Finder；收起用 Dock 头右上同一右侧栏图标。
- **理由**：用户已要求展开后按钮在右上角而不是会话顶栏左侧。
- **已考虑 alternative**：四个按钮始终在顶栏（展开时会在 Dock 左边再出现一排）。

### D3：打开方式仅访达

- **选择**：下拉一项「在访达中显示」。路径 = 已绑定 `project.rootPath`，否则 `sessions/{id}/workspace`。目录不存在则 mkdir 或提示失败，不抛未捕获。
- **理由**：第一期足够；App 列表跨平台难维护。
- **已考虑 alternative**：检测 Cursor/VS Code。

### D4：文件树根

- **选择**：未绑定 → 会话 workspace 实列目录（不是只列 `session_files` 历史）。已绑定 → 与代码工作区相同的 `rootPath` 树规则（忽略 node_modules 等）。展示相对路径+文件名。
- **理由**：用户要「内置文件目录」看当前磁盘，不只是 Agent 写过的产物。
- **已考虑 alternative**：仅 `session_files` 产物树（任务详情里已有）。

### D5：预览只读分流

- **选择**：按扩展名/MIME：图 → `<img>`（`shy-asset` 或 data URL）；`.md` → 现有 `MarkdownBody`；`.html/.htm` → 沙箱 iframe 或只读 webview；文本 → `<pre>`。其它 → `reveal`/`openPath`。不写回磁盘。
- **理由**：覆盖攻略 HTML/md/截图；不做第二套 Monaco。
- **已考虑 alternative**：全部用 Monaco；HTML 用系统浏览器。

### D6：浏览器嵌入

- **选择**：Dock `browser` 模式渲染现有 `<BrowserPanel embedded />`；切走或收起时卸载以触发 `browserHide`。
- **理由**：bounds 已跟 slot；不必新引擎。
- **已考虑 alternative**：独立 Browser 窗口。

### D7：状态持久化

- **选择**：`shy.inspectorOpen` 升级或改为 `shy.dockMode`（`null`/`tasks`/`browser`/`files`）。缺省 `null` 或沿用「有对话时默认 tasks」—— **缺省收起**，避免一进会话就占 340px；用户点图标再开。
- **理由**：工具条可见即可；默认展开任务详情会挡住对话。
- **已考虑 alternative**：默认 tasks（与当前 Inspector 默认展开接近）。采用缺省收起。

### D8：IDE 布局

- **选择**：`resolveShellLayout` 在代码 `ide` / 素材主区时仍 `showInspector: false`。本 Dock 只在会话为主列时出现（未绑定有对话、或代码 `chat` 布局）。
- **理由**：IDE 已有文件树+编辑器。
- **已考虑 alternative**：会话 aside 上也挂同一工具条 → 下一 change。

## Risks / Trade-offs

- [Risk] 原生 Browser WebContentsView 与 React 切换不同步 → Mitigation: 切模式先卸载 BrowserPanel
- [Risk] 会话 workspace 无树 IPC → Mitigation: 复用 `projectTreeList` 的列举逻辑，对 workspace 根做 path guard
- [Risk] HTML 预览 XSS → Mitigation: sandbox iframe，禁止 nodeIntegration
- [Risk] 旧 spec「两 tab」与实现漂移 → Mitigation: 改 `shell-layout-theme` delta
- [Trade-off] 缺省收起 vs 默认任务详情 → 接受缺省收起
- [Trade-off] 不做 App 打开列表 → 接受

## Migration Plan

1. 抽出 `SessionDock` 壳（滑动 + `dockMode`），任务详情变为其中一页
2. 顶栏四控件 + Finder IPC
3. 嵌入 BrowserPanel
4. workspace/项目树 + 预览
5. 更新 layout spec；`shy.inspectorOpen` 迁移读一次后改写 `shy.dockMode`
6. Rollback：还原顶栏与单面板 Inspector；localStorage 键可弃

## Open Questions

- 无（Finder 应用列表、IDE aside 工具条留到后续 change）
