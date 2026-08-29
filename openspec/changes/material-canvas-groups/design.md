# Design: material-canvas-groups

## Context

material-canvas 已交付：无限画布（平移/缩放/虚拟化）、缩略图缓存、lightbox、状态持久化。当前痛点：`canvasColumnsFor` 把列数与 scale 绑定（缩放即重排，无空间记忆）；`listMaterials` 平铺所有文件无目录感；lightbox 单文档孤立；无管理入口。用户参照 MiniMax H3 画布给出目标形态：分组容器 + 可折叠标题胶囊 + 右键菜单。素材量级上千、目录层级最深按三级设计。

## Goals / Non-Goals

**Goals:**

- 组内固定 5 列，缩放整体等比缩放，列数恒定。
- 目录 → 可折叠嵌套分组框（最多三级），根文件无框散放顶部。
- lightbox 内 ←/→ 与按钮切换项目全部可读文档（md/txt/pdf），附按目录分组的侧边列表与 n/N 序号。
- 文件/目录右键菜单：重命名、在目录中显示、用系统打开、删除（确认闸门）；操作后画布即时刷新。

**Non-Goals:**

- 不做图一底部工具栏、复制节点、解组、存为资产。
- 不做拖拽挪动文件/分组、多选、拖拽改层级。
- 不改缩略图缓存与虚拟化的既有语义。

## Decisions

### D1：固定 5 列布局

- **选择**：布局纯函数改为固定 `CANVAS_COLUMNS = 5`；组框世界宽度 = 5×卡宽 + 4×gap + 容器 padding，组内卡片 mtime 倒序按行铺。缩放仍走画布 transform（组框与卡片一起等比缩放），`canvasColumnsFor` 删除 scale 参数（或整体移除）。
- **理由**：用户确认 5 列；稳定列数建立空间记忆，缩放只改视觉大小不改排布。
- **已考虑 alternative**：列数随容器宽度自适应 → 拒绝（用户明确固定）。

### D2：分组树推导（纯函数）

- **选择**：`buildMaterialGroups(items): MaterialGroupNode`。`relativePath` 按 `/` 分段建目录树；深度 ≤3 级目录各成一组框，第 3 级以深的文件拍平归入第 3 级组；组内文件按 mtime 倒序（与现规则一致）；根文件（无目录段）单独返回，不进组。纯函数输出 `{ rootFiles, groups: 树 }`，单测覆盖三级嵌套/拍平/空目录剔除。
- **理由**：`listMaterials` 已提供相对路径，无需 IPC 改动；纯函数可测。

### D3：分组框渲染与折叠

- **选择**：新组件 `MaterialGroup`：浅灰圆角容器（`--bg-soft` 底、radius 16、内 padding）+ 标题胶囊（「∨ 名称」，图一样式）点击折叠/展开；折叠后仅剩标题胶囊（高度收缩）。布局为树形递归：子组框在父框内容器内垂直堆叠，组内文件网格固定 5 列。折叠状态 `collapsed: string[]`（目录 relativePath 集合）并入画布状态 JSON，随现有防抖写入持久化；旧状态文件无该字段按「全展开」兼容。
- **理由**：对齐图一视觉；状态持久化沿用 material-canvas 通道，无新 IPC。
- **已考虑 alternative**：折叠持久化到 localStorage → 拒绝（与既有 per-project 状态文件割裂）。

### D4：lightbox 文档快速切换

- **选择**：`MaterialLibrary` 计算 `docSequence`：当前项目全部 `kind=doc` 且扩展名 ∈ {md,txt,pdf} 的素材，按目录分组、组内 mtime 倒序的序列；打开任一 doc 时把序列与当前 index 传入 `Lightbox`。Lightbox：←/→（window keydown，输入态不拦）+ 底部 ‹ › 按钮切换，顶栏显示 `n/N`；右侧固定文档列表（宽 ~220px，按目录分组展示文件名，当前项高亮）点击切换；Esc 仍关闭。非文档类型打开时列表与切换不出现。
- **理由**：用户确认「切换+列表」且范围为全部文档；序列纯计算可测。

### D5：右键菜单与重命名/删除 IPC

- **选择**：新组件 `MaterialContextMenu`（画布内 absolute 定位，点外/Esc 关闭）：文件项 = 重命名 / 在目录中显示（复用 `projectReveal`）/ 用系统打开（复用 `projectFileOpen`）/ 删除；目录项 = 重命名 / 删除。重命名采用行内输入（卡片/标题处就地改名，Enter 提交）或菜单触发弹窗——取**菜单触发弹窗**（`UiConfirmDialog` 同风格的小输入弹窗），实现简单一致。删除经新通用确认组件 `UiConfirmDialog`（action + detail + 危险按钮，复用 modal 样式）。
- 新 IPC：`projectFileRename({ projectId, absPath, newName })`（`fs.rename`，源/目标均 `assertInsideRoot`，重名检测 `existsSync` 返回 `name_taken`）；`projectFileDelete({ projectId, absPath })`（文件 unlink / 目录 `fs.rmSync recursive`，仅允许项目根内路径）。成功后 `refresh()`——id 即 relativePath，重命名目录自然带动子树变化。
- **理由**：删除高危走 UI 确认闸门（产品约束）；rename/delete 集中在 fs-guard 可测防穿越。

### D6：虚拟化适配

- **选择**：保留视口虚拟化语义——组框是包裹容器，卡片世界坐标改为「组框原点 + 组内偏移」两级计算；视口相交判定仍在平面坐标系进行（组框矩形粗判 + 卡片细判），未挂载卡片以占位维持组内布局稳定。
- **理由**：上千素材下嵌套 DOM 仍需虚拟化；两级判定实现简单。

## Risks / Trade-offs

- [Risk] 固定 5 列在窄视口下组框超出可视宽度 → Mitigation: 画布可平移；组框宽度固定属预期行为（用户确认）。
- [Risk] 目录重命名后 `collapsed` 里旧路径失效 → Mitigation: 按路径前缀同步更新折叠集合（rename 时替换前缀）。
- [Risk] 删除目录误删大量文件 → Mitigation: 确认对话框 detail 明示目录路径与递归语义；仅允许项目根内。
- [Trade-off] 第三级以深目录拍平，不再更深嵌套 → 接受（用户确认最多三级）。
- [Trade-off] 右键重命名走弹窗而非行内编辑 → 接受（一致性与实现成本）。

## Migration Plan

1. shared IPC 类型 + main rename/delete（fs-guard + 单测：防穿越/重名/成功路径）。
2. 布局纯函数：分组树 + 固定 5 列 + 组框尺寸（单测：三级嵌套/拍平/空目录/根文件）。
3. `MaterialGroup` 组件 + 画布集成 + 折叠状态持久化（兼容旧文件）。
4. 右键菜单 + `UiConfirmDialog` + 重命名/删除动作链。
5. lightbox 文档序列 + 切换 + 侧边列表。
6. 样式令牌化 + `npm run typecheck` + `npm test` + 手工点验。

## Open Questions

- （非阻塞）重命名弹窗的校验规则（禁止 `/`、保留原名）——实现期在 fs-guard 统一校验。
