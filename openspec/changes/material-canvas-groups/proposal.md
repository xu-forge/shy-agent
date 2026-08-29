# Proposal: material-canvas-groups

## Why

material-canvas 落地后用户反馈素材界面仍不好用：一行文件数随缩放变化（无法建立稳定的空间记忆）、画布平铺看不到目录层级、打开一个 md 后无法快速翻看其他文档、缺少右键管理入口。参考 MiniMax H3 画布（分组容器 + 可折叠标题胶囊 + 右键菜单）重构素材画布的信息组织。

## What Changes

- **固定列数**：组内恒定 5 列，缩放时组框与卡片整体等比缩放，列数不再随缩放联动（移除 `canvasColumnsFor` 的 scale 依赖）。
- **目录嵌套分组框**：由 `relativePath` 推导分组树，每个目录渲染为可折叠分组框（浅灰圆角容器 +「∨ 名称」标题胶囊），最多三级嵌套（更深的文件归入第三级组）；根目录散文件无框排在画布顶部；折叠状态并入画布状态持久化。
- **lightbox 文档快速切换**：打开可读文档（md/txt/pdf）时提供 ←/→ 键与按钮在当前项目全部可读文档间切换（显示 n/N 序号），右侧固定文档列表（按目录分组、当前高亮）可点选。
- **素材右键菜单**：右键文件 → 重命名 / 在目录中显示 / 用系统打开 / 删除；右键目录 → 重命名 / 删除。删除为高危操作必须弹确认对话框；重命名/删除走新 IPC（路径防穿越沿用 fs-guard），成功后画布即时刷新。

## Capabilities

### New Capabilities

（无——全部在既有 `material-canvas` 能力内演进）

### Modified Capabilities

- `material-canvas`：「自动布局」改为固定 5 列 + 分组容器布局；「画布状态持久化」增加分组折叠状态；新增「目录分组框」「素材右键菜单」「lightbox 文档快速切换」三个 requirement。

## Impact

- **renderer**：`lib/materialLibrary.ts`（分组树推导 + 固定列布局纯函数）；`MaterialCanvas.tsx`（组框渲染/折叠/根文件区/右键锚点）；新组件 `MaterialGroup`、`MaterialContextMenu`、`UiConfirmDialog`；`Lightbox.tsx`（文档序列 + 侧边列表 + ←/→）；`MaterialLibrary.tsx`（重命名/删除动作与刷新）。
- **main**：`projects/fs-guard.ts` 新增 `renameMaterial`/`deleteMaterial`（文件与目录，防穿越）；`ipc.ts` 注册 `projectFileRename`/`projectFileDelete`；`materials/canvas-state.ts` 状态结构加 `collapsed`。
- **shared/preload**：新通道类型与 `window.shy` 方法。
- **测试**：分组树/固定列布局纯函数；rename/delete 防穿越与成功路径；canvas-state 向后兼容（无 `collapsed` 字段的旧文件）。
