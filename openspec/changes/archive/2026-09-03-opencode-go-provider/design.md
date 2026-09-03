# Design: opencode-go-provider

## Context

shy 用 `ModelSettings`（`baseURL` / `apiKey` / `model`）经 `~/.shy/config/settings.json` 持久化；`llm-client.ts` 以 OpenAI SDK 调 `chat.completions`。ChatWorkspace composer-bar 用只读 `model-pill` 展示 `settings.model`（常见如 MiniMax-M3）。无 provider 枚举、无模型目录、无会话级 model。

OpenCode Go（[文档](https://opencode.ai/docs/zh-cn/go/)）提供统一网关与 `/v1/models`；多数模型可用 `…/v1/chat/completions`，少数需 Anthropic Messages 或 OpenAI Responses。本 change 只接 chat.completions 路径。

## Goals / Non-Goals

**Goals:**

- 设置可选 OpenCode Go：固定 baseURL，只配 API Key；Custom 三字段不变
- Go 时输入旁模型选择器可拉远程目录（失败回退内置）
- 每个会话可持久化不同 model；生效 = `session.model ?? settings.model`
- 所有带 sessionId 的 LLM 调用统一走该解析

**Non-Goals:**

- Messages / Responses 多协议客户端
- 通用多厂商 registry / 多账号
- Custom 模式下聊天模型下拉
- 用量展示、「设为全局默认」按钮
- 改 product-brief 模型栈表述以外的产品叙事（可选文档跟进，非阻塞）

## Decisions

### D1：仅 Go 预设，底层仍 OpenAI-compatible

- **选择**：`provider: 'custom' | 'opencode-go'`；Go 时解析出的 `baseURL` 恒为 `https://opencode.ai/zen/go/v1`（写入或运行时覆盖均可，以运行为准，避免用户改坏）。
- **理由**：满足当前需求，改动面小。
- **已考虑 alternative**：多 provider 体系（过重）；无 provider 字段、仅靠 URL 嗅探（易误判）。

### D2：会话级 model 覆盖

- **选择**：`sessions` 增 `model TEXT` 可空；`SessionSummary.model`；IPC 更新当前会话 model。新会话 `null` → 用 `settings.model`。选择器写入会话，**不**改 `settings.model`。
- **理由**：用户明确要每会话不同模型。
- **已考虑 alternative**：只改全局 settings（不满足）；仅内存覆盖不落盘（刷新丢失）。

### D3：composer pill → 选择器（仅 Go）

- **选择**：替换只读 `model-pill`；`provider === 'opencode-go'` 时可开下拉；`custom` 仍只读展示生效 model（通常即 settings.model）。
- **理由**：对齐现有 UI 位置与用户口述。
- **已考虑 alternative**：设置页独占选择（用户要输入旁）；顶栏另开控件（重复）。

### D4：远程 models + 内置回退

- **选择**：主进程用 API Key 请求 `GET https://opencode.ai/zen/go/v1/models`；短缓存；失败或非 2xx → 内置 chat.completions 白名单（文档中走 chat/completions 的 model id）。列表可过滤明显非 completions 的项（若元数据可辨）；否则以白名单交集或白名单为准。
- **理由**：跟官方目录；离线可用。
- **已考虑 alternative**：仅静态列表（易过期）；仅远程无回退（无网不可用）。

### D5：LLM 调用统一解析

- **选择**：集中 helper（如 `resolveLlmConfig(settings, session?)`）产出 `{ baseURL, apiKey, model }`；interactive / goal / 标题等凡有 session 的路径传入 session；无 session 的后台任务用 settings。
- **理由**：避免漏改导致会话覆盖失效。
- **已考虑 alternative**：各调用点各自 `??`（易漏）。

### D6：协议边界

- **选择**：本轮不实现 Anthropic Messages / Responses；若远程列表含此类模型，优先不展示或标注不可用（实现选一：默认不展示）。
- **理由**：现有 `llm-client` 只支持 chat.completions。
- **已考虑 alternative**：首版硬接多协议 → 范围过大。

## Risks / Trade-offs

- [Risk] Go 模型实际需非 completions 端点 → Mitigation: D6 过滤；文档注明仅 completions
- [Risk] `/v1/models` 鉴权或 CORS（主进程无 CORS 问题）失败 → Mitigation: 内置回退 + UI 轻提示
- [Risk] 会话 model 与全局默认漂移，用户困惑 → Mitigation: 选择器展示当前生效值；设置页说明「新会话默认」
- [Risk] 漏改某条 LLM 路径仍用全局 model → Mitigation: D5 helper + 单测覆盖主要入口
- [Trade-off] 不做「设为默认」→ 接受；需要时可改设置里的 model
- [Trade-off] Custom 无聊天下拉 → 接受；与 Q4 一致

## Migration Plan

1. 扩展 `ModelSettings` / store 默认 `provider: 'custom'`
2. sessions `ALTER` 加 `model`；读写与 IPC
3. `resolveLlmConfig` + 替换主要调用点
4. `listOpenCodeGoModels` IPC + 内置白名单
5. SettingsPanel Provider UI
6. ChatWorkspace 选择器
7. 测试与手动验 Go / Custom / 双会话

Rollback：忽略 `provider`（当 custom）、忽略 `sessions.model` 列即可回退行为；数据可留。

验收：见 brainstorm 六条锚点。

## Open Questions

- 内置白名单的初始子集以文档 chat/completions 表为准；具体 id 实现时对照 `/v1/models` 样例再定稿
- 标题生成 / 压缩是否必须跟会话 model 一致：倾向 **是**（同一会话体验一致）
