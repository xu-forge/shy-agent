## Context

bootstrap-electron-shell 已提供安全 IPC 与 Codex UI。本 change 接入运行时。

## Goals / Non-Goals

**Goals:** 可配置 OpenAI-compatible；LangGraph 工具循环；interactive/goal；事件推送到 UI。  
**Non-Goals:** 记忆持久化细节、Skills 文件、具体本机工具实现（后续 change 挂载工具注册表）。

## Decisions

### D1：ChatOpenAI + baseURL
### D2：工具注册表接口，本 change 提供 echo/noop 工具证明循环；真实工具后续注册
### D3：goal 模式 maxSteps 上限（默认 32）防死循环
### D4：设置存 `userData/settings.json`

## Risks / Trade-offs

- [Risk] 模型 API 差异 → Mitigation: 仅依赖 chat.completions 兼容面
- [Risk] apiKey 明文本地 → Mitigation: 仅本地文件；后续可加系统钥匙串

## Migration Plan

N/A

## Open Questions

无（过夜默认已锁）
