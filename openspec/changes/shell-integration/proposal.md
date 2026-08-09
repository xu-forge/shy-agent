## Why

各子系统在 main 已就绪，但用户无法在壳 UI 中对话、改模型设置、批准高危操作或管理记忆/技能 pane。本 change 将 renderer 从占位接通为可用的集成界面。

## What Changes

- ChatWorkspace：发送/取消、模式切换、assistant/tool/status/error/done 事件展示
- SettingsPanel：OpenAI-compatible 配置读写
- ConfirmDialog + toolConfirm：响应 confirm_required
- App 路由：记忆/技能 pane 替换占位；memory/notify banner

## Capabilities

### New Capabilities

- `high-risk-confirm`: 高危操作确认对话框与 IPC 闭环

### Modified Capabilities

- `renderer-shell-ui`: 聊天可发送、设置入口、记忆/技能真实视图

## Impact

- App.tsx、ChatWorkspace、SettingsPanel、ConfirmDialog、MemoryView、SkillsView
- preload 暴露 chat/cancel/confirm/settings/memory/skills API
