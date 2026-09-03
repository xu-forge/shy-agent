# Proposal: opencode-go-provider

## Why

shy 目前只有一组手填的 OpenAI-compatible 配置，聊天输入旁的模型名（如 MiniMax-M3）只读，无法按会话切换模型。用户已订阅 [OpenCode Go](https://opencode.ai/docs/zh-cn/go/)，需要一键预设端点与 API Key，并在输入框旁按会话选择 Go 模型，同时保留现有 Custom 手填路径。

## What Changes

**Provider 预设**
- From: 仅 `baseURL` / `apiKey` / `model` 三字段，无命名 provider
- To: `provider: 'custom' | 'opencode-go'`；选 Go 时固定 `baseURL = https://opencode.ai/zen/go/v1`，设置页主要配 API Key；Custom 行为不变
- Reason: 降低 Go 接入成本，不破坏现有 Minimax 等配置
- Impact: non-breaking；缺省 `custom`，旧 `settings.json` 无需迁移即可用

**会话级模型**
- From: 全局 `settings.model`；composer `model-pill` 只读
- To: `sessions.model` 可空；生效 model = `session.model ?? settings.model`；Go 模式下 pill 变为下拉，写入当前会话
- Reason: 用户要求每个会话可用不同模型
- Impact: sessions 表迁移；交互/目标/压缩等 LLM 调用需统一解析

**模型目录**
- From: 无列表
- To: 主进程拉取 `GET …/zen/go/v1/models`（带 Key），失败回退内置 chat.completions 白名单；仅 Go 时聊天下拉可用
- Reason: 与官方目录同步，离线可降级
- Impact: 新增 IPC；本轮不接 Messages/Responses 协议模型

## Capabilities

### New Capabilities

- `opencode-go-provider`：OpenCode Go 预设、设置页 Provider 切换、模型列表拉取与回退
- `session-model-override`：会话 `model` 持久化、生效解析、composer 模型选择器（仅 Go）

### Modified Capabilities

（无 `openspec/specs/` 下既有 capability 的 REQUIREMENTS 语义变更。）

## Impact

- **config**：`~/.shy/config/settings.json` 增加 `provider`
- **db**：`sessions.model` 列（ALTER 迁移）
- **shared/preload/ipc**：`ModelSettings`、`SessionSummary.model`、`setSessionModel`、`listOpenCodeGoModels`（命名以实现为准）
- **main**：settings store 默认与 Go baseURL 解析；sessions store；LLM 调用点统一 `session.model ?? settings.model`
- **renderer**：SettingsPanel Provider UI；ChatWorkspace 将 `model-pill` 改为选择器（仅 Go）
- **依赖**：无新包（继续 OpenAI SDK chat.completions）
- **测试**：provider 解析、会话覆盖、列表失败回退、Custom 只读 pill
