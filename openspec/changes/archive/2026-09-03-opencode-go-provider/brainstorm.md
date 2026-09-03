<!--
Raw capture of superpowers:brainstorming output.
-->

# Brainstorm: OpenCode Go provider + 会话级模型选择

> 本档为 superpowers:brainstorming 的 raw capture，供 proposal / design 萃取。  
> 参考：[OpenCode Go 文档](https://opencode.ai/docs/zh-cn/go/)

## 背景

shy 现状只有一组 OpenAI-compatible 三元组（`baseURL` / `apiKey` / `model`），设置页手填；聊天 `composer-bar` 里的 `model-pill`（如 `MiniMax-M3`）只读展示 `settings.model`。无多厂商 registry，无模型下拉，无会话级 model。

用户希望接入 [OpenCode Go](https://opencode.ai/docs/zh-cn/go/)（$10/月订阅，API key 经 Zen，端点 `https://opencode.ai/zen/go/v1/...`），并把输入框旁的模型名改成可选。Go 文档中部分模型走 Anthropic Messages / OpenAI Responses；shy 当前仅 `chat.completions`。

## Q1：范围？

| 方案 | 说明 |
|---|---|
| **A（选）** | 只加 OpenCode Go 预设；底层仍 OpenAI-compatible；先只支持 chat.completions 模型 |
| B | 轻量多 provider 体系 |
| C | 多协议（Messages / Responses）完整体系 |

**结论**：A。不做多协议、不做通用多厂商 registry。

## Q2：模型选择放哪儿？

用户明确：会话下方输入框旁，把默认展示的模型名（如 MiniMax-M3）改成模型选择框。

**结论**：替换 `composer-bar` 内只读 `model-pill` 为可交互选择器。

## Q3：模型列表来源？

| 方案 | 说明 |
|---|---|
| 1 | 仅内置精选列表 |
| **2（选）** | 请求 `GET …/zen/go/v1/models`，失败回退内置 chat.completions 白名单 |

**结论**：2。

## Q4：Custom（非 Go）时选择器？

| 方案 | 说明 |
|---|---|
| **1（选）** | 仅 `provider === opencode-go` 时下拉可选；Custom 保持只读 pill + 设置页手填 model |
| 2 | Custom 也可手输/最近用过 |
| 3 | 本轮强制以 Go 为主 |

**结论**：1。

## Q5：切模型作用域？

| 方案 | 说明 |
|---|---|
| 1 | 写全局 `settings.model` |
| **2（选）** | 会话级覆盖：`session.model ?? settings.model` |
| 3 | 纯 UI 填 baseURL，无 provider 字段 |

用户要「每个会话的 model 都可以不一样」。

**结论**：方案 2。`sessions.model` 可空列；新会话 null → 用全局默认；选择器写入当前会话。

## 设计要点（已确认）

### 数据

- `ModelSettings.provider: 'custom' | 'opencode-go'`（默认 `custom`）
- Go：运行时强制 `baseURL = https://opencode.ai/zen/go/v1`；设置页主要配 API Key；`settings.model` = 新会话默认
- `sessions.model TEXT` 可空；`SessionSummary.model?: string | null`
- 生效 model = `session.model ?? settings.model`

### UI

- Go：`model-pill` → 下拉；样式贴近现有 pill
- Custom：只读 pill
- 设置：Provider 切换；Go / Custom 字段差异如上

### 列表与错误

- IPC 拉 `/v1/models`（带 key）；失败用内置白名单；可选短缓存
- 无 Key：与现网一致提示
- 会话 model 不在列表：仍显示并允许继续用
- 本轮列表优先只露出 chat.completions 可用项

### Out of scope

- Anthropic Messages / OpenAI Responses
- 多账号、用量面板、「设为默认」快捷操作
- Custom 模式下聊天模型下拉

## 验收锚点

1. Go + Key → 请求打到 `https://opencode.ai/zen/go/v1`
2. Go 时输入旁可选模型（远程或回退列表）
3. 会话 A/B 可选不同 model，各自发消息各自生效
4. 新会话未选手动 → `settings.model`
5. Custom 时 pill 只读；三字段仍可用
6. 无 Key / 列表失败有降级，不白屏
