# Design: convincing-agent-ui

## Context

shy 是 Electron + React Agent 客户端。Agent 运行时三层：**产品层**（`service.ts` 交互段循环 / `goal-driver.ts` 目标推进）→ **工具层**（`graph.invoke()` → `turn-runner` 内层最多 8 轮 LLM↔工具）→ **模型层**（`llm-client.ts` OpenAI-compatible stream）。Renderer 经 IPC `AgentEvent` 订阅流式更新；当前类型见 `shared/ipc.ts`（`assistant_delta`、`tool_call`、`tool_result` 等）。

呈现层已有 `ReActContent`（解析 `<think>` 折叠为「思考 N 次」）与 `ToolCallCard`（时间轴 + 通用 JSON 卡）。Prompt 见 `react-prompt.ts`，允许「简单 Q&A 可直接答」，主 agent 工具列表含 `browser_fetch` 但无 `web_search`。

**WorkBuddy 对标**（`../workbuddy`，解包产物 + docs，非完整 TS 源码）信服感来自四层：

| 层 | WorkBuddy | shy 现状 | 本 change 目标 |
|---|---|---|---|
| **Prompt** | `workbuddy-prompt.tpl`：research 必须 WebSearch/WebFetch；`<agent_loop>` 第 7–8 步强制 present + final_answer 自洽 | `REACT_GUIDE_BLOCK` 允许无工具直答 | Phase 3：`agent-fact-check-prompt` |
| **工具** | WebSearch/WebFetch、Glob/Grep/Read、Edit、read_me/show_widget、present_files、Task*、AskUserQuestion、read_lints | 主 agent 仅 fs/shell/browser；grep/glob/web_* 等为 ghost | Phase 2：`agent-tool-enrichment` 全矩阵 |
| **事件** | ACP：`agent_thought_chunk`、`tool_call`、`tool_call_update`（见 `docs/18-acp-protocol.md` §6） | reasoning 嵌在 assistant 文本；无独立 thought 事件 | Phase 1：`reasoning_delta` 等 |
| **UI** | 按工具名 Renderer（WebSearchRenderer、WidgetRenderer 等，见 renderer 打包 JS） | 通用 `ToolCallCard` + 折叠思考 | Phase 1：timeline + registry |

**用户决策**：先 OpenSpec，分 Phase 1→2→3 实现；不整栈换 `@openai/agents`，不引入完整 ACP。

## Goals / Non-Goals

**Goals:**

- 事实/推荐类问题线程可见：**思考 → 工具步骤 → 中间产物 → 最终答案**，与 WorkBuddy 心智对齐
- Phase 1 在不改工具注册表前提下，最大化现有 `tool_call` / thinking 标签的呈现信服感
- 扩展 `AgentEvent` 向后兼容；旧 renderer 逻辑可渐进迁移
- design 内保留 WorkBuddy↔shy 映射表，供 implement 对照

**Non-Goals:**

- 完整 ACP 协议或 IDE 集成
- 替换 GoalDriver、checkpoint、confirm 闸门、段循环架构
- WorkBuddy 专家中心、MCP 生态全量对齐
- Phase 2f `image_gen` 为可选（需 API key）；未配置则不暴露
- 本轮一次性 implement 全部 Phase 2 不强制（spec 锁定全集，tasks 分子阶段交付）

## Decisions

### D1：四层模型驱动实施顺序

- **选择**：Phase 1 呈现 → Phase 2 工具 → Phase 3 Prompt（与 brainstorm Q4 一致）
- **理由**：UI 先行可立刻改善「已有工具调用」的可读性；工具与 prompt 依赖产品/API 决策，适合 spec 锁定后分批做
- **已考虑 alternative**：仅 Prompt → 行为变但 UI 仍弱；仅 UI → 模型不调工具时空转

### D2：Reasoning 事件 — 解析 stream 而非立刻改模型 API

- **选择**：在 `llm-client` / `turn-runner` 流式路径中，解析 `<think>` / `<thinking>`（及未来模型的 reasoning 字段），emit `reasoning_delta` + `reasoning_done`；renderer 不再仅从最终 assistant 字符串反解析
- **理由**：与现有 MiniMax `<think>` 兼容，改动面小于引入新模型 channel
- **已考虑 alternative**：继续只在 `ReActContent`  post-hoc 解析 → 无法与 tool_call 时间轴 interleave

### D3：时间轴 interleave 策略

- **选择**：`ChatWorkspace`（或 `useAgentEvents`）维护 **turn 内有序片段列表**：`{ kind: 'reasoning' | 'tool' | 'text', ... }`；按 emit 顺序 append，渲染时单条时间轴组件遍历
- **理由**：WorkBuddy/ACP 本质是 session_update 序列；shy 已有 tool 合并逻辑，扩展 kind 即可
- **已考虑 alternative**：assistant 消息内嵌 tool 块 → 与流式 delta 冲突，难维护

### D4：Tool 人话标签 + Renderer Registry

- **选择**：`toolLabelMap`（如 `web_search`→「搜索网页」、`browser_fetch`→「抓取网页」）+ `getToolRenderer(name)` registry；未知工具 fallback `ToolCallCard`
- **理由**：对齐 WorkBuddy 按工具名分支 Renderer；Phase 1 可先映射现有工具名，Phase 2 注册 Search/Widget 组件
- **已考虑 alternative**：全 JSON 卡 → 用户已明确不信服

### D5：Phase 2 工具 — 完整 enrichment 矩阵（非仅 web_search）

- **选择**：按 WorkBuddy `docs/06-function-call-and-tools.md` §8 分类，主 agent 注册下表工具；`browser_fetch` 保留并增加别名 `web_fetch`；消除 subagent allowlist 中的 ghost 工具。

