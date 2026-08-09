# Brainstorm — shell-integration

背景：runtime、memory、skills、computer-tools 已在 main 实现，renderer 需接通聊天、设置、确认与各 pane。

决议链：
- Q1 聊天？→ ChatWorkspace 走 agentChat/cancel，订阅 events 流式展示
- Q2 设置？→ SettingsPanel 模态，settingsGet/Set
- Q3 确认？→ confirm_required 事件 + ConfirmDialog + toolConfirm IPC，120s 超时默认拒绝
- Q4 导航？→ Sidebar 切换 Chat / MemoryView / SkillsView
- Q5 通知？→ memory/notify 事件 → banner/系统消息
