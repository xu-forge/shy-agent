# material-canvas-groups Implementation Plan

> **For agentic workers:** 按 tasks.md 逐项实现；规格见 `specs/material-canvas`（delta）。

**Goal:** 素材画布信息组织重构：固定 5 列（缩放整体缩放）、目录三级嵌套分组框（可折叠、持久化）、lightbox 文档快速切换（←/→ + 侧边列表）、文件/目录右键菜单（重命名/删除走确认闸门）。

**Architecture:** `buildMaterialGroups` 纯函数推导分组树 → `MaterialGroup` 递归渲染嵌套框（折叠并入画布状态 JSON）→ 布局固定 5 列 + 组框两级虚拟化判定 → 新 IPC `projectFileRename`/`projectFileDelete`（fs-guard 防穿越）+ `UiConfirmDialog` 确认闸门 → `docSequenceOf` 计算文档序列驱动 lightbox 切换与侧边列表。

**Tech Stack:** 既有栈不变；零新增运行时依赖。

---

## Task 1: IPC 与文件操作

**Maps to:** tasks 1.1–1.4

- [x] **Step 1:** shared 通道与类型
- [x] **Step 2:** fs-guard rename/delete + 防穿越/重名单测
- [x] **Step 3:** ipc 注册 + preload 暴露
- [x] **Step 4:** canvas-state 加 `collapsed`（向后兼容）+ 单测
- [ ] **Commit:** `feat(素材): 重命名与删除 IPC、折叠状态持久化`

## Task 2: 分组布局纯函数

**Maps to:** tasks 2.1–2.3

- [x] **Step 1:** `buildMaterialGroups`（三级/拍平/空目录/根文件）+ 单测
- [x] **Step 2:** 固定 5 列布局与组框矩形 + 单测
- [x] **Step 3:** `docSequenceOf` + 单测
- [ ] **Commit:** `feat(素材): 目录分组树与固定列布局纯函数`

## Task 3: 画布分组渲染

**Maps to:** tasks 3.1–3.3

- [x] **Step 1:** `MaterialGroup`（容器/胶囊/嵌套/折叠）
- [x] **Step 2:** 画布集成 + 两级虚拟化判定
- [x] **Step 3:** 折叠持久化与还原
- [ ] **Commit:** `feat(素材): 目录嵌套分组框与折叠持久化`

## Task 4: 右键菜单与管理动作

**Maps to:** tasks 4.1–4.4

- [x] **Step 1:** `MaterialContextMenu`
- [x] **Step 2:** `UiConfirmDialog` + 删除确认链
- [x] **Step 3:** 重命名弹窗与校验
- [x] **Step 4:** 操作后刷新与 collapsed 前缀同步
- [ ] **Commit:** `feat(素材): 素材右键菜单与重命名删除`

## Task 5: lightbox 文档切换

**Maps to:** tasks 5.1–5.2

- [x] **Step 1:** 文档序列接入 + ←/→ + 序号
- [x] **Step 2:** 侧边列表（目录分组/高亮/直达）
- [ ] **Commit:** `feat(素材): lightbox 文档快速切换`

## Task 6: 样式与验收

**Maps to:** tasks 6.1–6.4

- [x] **Step 1:** 样式令牌化落地
- [x] **Step 2:** `npm run typecheck`
- [x] **Step 3:** `npm test`
- [ ] **Step 4:** 手工点验验收锚点
- [ ] **Commit:**（若有修测）`test(素材): 分组画布相关覆盖`

---

## 不做

- 图一底部工具栏、复制节点、解组、存为资产
- 拖拽挪动文件/分组、多选、拖拽改层级
- 缩略图缓存与虚拟化语义变更
