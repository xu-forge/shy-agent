## 1. Phase 1 — 事件与类型（agent-reasoning-display）

- [x] 1.1 `shared/ipc.ts` 扩展 `AgentEvent`：`reasoning_delta`、`reasoning_done`
- [x] 1.2 `llm-client.ts` / `turn-runner` 流式路径解析 thinking 标签并 emit reasoning 事件
- [x] 1.3 单测：mock stream chunk → 断言 emit 序列含 reasoning_delta/done
- [x] 1.4 `ReActContent`：timeline 已展示 reasoning 时跳过重复 thinking 块

## 2. Phase 1 — 时间轴（agent-tool-timeline）

- [x] 2.1 `useAgentEvents`（或等价 hook）维护 turn 内 `{ kind: reasoning|tool|text }` 片段列表
- [x] 2.2 新增 `AgentTimeline` / `TimelineSegment` 组件，按序渲染 interleave
- [x] 2.3 `toolLabelMap` 骨架 + 现有工具人话标签（browser_fetch、shell_exec、fs_* 等）
- [x] 2.4 `getToolRenderer` registry 骨架 + 未知工具 fallback `ToolCallCard`
- [x] 2.5 `ChatWorkspace` 接入 timeline（goal 模式共用）
- [x] 2.6 思考区默认展开 + 耗时展示
- [x] 2.7 单测：tool_call → tool_result 三态

## 3. Phase 2a — Web 工具（agent-tool-enrichment）

- [x] 3.1 注册 `web_search`（Search API 或 browser_fetch 首版）
- [x] 3.2 注册 `web_fetch`（共享 browser_fetch 实现 + redirect 处理）
- [x] 3.3 `SearchToolRenderer`、`WebFetchRenderer`

## 4. Phase 2b — 导航与编辑（agent-tool-enrichment）

- [x] 4.1 注册 `grep`（ripgrep，工作区内）
- [x] 4.2 注册 `glob`（路径模式匹配）
- [x] 4.3 注册 `fs_list`（目录列表，补齐 prompt 已提及项）
- [x] 4.4 注册 `fs_edit`（精确替换 / patch 语义 + diff 捕获）
- [x] 4.5 `GrepRenderer`、`GlobRenderer`、`ListDirRenderer`、`EditFileRenderer`
- [x] 4.6 单测：grep/glob/fs_edit 边界（无匹配、多匹配拒绝）

## 5. Phase 2c — 可视化与交付（agent-tool-enrichment）

- [x] 5.1 注册 `read_me(module)` — diagram/mockup/interactive/chart/art 设计指南
- [x] 5.2 注册 `show_widget(spec)` — inline widget
- [x] 5.3 注册 `present_artifact(paths?, url?)` — 文件卡 + HTML 预览 + localhost URL
- [x] 5.4 `ReadMeRenderer`、`WidgetRenderer`、`ArtifactRenderer`；widget iframe 沙箱
- [x] 5.5 单测：present 越权路径拒绝

## 6. Phase 2d — 交互、Lint、任务（agent-tool-enrichment）

- [x] 6.1 注册 `ask_user(question, options?)` + UI 回传答案
- [x] 6.2 注册 `read_lints(paths?)` + ReadLintsRenderer
- [x] 6.3 主 agent 工具 schema 暴露 `task`/`task_query`/`task_output`/`task_stop`
- [x] 6.4 `AskUserRenderer`、`TaskToolRenderer`
- [x] 6.5 消除 subagent allowlist ghost 工具审计测试

## 7. Phase 2e — Renderer registry 与标签全集

- [x] 7.1 `toolLabelMap` 覆盖 enrichment 全表（见 design D5）
- [x] 7.2 `getToolRenderer` 注册全部专用 Renderer；Read/Write 增强既有 fs 卡
- [x] 7.3 `ExecuteCommandRenderer` 增强 shell_exec 展示

## 8. Phase 2f — 可选多模态

- [ ] 8.1 （可选）settings 配置后注册 `image_gen` + ImageGenRenderer

## 9. Phase 3 — Prompt 对齐（agent-fact-check-prompt）

- [x] 9.1 更新 `react-prompt.ts`：完整工具表（与 D5 对照表一致）+ 事实类 gate
- [x] 9.2 增加 visualizer 触发规则（对齐 WorkBuddy `<instructions_for_visualizer>` 要点）
- [x] 9.3 增加 present 强制规则（有 viewable deliverable 须 `present_artifact`）
- [x] 9.4 final_answer 自洽 + 更新 `react-prompt.test.ts`

## 10. 样式与验收

- [x] 10.1 `app.css` timeline / 各 tool renderer 样式
- [x] 10.2 `npm run typecheck && npm test` 通过
- [ ] 10.3 锚点 A「广州周末游」：web_search → web_fetch → show_widget → present → 总结
- [ ] 10.4 锚点 B「解释 TCP/IP」：read_me → show_widget 多段 +  prose 间隔
- [ ] 10.5 锚点 C 代码任务：grep/glob → fs_edit → read_lints → present_artifact
