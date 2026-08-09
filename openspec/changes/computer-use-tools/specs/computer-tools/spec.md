## ADDED Requirements

### Requirement: Shell 与文件工具
系统 MUST 向 Agent 提供 `shell_exec`、`fs_read`、`fs_write`、`fs_delete` 工具；执行结果 MUST 以 JSON 返回 ok/stdout/stderr 或 error。

#### Scenario: 读取文件
- **WHEN** Agent 调用 fs_read 且路径可读
- **THEN** 系统 MUST 返回 content（可截断至 maxChars）及 truncated 标记

#### Scenario: 高危删除文件
- **WHEN** Agent 调用 fs_delete
- **THEN** 系统 MUST 先经 confirmHighRisk；用户拒绝时 MUST 不删除并返回错误

#### Scenario: 安装类 shell 命令
- **WHEN** shell_exec 命令匹配安装/远程脚本等风险模式
- **THEN** 系统 MUST 经 confirmHighRisk 后方可执行

### Requirement: 浏览器工具
系统 MUST 提供 `browser_open`（系统默认浏览器）与 `browser_fetch`（Playwright 提取 body 文本，上限约 40k 字符）。

#### Scenario: 打开非常规 URL
- **WHEN** browser_open 的 url 为 file: 或 javascript:
- **THEN** 系统 MUST 经 confirmHighRisk 后再 openExternal

### Requirement: GUI 工具
系统 MUST 提供 `gui_screenshot`（主屏 PNG 存 userData/screenshots）与 `gui_click`（屏幕坐标点击）。

#### Scenario: GUI 点击确认
- **WHEN** Agent 调用 gui_click
- **THEN** 系统 MUST 经 confirmHighRisk；用户允许后在支持平台执行点击

### Requirement: 工具事件
各本机工具在执行时 MUST 通过 ToolContext.emit 发出 tool 事件供 UI 展示。

#### Scenario: 工具执行可见
- **WHEN** 任意 computer/builtin 本机工具被调用
- **THEN** Agent 事件流 MUST 包含 type=tool 及工具名与 detail