**WorkBuddy ↔ shy 工具对照表（Phase 2 目标）**

| 分类 | WorkBuddy | shy 现状 | shy 目标名 | Renderer |
|---|---|---|---|---|
| Web | WebSearch | ❌ | `web_search` | SearchToolRenderer |
| Web | WebFetch | `browser_fetch` | `web_fetch`（可共享实现） | WebFetchRenderer |
| Read | Read | `fs_read` | `fs_read`（已有） | ReadFileRenderer |
| Read | Glob | ❌ ghost | `glob` | List/GlobRenderer |
| Read | Grep | ❌ ghost | `grep` | GrepRenderer |
| Read | LS | ❌ | `fs_list` | ListDirRenderer |
| Edit | Write | `fs_write` | `fs_write`（已有） | WriteFileRenderer |
| Edit | Edit | ❌ ghost | `fs_edit` | EditFileRenderer |
| Bash | Bash | `shell_exec` | `shell_exec`（已有） | ExecuteCommandRenderer |
| Visual | read_me | ❌ | `read_me` | ReadMeRenderer（折叠） |
| Visual | show_widget | ❌ | `show_widget` | WidgetRenderer |
| Present | present_files | ❌ | `present_artifact` | Artifact/OpenResultRenderer |
| Task | TaskCreate/List/… | `task_*`（主 agent 未全暴露） | 对齐暴露 | TaskToolRenderer |
| Interact | AskUserQuestion | ❌ | `ask_user` | AskUserRenderer |
| Lint | read_lints | ❌ | `read_lints` | ReadLintsRenderer |
| Browser | — | `browser`/`browser_open` | 保留 | BrowserRenderer |
| Multimodal | ImageGen | ❌ | `image_gen`（Phase 2f 可选） | ImageGenRenderer |

- **理由**：用户明确要求「不只是 webSearch」；WorkBuddy 信服感来自每步工具都有专用 UI；shy subagent 已引用 grep/glob/web_* 但未注册，属技术债
- **已考虑 alternative**：只加 web_search → 无法满足「读代码/改文件/问用户/交产物」全链路呈现

### D5b：Phase 2 交付分批

- **选择**：2a Web → 2b Nav/Edit → 2c Visual/Present → 2d Interact/Lint/Task → 2e Renderer 补齐；2f image_gen 可选
- **理由**：单 PR 过大；每批可独立验收 timeline 上的新 Renderer

### D6：Phase 3 Prompt — 事实类 gate

- **选择**：在 `REACT_GUIDE_BLOCK` 增加 **Fact-check gate**：涉及时效、地点、价格、政策、推荐列表等 MUST 先 `web_search` 或 `browser_fetch`；删除或收窄「简单 Q&A 可直接答」；增加 final_answer 须引用工具观测的段落（对齐 WorkBuddy `<final_answer_instructions>`）
- **理由**：根因之一是模型跳过工具；与 Phase 2 工具注册配套
- **已考虑 alternative**：纯 heuristic 前端提示 → 无法约束模型

### D7：不引入 ACP，映射即可

- **选择**：shy 保持 `shy:events` IPC；仅在 design/spec 文档记录 ACP↔shy 事件对照，便于将来桥接
- **理由**：ACP 是 IDE 协议，shy 是独立桌面客户端；整协议成本高
- **对照表**：

| ACP sessionUpdate | shy AgentEvent（目标） |
|---|---|
| `agent_thought_chunk` | `reasoning_delta` |
| `agent_message_chunk` | `assistant_delta` |
| `tool_call` | `tool_call` |
| `tool_call_update` | `tool_result` |

## Risks / Trade-offs

- [Risk] 独立 reasoning 事件与 assistant 文本重复 → Mitigation：`ReActContent` 检测到 timeline 已展示 reasoning 时不再重复折叠块
- [Risk] 强制搜网增加延迟与成本 → Mitigation：Phase 3 prompt 用明确 intent 描述；可选 settings 开关（后续）
- [Risk] Widget HTML  XSS → Mitigation：iframe sandbox + CSP；或 Phase 2 仅允许预定义 schema 的 React widget
- [Trade-off] Phase 1 无 web_search 时事实题仍可能直答 → 接受；Phase 2/3 完成后复验「广州周末游」锚点
- [Trade-off] Phase 2 工具数量多、PR 分批 → 接受；spec 锁定全集，tasks 2a–2f 逐批交付
- [Trade-off] 专用 Renderer 12+ 类 → registry 覆盖主要工具，低频 MCP 仍 fallback

## Migration Plan

1. **Phase 1**：扩展 `AgentEvent` → turn-runner emit → `useAgentEvents` 片段列表 → 新 Timeline 组件；feature 无 DB 迁移
2. **Phase 2**：按 2a→2f 分批注册工具 + Renderer（见 design D5 对照表）
3. **Phase 3**：prompt 变更 + 单测更新 `react-prompt.test.ts`
4. **Rollback**：各 phase 独立 PR；Phase 1 可仅关闭 timeline UI 回退旧 `MessageList` 路径
5. **验收**：固定 prompt「广州周末去哪玩」录屏对比 WorkBuddy 与 shy 线程结构（思考/搜索//widget/总结四段可见）

## Open Questions

- Search API 选型与 API key 存放（`~/.shy/config` vs 环境变量）
- `show_widget` 首版支持 schema 子集（table / cards / map pin）还是任意 HTML
- goal 模式线程是否复用同一 `AgentTimeline` 组件（倾向：是，共用 hook）
