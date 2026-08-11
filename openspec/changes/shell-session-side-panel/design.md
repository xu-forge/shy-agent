# Design: shell-session-side-panel

## Context

`finalize-agent-product` 已将 LangGraph / 记忆 / Skills / 剪贴板等核心能力交付并落档。Renderer 当前的 MemoryView 与 SkillsView 是早期可工作版本，视觉与交互粗糙；会话工作区没有上下文侧栏。本 change 在不破坏现有 IPC 协议与 LangGraph 行为的前提下，升级 UI 并补齐侧栏与文件/任务追踪能力。

## Goals / Non-Goals

**Goals**
- 升级 MemoryView / SkillsView 至产品级视觉与交互（搜索、过滤、批量、视觉细节）。
- 引入会话右侧可折叠面板，默认收起，承载「任务」+「文件」两个 tab。
- 后端文件追踪覆盖 computer.ts 中所有读/写/编辑/复制/移动/删除工具，持久化到 SQLite。
- 新增 `task` 事件作为 Agent 动态任务入口，独立于 goal 模式 checklist。
- 统一 checklist 呈现：移除 ChatWorkspace 顶部 `goal-panel`，所有目标进度在侧栏「任务」tab 中。
- 顺手修小瑕疵（`window.confirm`、类名、重复样式、错字）。

**Non-Goals**
- 暗色模式、设置面板分组改造、ChatWorkspace 主体重写。
- 文件内容预览 / workspace 文件树浏览。
- 任务/文件的导出、归档、跨会话合并。
- 任务依赖关系（DAG）/ 优先级 / 截止日期。

## Decisions

### D1：数据库表设计
- **选择**：`session_files(session_id, op, path, occurred_at)`、`session_tasks(session_id, id, title, done, evidence, source, occurred_at, updated_at)`
- **理由**：与会话同库（memory DB），无跨库复杂度；按 `session_id` 索引。
- **文件同路径合并**：UI 层聚合，DB 仍逐条记录（保留审计）。

### D2：任务事件独立于 checklist
- **选择**：新事件 `task` payload `{ sessionId, kind: 'add' | 'update' | 'remove', id, title?, done?, evidence? }`
- **理由**：checklist 是「目标模式完整清单」的语义，task 是「Agent 动态子任务」的语义，概念不同；统一存储在 `session_tasks` 表，`source ∈ {'goal', 'agent'}` 区分。
- **回写策略**：用户在 UI 改 done 后，写回 DB；后续 Agent emit 同 id 的 `update` 事件**覆盖**用户改动（保持 Agent 权威），UI 显示「已被 Agent 更新」角标 1.5s。

### D3：文件打点位置
- **选择**：在 `builtin.ts` 工具的「成功返回前」插入 `recordFileOp(sessionId, op, path)`；op 类型从工具名派生（`fs_read` → `read`、`fs_write` → `write`、`fs_delete` → `delete`）
- **理由**：所有路径都过 main 端工具函数，统一埋点最简；不在 LangGraph 中转层打点以免漏掉非工具调用的写入（如 Agent 直接 shell 命令）。**本期范围**：read/write/delete 三个 op；edit/copy/move 等 builtin 添加工具后再扩展。
- **TBD**（见 Open Questions）：shell 类工具是否一并追踪？

### D4：侧栏形态
- **选择**：右侧固定宽 320px；顶栏右上「侧栏」图标按钮（与 Settings 按钮同区）切换；面板顶部 tab 栏「任务 (N) | 文件 (M)」
- **理由**：可折叠 + 默认收起避免侵占 760px 内容区；任务/文件计数让用户知道有未看项。
- **状态持久化**：面板展开/收起状态存 `localStorage`（按用户偏好）。

### D5：MemoryView 升级
- **选择**：顶部 sticky 工具栏：搜索框 + 来源过滤（全部 / 用户 / Agent）+ 排序（更新时间/创建时间/标题）+ 「批量选择」按钮。卡片列表：左侧 checkbox、主体保持现有 card-like 结构、增加标签 chips（暂用 tags 字段）、hover 出现「编辑 / 删除 / 复制 ID」。编辑态切到右侧 drawer（避免跳转打断列表）。
- **理由**：信息密度提升同时不破坏现有浏览节奏；drawer 模式让编辑/查阅连续。

### D6：SkillsView 升级
- **选择**：保持 split 布局（list + editor），但 list 加搜索框 + 「按更新时间/创建时间/名称」排序；editor 上方加 frontmatter 实时预览条（解析 `name` / `description` 显示在 textarea 上方）；保存按钮在未修改时 disabled。
- **理由**：改动小、收益直观；frontmatter 预览帮助 Agent 写的技能立刻看见效果。

### D7：小瑕疵
- 替换所有 `window.confirm` / `confirm()` 为 `ConfirmDialog` 模态（已存在组件）。
- 类名统一：把 `.card-like` 收编为 `.card`；删除未使用的 `.evidence` 等。
- 错字（`occured` → `occurred` 等）：code review 时发现即时修。

## Risks / Trade-offs

- [Risk] 文件打点遗漏新工具 → Mitigation: 在 `computer.ts` 顶部加 JSDoc 列出需打点工具集合；新工具 PR review 必查。
- [Risk] 长会话文件表膨胀 → Mitigation: 50 条分页 + 同路径合并展示；DB 不裁剪。
- [Trade-off] Agent 覆盖用户手动改写任务 → UI 角标 1.5s 提示 + changelog 记录；可接受。
- [Trade-off] ChatWorkspace 顶部 checklist 移走 → 任务 tab 与聊天消息分屏注意力分散；接受。
- [Trade-off] 侧栏 drawer 模式编辑 Memory → 学习成本 + 实现复杂度；接受，因信息密度提升明显。

## Migration Plan

- DB：新增表，向后兼容（旧 DB 直接打开，无破坏）。
- IPC：仅新增端点，不改既有端点签名。
- 现有 MemoryView / SkillsView 行为：保留所有 IPC 调用（`listMemory` / `upsertMemory` / `deleteMemory` / `listSkills` / `readSkill` / `writeSkill` / `deleteSkill`），仅 UI 重做。
- 现有 `goal-panel`：从 ChatWorkspace 移除，但其数据流（`goal` / `checklist` 事件）保留，仍由侧栏「任务」tab 消费。

## Open Questions

1. **Q1**：shell / PowerShell 工具类（`run_command`）是否也纳入文件追踪？若 Agent 跑 `rm file.txt`，是否算一次 delete？**倾向**：暂不纳入（解析复杂且与现有 op 类型不一致），列为后续 change。
2. **Q2**：任务删除是否需要二次确认？**倾向**：需要（用 ConfirmDialog 替换 `confirm()`）。
3. **Q3**：MemoryView drawer 模式 vs 现有顶部编辑表单 → 决定 drawer。后续若用户反馈再回退。
