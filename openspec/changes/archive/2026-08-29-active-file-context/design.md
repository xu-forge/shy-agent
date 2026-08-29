# Design: active-file-context

## Context

会话发出去的只有 composer 文本。代码 `activePath` 与素材 lightbox `selected` 是 UI 状态。Agent 已有项目 `workspaceDir` 与 `fs_read`。用户确认：隐式提示、只路径、素材仅 lightbox、发送瞬间快照。

## Goals / Non-Goals

**Goals:**

- 发消息时模型能知道当前查看文件的项目内相对路径。
- 问题相关才读该文件；无关不提、不读。
- 用户消息历史保持输入原文。

**Non-Goals:**

- 自动插入 `@` 芯片或把全文拼进用户消息。
- 画布点选未打开、多 tab 一并注入、视觉理解图片/视频。

## Decisions

### D1：隐式路径 + fs_read，不塞正文

- **选择**：reminder 只给 `kind` + `relativePath` + 使用规则；相关时由模型 `fs_read`（工作区即项目根）。
- **理由**：用户选 A；无关问题零正文 token；大文件/媒体不会误塞。
- **已考虑 alternative**：路径+预览 / 全文进用户消息 → 拒绝。

### D2：何谓「正在看」

- **选择**：代码 = 激活 tab（`activePath` 非空）。素材 = lightbox 未关闭时的当前 `MaterialItem.relativePath`。lightbox 内 ←/→ 切换后以当前项为准。画布仅选中不算。
- **理由**：用户确认 lightbox 才算打开。
- **已考虑 alternative**：画布高亮也算 → 拒绝。

### D3：快照挂在本轮 run，不进 session_messages

- **选择**：`ChatRequest.activeView` 在 `window.shy.chat` 时传入；`appendMessage` 仍只存用户原文。`RunArgs` / turn-runner 在该次 user turn 的工具循环内复用同一份 `activeView`。resume / 无该字段的旧客户端视为无查看文件。
- **理由**：历史不被污染；发送后关 lightbox 不切断本轮推理。
- **已考虑 alternative**：写入用户消息前缀 → 拒绝（用户可见/污染历史）。把 workspace 绑在 ChatRequest（旧 change 已拒 goal 续跑）→ 本字段只活在这一次 chat()，不替代项目绑定。

### D4：reminder 文案与 fail-open

- **选择**：非 critical provider（有 `activeView` 才输出）。块名 `<active-file>`。无路径或空字符串 → 不输出。拼 reminder 失败仍 fail-open（与现有 SR 一致）。
- **理由**：无打开文件时不占 prompt；不因提示失败打断对话。

## Risks / Trade-offs

- [Risk] 模型忽略 hint、不调用 `fs_read` → Mitigation: 规则写明「有关必须读」；后续若不够再考虑小预览（本期不做）。
- [Risk] 素材软链接目标在项目外，`fs_read` 按相对路径走 workspace → 现有 fs-read 跟 symlink 的行为与素材列表一致即可，不在本期改路径沙箱。
- [Risk] 图片/视频无法「看见」→ 接受：只告知路径与 kind；用户若需要描述画面须另说。
- [Trade-off] 每次相关问题多一次工具调用 → 接受（换 token 与干净历史）。

## Migration Plan

无数据迁移。旧 `ChatRequest` 无 `activeView` 字段时行为与现在相同。

## Open Questions

无阻塞项。
