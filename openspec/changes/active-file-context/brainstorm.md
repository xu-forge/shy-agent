# Brainstorm — active-file-context

背景：用户在代码项目或素材项目里打开某个文件后发起会话，希望 LLM 知道正在看的是哪个文件；问题与该文件有关时据此回答，无关则当没这回事。

现有代码对照：

- `ChatRequest` 仅 `sessionId / message / mode / verifyCommand?`，不含当前打开文件
- `CodeWorkspace` 的 `activePath`、`MaterialLibrary` lightbox 的 `selected` 停在组件内，未交给 `ChatWorkspace`
- composer 可手动 `@` 引用素材，序列化为 `@相对路径`；与「正在看」无关
- Agent 已绑定项目 `workspaceDir`，可用 `fs_read`；system-reminder 有 identity / platform / progress / memory，无「当前查看文件」

决议链（已与用户收敛）：

- Q1 怎么进对话？→ **A. 隐式提示**：发送时后台告诉模型路径；输入框不出现芯片；模型自行判断要不要读。拒绝自动 `@`、拒绝整段塞进用户消息。
- Q2 什么叫正在看？→ 代码：**当前激活 tab**。素材：**lightbox 开着**才算（画布点选未打开不算）。
- Q3 注入什么？→ **只给路径 + 使用规则**（有关则 `fs_read`，无关忽略且不要主动提该文件）。不附预览、不塞全文。快照取发送瞬间，本轮 run 内冻结，不跟随后切 tab/关 lightbox 抢。

范围锁定：

**做**：把 `activeView` 从代码 tab / 素材 lightbox 提升到发消息路径；`ChatRequest` 可选字段；本轮 agent run 挂上下文（不写入用户消息记录）；system-reminder `<active-file>` 块。

**不做**：自动 mention 芯片、把全文写入用户消息/历史、画布高亮未打开、一次带上所有打开的 tab、让模型「看见」图片/视频像素。

验收锚点：

1. 代码项目打开 `src/a.ts` 为激活 tab 时发送「这段怎么改」→ reminder 含该路径；模型可 `fs_read`。
2. 素材 lightbox 打开某 md 时发送相关问题 → reminder 含该素材相对路径。
3. 无打开文件、或素材仅画布选中未开 lightbox → 不注入 `<active-file>`。
4. 用户消息记录仍是输入原文，无芯片、无文件正文。
5. 发送后立刻关掉 lightbox / 切走 tab，本轮 run 仍使用发送时的快照。
6. `npm run typecheck` 与 `npm test` 通过。
