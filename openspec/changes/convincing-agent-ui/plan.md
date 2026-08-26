# convincing-agent-ui Implementation Plan

> **For agentic workers:** 按 `tasks.md` 分 Phase 实现；规格见 `specs/agent-reasoning-display`、`agent-tool-timeline`、`agent-tool-enrichment`、`agent-fact-check-prompt`；工具全集见 `design.md` D5 对照表。

**Goal:** 提升 shy Agent 会话「信服感」——时间轴展示全工具链过程，并补齐 WorkBuddy 对齐的工具矩阵（Web/导航/编辑/可视化/交付/交互），非仅 web_search。

**Architecture:** Phase 1 扩展 `AgentEvent` + Timeline；Phase 2a–2f 分批 `registerTool` + 专用 Renderer registry；Phase 3 完整 prompt 工具表与 fact-check/visualizer/present 规则。

**Tech Stack:** Electron、React 19、TypeScript、ripgrep、vitest、Playwright/browser_fetch。

---

## Task 1–4: Phase 1（reasoning + timeline）

（同前：IPC reasoning 事件、AgentTimeline、toolLabelMap 骨架、ReActContent 去重）

---

## Task 5: Phase 2a — Web（tasks 3.x）

- [ ] `tools/search.ts` → `web_search`
- [ ] `tools/fetch.ts` → `web_fetch`（wrap browser_fetch）
- [ ] `SearchToolRenderer`、`WebFetchRenderer`

## Task 6: Phase 2b — Nav/Edit（tasks 4.x）

- [ ] `tools/grep.ts`、`tools/glob.ts`、`tools/fs_list.ts`、`tools/fs_edit.ts`
- [ ] `GrepRenderer`、`GlobRenderer`、`ListDirRenderer`、`EditFileRenderer`

## Task 7: Phase 2c — Visual/Present（tasks 5.x）

- [ ] `tools/visualizer.ts` → `read_me`、`show_widget`
- [ ] `tools/present.ts` → `present_artifact`
- [ ] `ReadMeRenderer`、`WidgetRenderer`、`ArtifactRenderer` + iframe sandbox

## Task 8: Phase 2d — Interact/Lint/Task（tasks 6.x）

- [ ] `tools/ask.ts` → `ask_user`（IPC 问用户 + 回传）
- [ ] `tools/lints.ts` → `read_lints`
- [ ] 主 agent expose `task_*`；`AskUserRenderer`、`TaskToolRenderer`

## Task 9: Phase 2e — Registry 全集（tasks 7.x）

- [ ] `toolLabels.ts` + `toolRenderers/index.ts` 注册 D5 表全部 Renderer
- [ ] 增强 Read/Write/ExecuteCommand 卡

## Task 10: Phase 3 — Prompt（tasks 9.x）

- [ ] `react-prompt.ts` 完整工具表 + visualizer + present + fact-check gates

## Task 11: 验收（tasks 10.x）

- [ ] 三锚点：广州周末游 / TCP/IP 可视化 / 代码 grep-edit-lint-present

---

## WorkBuddy ↔ shy 工具对照（完整）

| WorkBuddy | shy 目标 | Renderer |
|---|---|---|
| WebSearch | web_search | SearchToolRenderer |
| WebFetch | web_fetch | WebFetchRenderer |
| Read | fs_read | ReadFileRenderer |
| Glob | glob | GlobRenderer |
| Grep | grep | GrepRenderer |
| LS | fs_list | ListDirRenderer |
| Write | fs_write | WriteFileRenderer |
| Edit | fs_edit | EditFileRenderer |
| Bash | shell_exec | ExecuteCommandRenderer |
| read_me | read_me | ReadMeRenderer |
| show_widget | show_widget | WidgetRenderer |
| present_files | present_artifact | ArtifactRenderer |
| TaskCreate/… | task_* | TaskToolRenderer |
| AskUserQuestion | ask_user | AskUserRenderer |
| read_lints | read_lints | ReadLintsRenderer |
| ImageGen | image_gen（可选） | ImageGenRenderer |

参考：`../workbuddy/resources/templates/workbuddy-prompt.tpl`、`../workbuddy/docs/06-function-call-and-tools.md`、`../workbuddy/renderer/assets/tools-ruSSWZj5.js`
