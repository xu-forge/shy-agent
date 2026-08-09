# Brainstorm — computer-use-tools

背景：MVP 要求 Agent 可操作本机：终端、文件、浏览器、GUI。产品默认全自动，高危须确认。

决议链：
- Q1 工具面？→ shell_exec, fs_read/write/delete, browser_open/fetch, gui_screenshot/click
- Q2 注册方式？→ 工具注册表 factory + ToolContext（emit、confirmHighRisk）
- Q3 高危规则？→ 删除/覆盖敏感路径/安装类命令/GUI 点击/file|javascript URL → confirmHighRisk
- Q4 browser_fetch？→ Playwright headless（可选依赖）
- Q5 跨平台？→ win32 PowerShell 点击；darwin cliclick；其余报错
