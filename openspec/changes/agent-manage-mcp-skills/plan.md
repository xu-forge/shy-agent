# Agent 管理 MCP/Skill Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** 让用户用一句话（URL/JSON）经 Agent 增删 MCP、启停/删 Skill，写配置后立即生效。

**Architecture:** 在 builtin 工具层封装既有 `mcp` config/store + `McpManager.applyConfig` 与 skills `setSkillEnabled`；删除/禁用走 `confirmHighRisk`。另 seed 管理 skill，约束「list → 解析 URL/JSON → ask_user → 正式工具」。

**Tech Stack:** Electron main、既有 MCP/skills store、confirm 闸门、vitest、SKILL.md seed。

**Specs:** `openspec/changes/agent-manage-mcp-skills/specs/{agent-mcp-config,agent-skill-lifecycle,integration-manager-skill}/spec.md`

**关键文件（预期）：**
- `src/main/mcp/config.ts` / `manager.ts` — 复用读写与 apply
- `src/main/agent/tools/builtin.ts` — 注册 `mcp_*`、`skill_set_enabled`
- `src/main/skills/store.ts` — 启停 API
- `src/main/skills` builtin seed — `manage-integrations`
- 对应 `*.test.ts`

---

## Task 1: MCP Agent 工具

**Files:** `src/main/agent/tools/builtin.ts`, 新测或扩展 `builtin.test.ts` / `mcp` 相关 test

- [ ] **Step 1:** 写失败测试：`mcp_upsert` 应写入配置并触发 apply（mock manager）
- [ ] **Step 2:** 实现 `mcp_list` / `mcp_upsert`（读 get/set config + applyConfig）
- [ ] **Step 3:** 实现 `mcp_remove` + `mcp_set_enabled`；remove/禁用调用 `confirmHighRisk`
- [ ] **Step 4:** 注册工具名与描述；跑 vitest 相关用例通过
- [ ] **Step 5:** Commit：`feat(agent): 添加 mcp 配置工具并接入确认闸门`

## Task 2: Skill 启停工具

**Files:** `src/main/agent/tools/builtin.ts`, skills store, tests

- [ ] **Step 1:** 写失败测试：禁用需确认；启用免确认并更新 enabled 列表
- [ ] **Step 2:** 实现 `skill_set_enabled` 调既有 store
- [ ] **Step 3:** 更新过时文案（如 skill_delete「没有 disable」）
- [ ] **Step 4:** 测试通过并 Commit：`feat(agent): 支持 skill_set_enabled`

## Task 3: 管理 Skill seed

**Files:** skills-builtin 或等价 seed 目录下 `manage-integrations/SKILL.md`

- [ ] **Step 1:** 编写 SKILL.md（流程、禁止臆造包名、工具名对照）
- [ ] **Step 2:** 确认 seed/安装路径使 `skill_list` 可见
- [ ] **Step 3:** Commit：`feat(skills): 添加 manage-integrations 引导 skill`

## Task 4: 验收

- [ ] **Step 1:** `npm run typecheck` + 相关 vitest
- [ ] **Step 2:** 手工：JSON upsert、URL 缺字段 ask_user、remove 确认拒绝
- [ ] **Step 3:** 勾选 `tasks.md`；准备 `/opsx:verify`
