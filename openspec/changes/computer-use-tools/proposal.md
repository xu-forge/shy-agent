## Why

Agent 需在本机执行命令、读写文件、打开/抓取网页、截屏与 GUI 点击以完成长工作流。产品要求默认自动执行，但对删除、敏感覆盖、安装类命令等高危操作 MUST 先经用户确认。

## What Changes

- 注册 shell_exec、fs_read、fs_write、fs_delete
- 注册 browser_open、browser_fetch（Playwright）
- 注册 gui_screenshot、gui_click
- ToolContext.confirmHighRisk 统一门禁；工具 emit 事件供 UI 展示

## Capabilities

### New Capabilities

- `computer-tools`: 本机 shell/文件/浏览器/GUI 工具集与高危确认钩子

### Modified Capabilities

（无）

## Impact

- builtin.ts、computer.ts、registry.ts
- 可选 playwright 依赖；Windows/macOS 平台差异
