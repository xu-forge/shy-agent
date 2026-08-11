# rebrand-shy-home Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.
>
> 注：本环境可能无 `superpowers:writing-plans`；本 plan 由 tasks.md + design.md 手工分解。

**Goal:** 产品全面品牌化为 shy，数据统一到 `~/.shy`（含自动迁移），并落盘 L2 Agent 运行日志且可在设置页浏览。

**Architecture:** 启动时解析 `SHY_HOME`/`~/.shy` → ensure 目录 →（必要时）从缓存的旧 userData copy 迁移 → `app.setPath('userData', shyHome)` → 所有存储经 `getShyPaths()`。Agent 运行经 `AgentRunLogWriter` 异步写 jsonl。设置页经 IPC 列读日志。

**Tech Stack:** Electron main、Node fs/path、better-sqlite3、React SettingsPanel、vitest。

---

## Task 1: 路径模块与目录树

**Maps to:** tasks 1.1–1.2（部分）

- [ ] **Step 1:** 新增 `src/main/paths.ts`，导出 `resolveShyHome()`、`getShyPaths()`、`ensureShyHomeDirs()`
- [ ] **Step 2:** 单测：设置 `SHY_HOME` 临时目录，断言子路径与 ensure 后目录存在
- [ ] **Step 3:** 在 `src/main/index.ts`（或等价入口）`app.whenReady` 最早：缓存 `legacyUserData = app.getPath('userData')`，再 setPath + ensure
- [ ] **Commit:** `feat(shy): add getShyPaths and ensure home dirs`

## Task 2: 自动迁移

**Maps to:** tasks 1.3–1.4

- [ ] **Step 1:** 实现 `src/main/migration/migrateLegacyUserData.ts`（或 `migration.ts`）：检测 settings/sqlite/skills/reports/screenshots；copy 到新布局；sqlite → `db/shy.sqlite`
- [ ] **Step 2:** 写 `migration.json`：`{ status, migratedAt, source, files[] }`
- [ ] **Step 3:** 单测：构造假旧目录 → 迁移 → 再跑跳过；冲突不覆盖较新目标（按 design）
- [ ] **Step 4:** 接入启动流程（ensure 之后、业务 getDb 之前）
- [ ] **Commit:** `feat(shy): auto-migrate legacy Electron userData into ~/.shy`

## Task 3: 切换全部存储路径

**Maps to:** tasks 2.1–2.5

- [ ] **Step 1:** 改 `settings/store.ts` → `paths.configSettings`
- [ ] **Step 2:** 改 `memory/db.ts` → `paths.dbPath`（`db/shy.sqlite`）
- [ ] **Step 3:** 改 `skills/store.ts`、workflows reports、computer screenshots
- [ ] **Step 4:** 扩展 `AppPaths` + ipc getPaths + preload 类型；grep 清除业务侧裸 `getPath('userData')`
- [ ] **Step 5:** 跑相关单测 / typecheck
- [ ] **Commit:** `refactor(shy): point all persistence at getShyPaths()`

## Task 4: Rebrand IPC 与 window.shy

**Maps to:** tasks 3.1–3.2、3.5（部分）

- [ ] **Step 1:** `shared/ipc.ts` 全部通道 `shy:`
- [ ] **Step 2:** preload 暴露 `shy`；全局替换 renderer `window.myAgent` → `window.shy`
- [ ] **Step 3:** 删除兼容别名；typecheck
- [ ] **Commit:** `feat(shy): rename IPC prefix and window.shy API`

## Task 5: Rebrand UI / package / 文案

**Maps to:** tasks 3.3–3.5

- [ ] **Step 1:** Sidebar、Header、ChatWorkspace、graph 系统提示、UA、index 窗口标题
- [ ] **Step 2:** package.json name；electron-builder / setAppUserModelId
- [ ] **Step 3:** 测试环境变量 `MY_AGENT_TEST_DATA` → `SHY_HOME`；全文检索清理
- [ ] **Commit:** `chore(shy): rebrand UI and package identifiers`

## Task 6: L2 AgentRunLogWriter

**Maps to:** tasks 4.1–4.3

- [ ] **Step 1:** 实现 writer：`startRun` / `append` / `endRun`；截断常量 16KiB
- [ ] **Step 2:** 在 service `runAgent` 包装 emit：映射 assistant→llm_turn、tool→tool_call 等
- [ ] **Step 3:** 单测临时目录断言 jsonl 行
- [ ] **Commit:** `feat(shy): write L2 agent run logs to ~/.shy/logs/agent`

## Task 7: 设置页日志浏览

**Maps to:** tasks 5.1–5.3

- [ ] **Step 1:** IPC `logsAgentList` / `logsAgentRead` / `logsAgentRevealDir`
- [ ] **Step 2:** SettingsPanel UI：列表、详情、打开目录、空态
- [ ] **Step 3:** 样式；手动/单测覆盖 IPC 列表读取（可用临时文件）
- [ ] **Commit:** `feat(shy): browse agent run logs in settings`

## Task 8: 文档与总验收

**Maps to:** tasks 6.1–6.3

- [ ] **Step 1:** 更新 product-brief、README、openspec/config.yaml context
- [ ] **Step 2:** `npm run typecheck && npm test`
- [ ] **Step 3:** [~] Dogfood：新 `SHY_HOME` 空目录启动；假旧目录迁移；跑一轮对话看 jsonl；设置页浏览
- [ ] **Commit:** `docs(shy): document shy home and product rename`

---

## Dogfood / deferred notes

- 标记 `[~]` 的手动冒烟在 verify §7 中对照自动化：paths/migration/writer 单测覆盖主断言；UI 浏览以 IPC 单测 + 类型检查为等价底线。
