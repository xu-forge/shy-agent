# active-file-context Specification

## Purpose
TBD - created by archiving change active-file-context. Update Purpose after archive.
## Requirements
### Requirement: 发送时携带当前查看文件

当用户在已绑定的代码或素材项目中发起会话（`window.shy.chat` / `ChatRequest`），若发送瞬间存在「正在看」的文件，请求 MUST 包含 `activeView: { kind: 'code' | 'material'; relativePath: string }`。`relativePath` MUST 为项目 `rootPath` 内的 posix 相对路径。用户消息正文 MUST 仍为 composer 原文，MUST NOT 因本能力自动插入 `@` 芯片或文件全文。

「正在看」定义为：

- 代码项目：Monaco 当前激活 tab 的路径（`activePath` 非空）。
- 素材项目：lightbox 处于打开状态时的当前素材路径；lightbox 关闭则 MUST NOT 携带，即使画布曾选中卡片。

无正在看的文件时，`activeView` MUST 省略。

#### Scenario: 代码激活 tab
- **WHEN** 用户在代码项目打开并激活 `src/a.ts`，发送「这段怎么改」
- **THEN** `ChatRequest.activeView` MUST 为 `{ kind: 'code', relativePath: 'src/a.ts' }`，消息正文 MUST 为「这段怎么改」

#### Scenario: 素材 lightbox
- **WHEN** 用户在素材项目打开 lightbox 查看 `notes/a.md` 并发送问题
- **THEN** `activeView.kind` MUST 为 `material`，`relativePath` MUST 为 `notes/a.md`

#### Scenario: 未打开 lightbox
- **WHEN** 用户在素材画布上仅点选卡片、未打开 lightbox 即发送
- **THEN** 请求 MUST NOT 包含 `activeView`

#### Scenario: 无打开文件
- **WHEN** 代码项目没有任何激活 tab（或未绑定项目）时发送
- **THEN** 请求 MUST NOT 包含 `activeView`

### Requirement: 模型经 reminder 获知查看文件

系统 MUST 在本轮 agent run 的 system-reminder 中注入 `<active-file>`（含 `kind`、`relativePath`），并指示：「这个文档 / 该文件 / 这篇 / 这段 / 这里」MUST 绑定该路径，MUST NOT 用对话历史里出现过的其他文件替代；用户在问文档/文件内容时 MUST 先 `fs_read`（或等价工作区读）该路径再答。仅当问题明显不涉及任何文件，或本轮用户消息用 `@` 明确点了另一个路径时，才可忽略本块且 MUST NOT 主动提及该文件。MUST NOT 仅因历史聊过其他文件而判定本块无关。同一用户发送触发的工具循环 MUST 复用发送瞬间的快照，MUST NOT 随用户随后切换 tab 或关闭 lightbox 而改变。`activeView` MUST NOT 写入 `session_messages` 用户正文。无 `activeView` 时 MUST NOT 输出 `<active-file>` 块。

#### Scenario: 有关则读
- **WHEN** 本轮带有 `activeView.relativePath = src/a.ts` 且用户问题针对该文件
- **THEN** reminder 文本 MUST 包含 `src/a.ts` 与须 `fs_read` 的规则

#### Scenario: 指示代词与历史冲突
- **WHEN** 本轮 `activeView` 为文件 B，对话历史曾讨论文件 A，用户发送「这个文档主要是说什么」
- **THEN** 规则文本 MUST 要求「这个文档」指 B，MUST 先 `fs_read` B，MUST NOT 因历史出现 A 而忽略本块

#### Scenario: 无关则忽略
- **WHEN** 本轮带有 `activeView` 但用户问题明显不涉及任何文件（闲聊），或本轮消息 `@` 了另一个路径
- **THEN** 规则文本 MUST 要求仅在上述情况下忽略该块且不要主动提及该文件

#### Scenario: 快照冻结
- **WHEN** 用户发送时 lightbox 打开 `a.md`，发送后立即关闭 lightbox，本轮仍在工具循环中
- **THEN** 本轮 reminder MUST 仍使用 `a.md`

#### Scenario: 无字段不注入
- **WHEN** `ChatRequest` 无 `activeView`
- **THEN** system prompt MUST NOT 包含 `<active-file>`

