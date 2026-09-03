# OpenCode Go Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 接入 OpenCode Go 预设，并在聊天输入旁按会话选择模型（`session.model ?? settings.model`）。

**Architecture:** `provider` 存在全局 settings；Go 时 `resolveLlmConfig` 固定 `baseURL`。会话表存可空 `model`。主进程拉 `/v1/models`（失败回退白名单）。Composer 仅在 Go 时把只读 pill 换成选择器并写会话。

**Tech Stack:** Electron main/renderer、现有 OpenAI SDK `chat.completions`、SQLite sessions、vitest、React Settings/ChatWorkspace。

## Global Constraints

- 规格与任务以简体中文为主
- 数据根 `~/.shy`（`SHY_HOME` 可覆盖）
- 仅 chat.completions；不实现 Messages/Responses
- Custom 模式聊天模型控件只读
- 切模型只写会话，不改 `settings.model`
- Go baseURL 固定 `https://opencode.ai/zen/go/v1`

---

## File map

- Create: `src/main/agent/llm-config.ts` — `resolveLlmConfig` / provider 归一化
- Create: `src/main/agent/llm-config.test.ts`
- Create: `src/main/llm/opencode-go-models.ts` — 白名单 + fetch `/v1/models`
- Create: `src/main/llm/opencode-go-models.test.ts`
- Modify: `src/shared/ipc.ts` — `provider`、`SessionSummary.model`、IPC 常量
- Modify: `src/main/settings/store.ts` — 默认与 merge
- Modify: `src/main/sessions/store.ts` — `model` 列与 update
- Modify: `src/main/sessions/store.test.ts`
- Modify: `src/main/ipc.ts`、`src/preload/index.ts`、`src/preload/index.d.ts`
- Modify: `src/main/agent/service.ts`、`goal-driver.ts`、标题/压缩等 LLM 入口
- Modify: `src/renderer/src/components/SettingsPanel.tsx`
- Modify: `src/renderer/src/components/ChatWorkspace.tsx`（及必要 CSS）

---

## Task 1: resolveLlmConfig + provider

**Files:** `src/shared/ipc.ts`、`src/main/settings/store.ts`、`src/main/agent/llm-config.ts`、`llm-config.test.ts`

**Produces:** `normalizeProvider`、`resolveLlmConfig(settings, session?: { model?: string | null })`

- [ ] **Step 1:** 写失败单测：缺 `provider` → custom；Go → baseURL 固定；`session.model` 优先于 `settings.model`
- [ ] **Step 2:** 跑测确认失败
- [ ] **Step 3:** 实现类型、store 默认、`resolveLlmConfig`
- [ ] **Step 4:** `npx vitest run src/main/agent/llm-config.test.ts`
- [ ] **Step 5:** Commit（中文 message，如 `feat(llm): 增加 OpenCode Go provider 解析`）

---

## Task 2: 会话 model 列 + IPC

**Files:** `sessions/store.ts`、`store.test.ts`、`ipc.ts`、preload、`shared/ipc.ts`

**Produces:** `setSessionModel(id, model | null)`；summary 含 `model`

- [ ] **Step 1:** 单测：create 后 model 空；set 后 get/list 可见
- [ ] **Step 2:** `ensureSessionTables` ALTER `model`；读写映射
- [ ] **Step 3:** IPC + preload 暴露
- [ ] **Step 4:** `npx vitest run src/main/sessions/store.test.ts`
- [ ] **Step 5:** Commit（如 `feat(sessions): 会话可持久化 model 覆盖`）

---

## Task 3: 调用点改用 resolveLlmConfig

**Files:** `service.ts`、`goal-driver.ts`、`sessions/title.ts`、compaction/memory 等读 settings 组 LLM 处；相关测试

**Consumes:** Task 1–2

- [ ] **Step 1:** 列出所有构造 `{ baseURL, apiKey, model }` 的调用点并改 helper
- [ ] **Step 2:** 有 sessionId 的路径传入会话 model；更新/补充 mock 测试
- [ ] **Step 3:** `npx vitest run` 相关 agent/session 测试
- [ ] **Step 4:** Commit（如 `refactor(llm): 统一会话 model 解析入口`）

---

## Task 4: Go 模型列表

**Files:** `opencode-go-models.ts`、`.test.ts`、ipc/preload

**Produces:** `listOpenCodeGoModels(apiKey): Promise<{ models: string[]; source: 'remote' | 'fallback' }>`

- [ ] **Step 1:** 单测：fetch 成功解析 id；fetch 抛错 → fallback 白名单非空
- [ ] **Step 2:** 实现 fetch（main 进程 `fetch`/`net.fetch`）+ 短缓存 + 白名单（文档 chat/completions ids）
- [ ] **Step 3:** IPC 接线
- [ ] **Step 4:** `npx vitest run src/main/llm/opencode-go-models.test.ts`
- [ ] **Step 5:** Commit（如 `feat(llm): OpenCode Go 模型列表与回退`）

---

## Task 5: SettingsPanel Provider UI

**Files:** `SettingsPanel.tsx`

- [ ] **Step 1:** Provider 下拉；切换 Go/Custom 显示对应字段
- [ ] **Step 2:** Go：Key + 默认 model；baseURL 只读/自动填入；保存写入 `provider`
- [ ] **Step 3:** 手动点开设置确认 Custom 三字段仍在
- [ ] **Step 4:** Commit（如 `feat(ui): 设置页支持 OpenCode Go 预设`）

---

## Task 6: Composer 选择器

**Files:** `ChatWorkspace.tsx`、`app.css`（若需）

**Consumes:** Task 2–5

- [ ] **Step 1:** 加载 settings.provider；Go 时 pill → select/menu；选项来自 `listOpenCodeGoModels`
- [ ] **Step 2:** onChange → `setSessionModel`；展示 `session.model ?? settings.model`；不写 settings
- [ ] **Step 3:** Custom 只读；不在列表的会话 model 仍显示
- [ ] **Step 4:** 手测两会话切换；Commit（如 `feat(ui): 输入旁按会话选择 Go 模型`）

---

## Task 7: 验收

- [ ] **Step 1:** `npm run typecheck && npm test`
- [ ] **Step 2:** 手测 brainstorm 六条锚点（Go 网关、下拉、双会话、默认、Custom 只读、列表回退）
- [ ] **Step 3:** 勾选 `tasks.md` 对应项；准备 `/opsx:verify` 或 archive
