# code-workspace Specification

## Purpose

代码项目在主区内提供受 `rootPath` 约束的文件树与可编辑保存的 Monaco，Agent 改写干净 tab 时刷新。

## Requirements

### Requirement: 文件树
代码项目布局 MUST 在代码主区左侧展示 `rootPath` 的目录树，MUST NOT 占用导航栏。列举 MUST 忽略 `node_modules`、`.git`、`dist`、`out`、`.next`、`coverage`、`.shy`。条目数超过实现上限（默认 5000）时 MUST 截断并提示。树中的路径 MUST 保持在 `rootPath` 之内。

#### Scenario: 忽略目录
- **WHEN** 项目根下存在 `src/index.ts` 与 `node_modules/pkg/index.js`
- **THEN** 文件树 MUST 显示 `src/index.ts`，MUST NOT 显示 `node_modules` 内文件

#### Scenario: 路径不逃逸
- **WHEN** 请求列出或读取 `rootPath` 之外的路径（含 `..`）
- **THEN** 系统 MUST 拒绝该请求

### Requirement: Monaco 编辑与保存
代码项目主区 MUST 用 Monaco 打开文本文件，支持语法高亮、多 tab、将修改保存回磁盘原路径。保存 MUST 写入 `rootPath` 约束内的绝对路径。

#### Scenario: 打开并保存
- **WHEN** 用户在文件树点开 `src/a.ts`，修改后保存
- **THEN** 磁盘上 `rootPath/src/a.ts` MUST 变为保存后的内容

#### Scenario: 跟随主题
- **WHEN** 应用主题为 dark
- **THEN** Monaco MUST 使用深色主题；浅色时 MUST 使用浅色主题

### Requirement: Agent 改写刷新
若 Agent 写入了当前已打开 tab 对应的文件，编辑器 MUST 在检测到变更后重新加载该文件内容（用户有未保存修改时 MUST 不静默覆盖，改为提示）。

#### Scenario: 无脏数据时刷新
- **WHEN** 打开的文件无未保存修改，且本会话 `session_files` 出现对该路径的 `write`
- **THEN** 该 tab MUST 显示磁盘上的新内容

#### Scenario: 脏数据不覆盖
- **WHEN** 打开的文件有未保存修改，同时 Agent 写入了同一路径
- **THEN** 编辑器 MUST NOT 丢弃用户未保存内容；MUST 提示冲突
