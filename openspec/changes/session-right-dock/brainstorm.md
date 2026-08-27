<!--
Raw capture of superpowers:brainstorming output.
-->

# Brainstorm: 会话右侧 Dock（打开方式 / 浏览器 / 文件 / 任务详情）

> 本档为 superpowers:brainstorming 的 raw capture，供 proposal / design 萃取。

## 背景

会话右侧原先是 Inspector 两 tab（任务 / 产物），已合并为「任务详情」上下两块，产物只显示 workspace 相对路径。收起后不再留 26px 白边；展开入口在会话顶栏右上（收起态）或 Dock 标题栏右上（展开态）；宽度 340px 滑动。

用户对照参考图，希望做成 **图一工具条**：会话内容右上角一组控件，点击后在会话右侧滑出面板：

1. 用什么打开该项目（Finder 下拉）
2. 打开内置浏览器（图二：右侧预览 +「浏览器」tab）
3. 打开内置文件目录，支持查看/预览（图三：树 + 预览；图片、图表、md 等）
4. 任务详情（现有面板）

已有积木：`InspectorPanel`（任务详情）、`BrowserPanel`（WebContentsView 嵌入）、`FileTree`（代码项目树）、`revealSessionFile` / `shell.openPath`、会话 `workspace` 相对路径树（`artifactTree.ts`）。

## Q1：几个面板？

| 方案 | 说明 |
|---|---|
| A | 四个按钮各开独立窗口 |
| B | 浏览器 / 目录 / 任务三个面板并排 |
| **C（选）** | **一个右侧 Dock，三种内容互斥**；Finder 是下拉，不占 Dock |

**结论**：C。再点当前激活图标则滑回收起。展开后收起按钮只在 Dock 右上角，会话顶栏不再重复。

## Q2：Finder 下拉做什么？

**结论**：第一期只「在访达中显示」项目根（已绑定）或会话 `workspace`（未绑定）。不列 Cursor/VS Code。不展开 Dock。

## Q3：文件树根目录？

**结论**：未绑定会话 → `~/.shy/sessions/{id}/workspace`，只显示相对目录+文件名。已绑定项目 → `project.rootPath`。

## Q4：预览范围？

**结论**：第一期：图片、Markdown、HTML、纯文本。其它类型「在访达中打开」。不做完整 IDE 编辑、不做 git 状态列。图表若已是图片/HTML 则走预览。

## Q5：与代码 IDE 布局关系？

代码项目 `codeLayout=ide` 时主区已是文件树+编辑器+右侧会话，`showInspector` 现为 false。

**结论**：本 change 的 Dock 出现在「会话为主列」的布局（未绑定对话、或代码项目普通布局）。IDE 布局不把同一套 Dock 再叠一层；可后续把会话 aside 顶栏接同一工具条，本 change 不强制。

## 明确不做

- 多 Dock 并排 / 独立 Browser 窗口
- 用 Cursor/VS Code 打开项目
- 文件树 git 标记、内联编辑保存
- 新浏览器引擎（复用 `BrowserPanel`）
- 改 Agent 工具协议

## 验收锚点

- 顶栏四控件：Finder 下拉打开目录；地球/文件夹/任务详情分别滑出对应内容
- 互斥；再点激活项收起；滑动动画保留
- 文件树无绝对路径；md/图片可预览
- 任务详情仍为进度+产物两块
