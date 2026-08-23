# Proposal: inspector-func-panel

## Why

右侧面板目前只有「进度 + 交付物」两个折叠区，信息密度低；浏览器面板挤占对话区左列；Agent 的代码修改只显示文件路径列表，看不到改了什么。用户要求把右侧面板升级为多功能面板：任务详情 / 浏览器 / 代码 diff 三个 tab。

## What Changes

- **InspectorPanel 改造为 tab 面板**：顶部 tab 条（任务 / 文件 / 浏览器），tab 状态持久化 localStorage。
  - 任务 tab：现有「进度 + 交付物」内容原样迁入。
  - 文件 tab：新增 DiffView — 会话内文件改动记录列表，点按展开 unified diff（+/- 行着色、增删行数徽标、mono 字体）。
  - 浏览器 tab：BrowserPanel 从 ChatWorkspace 左列迁入（切走 tab 即隐藏原生视图，bounds 跟随面板槽位）。
- **diff 捕获（main）**：`fs_write` 覆盖前快照旧内容并计算 unified diff，`fs_delete` 记录删除 diff；记录存 SQLite 新表 `session_diffs`（path/op/added/removed/diff 文本/时间），旧内容快照存会话目录 `diffs/`。
- **IPC**：新增 `sessionDiffsList`（按会话查 diff 记录）；preload 暴露 `listSessionDiffs`。
- **ChatWorkspace**：移除左列浏览器面板与「浏览器」toggle（tab 即入口）。

### 不做

- 行级 diff 精细算法（LCS 够用）；git 集成 diff；diff 的服务端渲染。

## Capabilities

### New Capabilities
- `func-panel`：右侧多功能 tab 面板（任务/文件 diff/浏览器）与 diff 捕获存储。

### Modified Capabilities
- `minimax-layout`：右侧环境面板升级为 tab 面板；浏览器面板位置从对话区移到右栏（IPC 契约不变）。

## Impact

- **main**：`src/main/diff/`（unified.ts 算法 + capture）、`memory/db.ts`（session_diffs 表）、`tools/builtin.ts`（fs_write/fs_delete 挂捕获）、`ipc.ts`。
- **shared/preload**：DiffRecord 类型 + `sessionDiffsList` 通道。
- **renderer**：InspectorPanel（tab 化）、新 DiffView、BrowserPanel 迁移、ChatWorkspace 清理、app.css。
- **测试**：unified diff 算法单测、capture 流程单测（临时目录 + mock db）。
