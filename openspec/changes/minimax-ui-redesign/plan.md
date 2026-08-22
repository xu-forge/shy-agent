# minimax-ui-redesign Implementation Plan

> **For agentic workers:** 按 tasks.md 逐项实现；规格见 `specs/minimax-layout` 与 `specs/always-authorize`。

**Goal:** 将 shy 渲染层整站视觉对齐 MiniMax Code 截图（左栏 / 空态 / 对话区 + 环境面板），并落地真实可用的「始终授权」开关。保留全部真实功能与既有 IPC 契约，不做项目分组 / 多模型 / git。

**Architecture:** `ModelSettings.autoApproveTools` → `confirm.ts` 闸门自动放行 → 渲染组件切换。左栏 `Sidebar` 重做 + `App` 布局归置 → `ChatWorkspace` 空态与线程重做 + 产出卡片(`listSessionFiles`) → `InspectorPanel` 环境面板样式 → `tokens.css`/`app.css` 分区重写。

**Tech Stack:** React 19、TypeScript、Electron main/preload、vitest、既有 `settingsGet/settingsSet` IPC。

---

## Task 1: 共享与设置（始终授权）

**Maps to:** tasks 1.1–1.4

- [ ] **Step 1:** `shared/ipc.ts` `ModelSettings` 增 `autoApproveTools?: boolean`
- [ ] **Step 2:** `settings/store.ts` `DEFAULTS` 加 `false`，`setSettings` 合并该布尔
- [ ] **Step 3:** `confirm.ts` `createConfirmWaiter` 弹窗前 `getSettings()`；`autoApproveTools` 为真则 `resolve(true)` 返回
- [ ] **Step 4:** 单测 settings 合并与 confirm 放行分支
- [ ] **Commit:** `feat(授权): 始终授权开关与闸门联动`

## Task 2: 左栏重构

**Maps to:** tasks 2.1–2.5

- [ ] **Step 1:** `Sidebar.tsx` 重做：`新建任务` 主按钮 + 搜索框 + 主导航 + 会话列表 + 底部账户卡
- [ ] **Step 2:** `App.tsx` 适配新签名与布局
- [ ] **Step 3:** 保留 onNewSession / onSelectSession / onToggleTheme / onOpenSettings / ipcOk
- [ ] **Commit:** `feat(UI): 左栏对齐 MiniMax`

## Task 3: 空态主页

**Maps to:** tasks 3.1–3.4

- [ ] **Step 1:** `ChatWorkspace` 空态：居中 logo + 标语 + 大输入框 + 选项行
- [ ] **Step 2:** 选项行 `+` / `始终授权` toggle / 模型徽标 / 发送
- [ ] **Step 3:** 功能 pills 用 `SUGGESTIONS`
- [ ] **Commit:** `feat(UI): 空态主页对齐 MiniMax`

## Task 4: 对话区与产出卡片

**Maps to:** tasks 4.1–4.6

- [ ] **Step 1:** 线程 / 工具卡片样式
- [ ] **Step 2:** 产出「已编辑文件」卡（`listSessionFiles` write 汇总）
- [ ] **Step 3:** Composer 图三风格
- [ ] **Step 4:** `/` 命令菜单（移除 `ModeToggle`；模式 + 技能过滤与插入）
- [ ] **Step 5:** `InspectorPanel` 环境面板样式
- [ ] **Commit:** `feat(UI): 对话区、命令菜单与环境面板对齐 MiniMax`

## Task 5: 样式与令牌

**Maps to:** tasks 5.1–5.3

- [ ] **Step 1:** `tokens.css` 令牌化色板/圆角/间距
- [ ] **Step 2:** `app.css` 分区重写
- [ ] **Step 3:** 各既有视图回归检查
- [ ] **Commit:** `style(UI): 令牌化与视觉落地`

## Task 6: 验收

**Maps to:** tasks 6.1–6.3

- [ ] **Step 1:** `npm run typecheck`
- [ ] **Step 2:** `npm test`
- [ ] **Step 3:** 对照 brainstorm 验收锚点手工点验
- [ ] **Commit:**（若有修测）`test(UI): 补充覆盖`

---

## 不做

- 项目分组 / 项目树持久化
- 多模型真正的切换（仅展示）
- 分支 / git / 本地远端模式 / 打开终端
- 文件变更事件真实数据源（产出卡仅 `listSessionFiles` 汇总）
- 网站 / 连接手机 / 远程控制
