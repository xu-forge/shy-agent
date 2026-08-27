# Proposal: session-right-dock

## Why

会话右侧现在只有「任务详情」，和参考图一的工具条差距大：没有「用什么打开项目」、内置浏览器、带预览的文件目录。用户希望点顶栏控件后在会话内容右侧滑出对应面板，而不是再切 Inspector 旧 tab。任务详情已经可用，浏览器与文件树也有现成积木，现在把它们收成同一套 Dock。

## What Changes

**会话顶栏工具条**
- From: 仅收起态显示任务详情图标；展开后图标在 Dock 右上
- To: 图一顺序四个控件：打开方式（Finder 下拉）/ 浏览器 / 文件目录 / 任务详情
- Reason: 对齐参考交互，入口固定在会话区右上
- Impact: 非破坏；`ChatWorkspace` 顶栏

**单一右侧 Dock，三种互斥内容**
- From: `InspectorPanel` 只渲染任务详情（进度+产物）
- To: 同一滑动 Dock 在 `tasks` / `browser` / `files` 间切换；再点激活项收起；展开后收起钮仅 Dock 右上
- Reason: 窄栏不能并排三个面板
- Impact: 重构 Inspector 为 Dock 壳；嵌入现有 `BrowserPanel`

**打开方式**
- From: 无
- To: 下拉「在访达中显示」项目根或会话 workspace；不占 Dock
- Impact: 复用 `shell.openPath`

**文件目录 + 预览**
- From: 任务详情里产物相对路径树，点了只 reveal
- To: 独立 files 模式：树（会话 workspace 或项目 root）+ 预览（图片 / md / html / 文本）；其它类型访达打开
- Impact: 可能复用 `projectTreeList` / 新列 workspace 树 IPC；预览只读

## Capabilities

### New Capabilities

- `session-right-dock`：顶栏四控件、互斥 Dock（任务详情 / 浏览器 / 文件+预览）、Finder 打开工作区、滑动收起

### Modified Capabilities

- `shell-layout-theme`：废止「未绑定会话右侧仅会话详情+浏览器两 tab」；改为本 Dock 工具条（代码 IDE 布局仍不叠第二套 Dock）

## Impact

- **renderer**：`ChatWorkspace` 顶栏；`InspectorPanel` 升为 Dock 壳；新文件树+预览视图；嵌入 `BrowserPanel`
- **main/preload**：打开工作区目录；会话 workspace 列目录（若现有 project tree IPC 不够）
- **不改**：Agent 工具、MCP、代码主区 Monaco IDE
- **测试**：Dock 互斥与收起；相对路径树；预览类型分流；layout spec 更新
