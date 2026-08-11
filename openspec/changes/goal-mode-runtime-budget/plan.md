# Goal-Mode Runtime Budget Implementation Plan

**Goal:** goal mode 支持长跑数天——移除业务轮次限制，护栏收敛为 token 预算 + 工具级停滞，并用段式自动续跑 + 持久化 checkpoint 支撑跨天/跨重启。

**Architecture:** 外部段式循环 + 单段 LangGraph invoke；段尾落盘 goal/checklist/shortMemory/tokenUsed，未完成自动续段；recursionLimit 改为大常量保险丝。

**Tech Stack:** LangGraph、LangChain OpenAI-compatible、Electron IPC、SQLite、TypeScript。

## Task 1: 数据模型与设置

- [ ] shared/ipc.ts：GoalChecklistItem.check?、ModelSettings.tokenBudget?；移除 recursionLimit/hardRoundCap
- [ ] settings/store.ts：默认 tokenBudget=400000；移除两字段

## Task 2: 图运行时

- [ ] graph.ts：AgentState 增加 tokenUsed / lastToolActivity
- [ ] graph.ts：act/verify 累计 usage_metadata
- [ ] graph.ts：tools 节点记录活动；verify 停滞判定细化
- [ ] graph.ts：routeAfterVerify token 预算软暂停；移除 hardRoundCap
- [ ] graph.ts：GraphBudget 增加 tokenBudget / segmentSteps；移除 hardRoundCap

## Task 3: 段式续跑循环（service）

- [ ] service.ts：persistSegment 段尾落盘
- [ ] service.ts：外部循环——单段 invoke → 未完成自动续段
- [ ] service.ts：段间压缩 shortMemory + 注入 resume prompt
- [ ] service.ts：recursionLimit 改大常量；移除设置读取

## Task 4: UI 与测试

- [ ] SettingsPanel.tsx：token 预算输入；移除 recursionLimit/hardRoundCap 输入
- [ ] graph.test.ts：预算停止 / 停滞判定 / check 透传 / 段循环
- [ ] npm run typecheck && npm test
