# Tasks: material-canvas-groups

## 1. IPC 与文件操作（main/shared/preload）

- [x] 1.1 `shared/ipc.ts`：新增 `projectFileRename`/`projectFileDelete` 通道与结果类型（`path_escape`/`not_found`/`name_taken`/`delete_failed`）
- [x] 1.2 `projects/fs-guard.ts`：`renameMaterial`（fs.rename，源/目标防穿越、同目录重名检测）与 `deleteMaterial`（文件 unlink / 目录递归 rm，防穿越）；含单测（防穿越/重名/成功/目录递归）
- [x] 1.3 `ipc.ts` 注册通道；`preload` 暴露 `window.shy` 方法
- [x] 1.4 `materials/canvas-state.ts`：状态结构加 `collapsed?: string[]`，旧文件兼容；单测更新

## 2. 分组布局纯函数（renderer lib）

- [x] 2.1 `buildMaterialGroups(items)`：relativePath 推导分组树（深度 ≤3、深层拍平、空目录剔除、根文件单独返回）；单测覆盖三级嵌套/拍平/空目录
- [x] 2.2 布局改造：固定 5 列（移除 scale 联动），输出分组框世界矩形 + 组内卡片偏移 + 散文件区布局；单测（列数恒定/新素材不扰动）
- [x] 2.3 lightbox 文档序列计算 `docSequenceOf(items)`：md/txt/pdf 按目录分组、组内 mtime 倒序；单测

## 3. 画布分组渲染（renderer 组件）

- [x] 3.1 `MaterialGroup` 组件：浅灰圆角容器 +「∨ 名称（N）」标题胶囊 + 子组嵌套 + 折叠（仅剩标题）
- [x] 3.2 `MaterialCanvas` 集成：顶部散文件区 + 分组树渲染；虚拟化两级判定（组框粗判 + 卡片细判）
- [x] 3.3 折叠状态接入画布状态持久化（collapsed 集合、防抖写、还原、目录重命名前缀同步）

## 4. 右键菜单与管理动作

- [x] 4.1 `MaterialContextMenu` 组件：卡片/分组标题两套菜单项，点外/Esc 关闭
- [x] 4.2 `UiConfirmDialog` 通用确认组件（明示路径与递归语义，危险按钮）
- [x] 4.3 重命名弹窗（非空/禁止路径分隔符校验、重名报错提示）与删除确认链路
- [x] 4.4 操作成功后 `refresh()` 刷新画布；重命名目录同步更新 collapsed 前缀

## 5. lightbox 文档切换

- [x] 5.1 `Lightbox` 接入文档序列：←/→ 键与 ‹ › 按钮、n/N 序号、循环切换
- [x] 5.2 右侧文档列表（按目录分组、当前高亮、点击直达）；非可读文档不渲染切换区

## 6. 样式与验收

- [x] 6.1 样式：分组框/标题胶囊/右键菜单/确认弹窗/文档列表（沿用令牌，对齐图一观感）
- [x] 6.2 `npm run typecheck` 通过
- [x] 6.3 `npm test` 通过（含新增纯函数与 main 单测）
- [ ] 6.4 手工点验：5 列缩放恒定、三级嵌套折叠、根文件散放、右键重命名/删除（确认闸门）、lightbox ←/→ 与列表、重启还原折叠
