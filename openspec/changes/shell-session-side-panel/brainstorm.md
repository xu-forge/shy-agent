# Brainstorm: shell-session-side-panel

> 来源：Mavis 与用户的口头澄清（2026-08-10），结论已收敛。

## 1. 动机

`finalize-agent-product` 已把核心能力（LangGraph、记忆、Skills、剪贴板）收敛。但 renderer 仍存在两处明显短板：

- **MemoryView / SkillsView 偏朴素**：可用，但视觉层次、信息密度、交互细节都偏简陋，撑不起产品级体验。
- **会话工作区缺少上下文侧栏**：用户在做长任务时只能看 chat 滚屏，没法快速回看「目标 checklist、本次会话动过哪些文件、Agent 临时列的子任务」——而这正是 Codex / Cursor 类工具的标配。

## 2. 范围

### In
- **MemoryView 升级**：保留 CRUD 能力；加搜索、过滤（来源/标签）、分类、批量选择；视觉与 tokens 对齐。
- **SkillsView 升级**：保留 CRUD；list 区加搜索/排序；编辑器加 frontmatter 实时预览、语法高亮（可选）、保存校验。
- **会话右侧可折叠面板**（默认收起）：含「任务」与「文件」两个 tab。
- **后端文件追踪**：computer.ts 中所有读/写类工具（read_file / write_file / edit_file / copy / move / delete）在成功后打点，存入 SQLite。
- **Agent 动态任务事件**：新增 `task` 事件，独立于 `checklist`；Agent 在交互/目标模式下都可推送。
- 顺手修小瑕疵（错字、类名、重复样式、`window.confirm` 替换为 ConfirmDialog 等）。

### Out（明确不做）
- 暗色模式
- 设置面板分组改造
- ChatWorkspace 主体重写
- 文件内容预览（只列路径 + 元信息，不渲染内容）
- 文件系统树（不做 workspace 级别浏览）

## 3. 主要决策（已决）

| # | 决策 | 选定方案 |
|---|------|----------|
| D1 | 任务列表来源 | 复用 goal 模式 checklist + 新增 `task` 事件（独立） |
| D2 | 文件列表来源 | 后端追踪本次会话读/写过的文件，存 DB |
| D3 | 文件追踪粒度 | **本期**:全操作打点 read/write/delete（builtin.ts 现有工具）；edit/copy/move 待 builtin 添加工具后扩展 |
| D4 | 任务事件机制 | 新增独立 `task` 事件（不复用 checklist） |
| D5 | 任务持久化 | 存 SQLite（session_tasks 表），可随会话恢复 |
| D6 | 面板形态 | 可折叠，默认收起；顶栏右侧切换按钮 |
| D7 | 面板 tab | 「任务」「文件」两个 tab；可独立计数角标 |

## 4. 跨系统依赖

| 依赖 | 状态 | 备注 |
|------|------|------|
| `src/main/agent/tools/computer.ts` | ready | 在 read/write/edit 等函数内埋点即可 |
| `src/main/agent/graph.ts` | ready | 新增 emit `task` 事件，保留原 checklist 流 |
| `src/main/memory/db.ts` | ready | 新增 `session_files` / `session_tasks` 表 |
| `src/main/ipc.ts` | ready | 新增 `session:files:list` / `session:tasks:list` 端点 |
| `src/preload/index.ts` | ready | 暴露 IPC 到 renderer |
| Tokens (styles/tokens.css) | ready | 复用现有 token，不新增主题 |

## 5. 验收标准

1. MemoryView 改版后 CRUD 功能等价（不破坏现有 IPC 协议），视觉显著提升。
2. SkillsView 改版后 CRUD 功能等价，编辑器/列表交互更顺手。
3. 顶栏新增「侧栏」切换按钮，可折叠/展开右侧面板；默认收起。
4. 目标模式下：右侧「任务」tab 显示 `checklist`（含勾选态、证据），实时跟随 graph 推送。
5. 交互/目标模式下：Agent 可通过 `task` 事件动态推送子任务；侧栏实时呈现。
6. 任务条目支持：勾选/取消勾选（用户手动改状态可回写 DB）、展开/折叠、删除。
7. 文件 tab 列出本次会话所有 read/write/edit/copy/move/delete 操作过的文件，按时间倒序；同路径多次操作合并显示最新 op + 操作次数。
8. 文件条目支持：复制路径、在系统资源管理器打开（Win: `explorer /select,`；Mac: `open -R`）、从侧栏移除（仅 UI 状态，不删 DB 记录，DB 保留以备审计）。
9. `npm run typecheck && npm test && npm run lint` 全通过。
10. 新增逻辑均有单元测试（DB 增删查、文件追踪埋点、task 事件去重）。

## 6. 风险与权衡

- [Risk] 文件追踪打点遗漏新工具 → Mitigation: 在 `computer.ts` 顶部加注释列出所有需要打点的工具；code review 关注。
- [Risk] 大量文件操作时面板渲染性能 → Mitigation: 同路径合并 + 倒序分页（首批 50 条 + 「加载更多」）。
- [Trade-off] 任务状态由用户手动改写后,Agent 后续 checkpoint 可能覆盖 → 接受；UI 显示「已修改 by user」标记。
- [Trade-off] 任务与 checklist 概念重叠（目标模式下任务 tab 与 ChatWorkspace 顶部 checklist 重复）→ 决定：移除 ChatWorkspace 顶部 checklist，统一在侧栏呈现，避免分叉。

## 7. 对话收敛

最近 3 轮均为「确认选项」「选定 X」，无新分叉。
