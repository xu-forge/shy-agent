# active-file-context Implementation Plan

> **For agentic workers:** 按 tasks.md 逐项实现；规格见 `specs/active-file-context`。

**Goal:** 发消息时把代码激活 tab 或素材 lightbox 当前文件的相对路径隐式带给模型；有关则 `fs_read`，无关忽略；不污染用户消息历史。

**Architecture:** UI 上报 `activeView` → `ChatRequest` → 本轮 `RunArgs` 快照 → `activeFileReminderProvider` 输出 `<active-file>`。

**Tech Stack:** 既有栈；零新依赖。

---

## Task 1: 协议与 reminder

**Maps to:** tasks 1.1–1.3

- [x] **Step 1:** `ChatRequest.activeView` 类型（shared + preload）
- [x] **Step 2:** provider + registry + 单测
- [x] **Step 3:** service / turn-runner 传入快照，消息落库仍为原文
- [x] **Commit:** `feat(agent): 会话可携带当前查看文件提示`

## Task 2: Renderer 上报

**Maps to:** tasks 2.1–2.3

- [ ] **Step 1:** CodeWorkspace 回调 activePath
- [ ] **Step 2:** MaterialLibrary lightbox 路径回调
- [ ] **Step 3:** App 汇总，ChatWorkspace 发送时带上
- [ ] **Commit:** `feat(ui): 代码 tab 与素材 lightbox 上报正在看的文件`

## Task 3: 验收

**Maps to:** tasks 3.1–3.3

- [ ] **Step 1:** `npm run typecheck`
- [ ] **Step 2:** `npm test`
- [ ] **Step 3:** 手工点验验收锚点

---

## 不做

- 自动 `@` 芯片、全文进用户消息
- 画布选中未打开、多 tab 一并注入、图像像素理解
