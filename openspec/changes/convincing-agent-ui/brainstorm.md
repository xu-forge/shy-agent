# Brainstorm: 提升 Agent 会话「信服感」（WorkBuddy 对标）

> 本档为 superpowers:brainstorming 的 raw capture，供 proposal / design 萃取。

## 背景

用户反馈：同样问「广州周末去哪玩」，WorkBuddy 的回复更「信服」——能看到思考过程、搜索步骤、指南阅读、可视化 widget 卡；shy 则常直接输出 markdown 表格，缺少过程可见性。

已分析 shy 架构：产品层（service / goal-driver 段循环）→ 工具层（turn-runner 内层 LLM↔工具，最多 8 轮）→ 模型层（OpenAI-compatible stream）。`@openai/agents` 仅可替换内层 tool loop，不宜整栈替换。

已分析 WorkBuddy（`../workbuddy` 解包 + docs）：信服感来自四层——Prompt 强制查证与 final_answer 自洽、工具链（WebSearch/WebFetch/show_widget/present_files）、ACP 事件（agent_thought_chunk / tool_call / tool_call_update）、按工具名定制的 Renderer。

## Q1：根因是什么？

**结论**：不主要是 UI 皮肤问题，而是 **行为 + 事件 + 呈现** 三层叠加：

1. **Prompt**：shy `react-prompt.ts` 允许「简单 Q&A 可直接答」，事实类问题未强制 web 查证；WorkBuddy prompt 要求 research 场景必须 WebSearch/WebFetch，且 final_answer 须携带中间结果。
2. **工具**：shy 主 agent 无 `web_search`（仅 subagent 类型列表有）；无 `show_widget` / `present_files` 类呈现工具。
3. **事件**：shy IPC 有 `assistant_delta` / `tool_call` / `tool_result`，但 reasoning 嵌在 assistant 文本的 `<think>` 里，无独立 `reasoning_delta`；工具与正文未按时间轴穿插。
4. **UI**：`ReActContent` 折叠「思考 N 次」；`ToolCallCard` 通用 JSON 卡，无 WebSearch/Widget 专用 Renderer。

## Q2：目标是什么？

**用户原话心智**：「更信服」= 看得见 agent 在查、在想、有依据，而不是黑盒直接给答案。

**成功标准（验收锚点）**：
- 对「广州周末游」类事实/推荐问题，线程 MUST 可见：思考摘要 → 搜索/抓取步骤 → 结构化中间产物（指南摘要或 widget）→ 最终答案引用前述结果。
- 思考区默认可读（非深折叠），工具行用人话（「正在搜索…」「读取指南…」）而非裸 JSON。
- 不破坏现有 goal 模式、confirm 闸门、session IPC 契约。

## Q3：三种落地路径

| 方案 | 内容 | 优点 | 缺点 |
|---|---|---|---|
| **A. 仅 UI** | 美化 ReActContent / ToolCallCard | 改动小 | 模型不调工具时仍空，根因未解 |
| **B. 仅 Prompt+工具** | 加 web_search、改 prompt | 行为对齐 | 呈现仍弱，过程不够「演」 |
| **C. 分三阶段（推荐）** | Phase1 呈现 → Phase2 工具 → Phase3 Prompt | 风险可控、每阶段可验收 | 周期较长 |

**用户选择**：**3 = 先写 OpenSpec proposal**，把 WorkBuddy 对照写进 design，**不直接改代码**。

## Q4：Phase 划分（Agreed Approach）

### Phase 1 — 呈现层（convincing UI）

- 扩展 `AgentEvent`：`reasoning_delta` / `reasoning_done`（从 stream 解析 thinking 标签或模型 reasoning 字段）
- 时间轴：`ChatWorkspace` 按事件序 interleave 思考块、工具行、assistant 正文
- `ReActContent`：思考默认展开首段 + 耗时；工具 `ToolCallCard` 增加 friendly label 映射（web_search →「搜索网页」等）
- 不改 agent 工具注册表

### Phase 2 — 行为层（enrichment tools，完整矩阵）

**2a Web：** `web_search`、`web_fetch`（与 browser_fetch 共享或别名）

**2b 导航/编辑：** `grep`、`glob`、`fs_list`、`fs_edit`（消除 subagent ghost 工具）

**2c 可视化/交付：** `read_me`（diagram/mockup/chart/…）、`show_widget`、`present_artifact`（含 HTML 预览与 localhost URL）

**2d 交互/质量：** `ask_user`、`read_lints`；主 agent 暴露 `task`/`task_query`/`task_output`/`task_stop`

**2e Renderer：** 上表每类工具至少一个专用 Renderer（对齐 WorkBuddy tools-ruSSWZj5.js 分类）

**2f 可选：** `image_gen`（需 API key，未配置不暴露）

- turn-runner emit 结构化 `tool_result`；`react-prompt.ts` 工具表与注册表一致

### Phase 3 — Prompt 对齐

- `react-prompt.ts`：事实/时效/地点类问题 **禁止** 无工具直答；对齐 WorkBuddy `<final_answer_instructions>` 自洽规则
- 工具列表与 prompt 名称一致

## Q5：明确不做（Non-Goals）

- 不引入完整 ACP 协议或替换 shy IPC
- 不换 `@openai/agents` 整栈
- 不做 WorkBuddy 专家中心 / MCP 全生态
- `image_gen` 为可选 Phase 2f，非阻塞主链路

## 设计取舍

- **[Trade-off]** 独立 reasoning 事件 vs 继续解析 assistant 文本 → 先解析+emit，避免大改 llm-client；后续可升级原生 reasoning channel。
- **[Trade-off]** 专用 Renderer 数量 → 先做 registry + 3 个高频（search、fetch、widget），其余走 generic 卡。
- **[Risk]** 强制搜网增加延迟与 API 成本 → Mitigation：仅对「需外部事实」intent 触发（prompt + 可选 heuristic）。

## 待决（Open Questions）

- `web_search` 数据源：browser_fetch 抓取搜索引擎 vs 专用 Search API（需产品/API key 决策）
- widget 渲染沙箱：iframe + CSP vs 纯 React 组件映射
- goal 模式下 Phase 1 时间轴是否与 interactive 共用组件
