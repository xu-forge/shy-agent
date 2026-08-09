## Context

bootstrap-electron-shell 提供导航占位；agent-runtime、memory-foundation、skills-manager、computer-use-tools 提供后端能力。本 change 完成 renderer 集成。

## Goals / Non-Goals

**Goals:** 完整聊天链路；设置模态；高危确认 UI；记忆/技能 pane 可用；全局 notify。  
**Non-Goals:** 多会话 UI、主题切换、快捷键除 Ctrl+Enter 外扩展。

## Decisions

### D1：单 App 级 confirm 模态
- **选择**：App 监听 confirm_required，一次一单
- **理由**：与 createConfirmWaiter 一致

### D2：notice banner
- **选择**：ChatWorkspace banner + 6s 自动清除
- **理由**：记忆变更轻提示

### D3：sessionId 客户端生成
- **选择**：ChatWorkspace 内 crypto.randomUUID
- **理由**：短期记忆按 session 键控

## Risks / Trade-offs

- [Risk] 确认超时阻塞工具 → Mitigation: 120s 自动拒绝
- [Trade-off] 工具消息 JSON 原文 → 后续可美化

## Migration Plan

N/A

## Open Questions

无。
