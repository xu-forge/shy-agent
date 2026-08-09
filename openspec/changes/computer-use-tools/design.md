## Context

agent-runtime 已有工具注册表与 runtime_ping。本 change 挂载真实本机能力。

## Goals / Non-Goals

**Goals:** 七类 computer/builtin 工具；高危 confirmHighRisk；JSON 结构化返回；tool 事件。  
**Non-Goals:** 剪贴板、多显示器策略、沙箱隔离、命令白名单 UI。

## Decisions

### D1：confirmHighRisk 回调
- **选择**：ToolContext 注入，由 shell-integration 接 ConfirmDialog
- **理由**：工具层不依赖具体 UI

### D2：shell_exec 风险启发式
- **选择**：irm|curl|sh、全局安装、rm -rf / 等触发确认
- **理由**：MVP 轻量规则

### D3：fs_write 敏感路径
- **选择**：.ssh、settings.json、可执行扩展名等
- **理由**：防误覆盖密钥与二进制

### D4：gui_screenshot
- **选择**：desktopCapturer 主屏 PNG → userData/screenshots

## Risks / Trade-offs

- [Risk] shell_exec 任意命令 → Mitigation: 高危确认 + 60s 超时
- [Risk] Playwright 未安装 → Mitigation: 错误 hint 返回
- [Trade-off] Linux GUI 点击未支持 → 明确报错

## Migration Plan

N/A

## Open Questions

无。
