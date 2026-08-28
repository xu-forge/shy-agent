# material-canvas Implementation Plan

> **For agentic workers:** 按 tasks.md 逐项实现；规格见 `specs/material-canvas` 与 `specs/material-library`（delta）。

**Goal:** 素材项目主区从文字卡片网格升级为无限画布画廊：平移/缩放 + 修改时间倒序自动布局 + 视口虚拟化（上千素材），画布直接渲染缩略图/首帧/封面卡，点击进 lightbox；缩略图磁盘缓存，视口与排序偏好按项目持久化。

**Architecture:** main 新增 `materials/thumbs.ts`（缓存键 `mtime+size`、`~/.shy/cache/thumbs/<projectId>/`、`nativeImage` 生成）+ 画布状态 IPC → renderer `MaterialCanvas`（transform 大平面 + 光标锚点缩放 + 视口虚拟化）消费缩略图协议 → `CanvasCard` 按 kind 渲染（视频走 Chromium 截帧，失败降级）→ `Lightbox` 替代 `MaterialViewer`（Esc 返回，视口不变）→ 状态文件 `~/.shy/state/material-canvas/<projectId>.json` 防抖持久化。

**Tech Stack:** React 19、TypeScript、Electron main/preload、Electron `nativeImage`、Chromium `<video>`/`<iframe>`/离屏 canvas、vitest；零新 npm 依赖。

---

## Task 1: IPC 与缩略图缓存

**Maps to:** tasks 1.1–1.4

- [ ] **Step 1:** `shared/ipc.ts` 通道与类型（缩略图请求/结果、画布状态 get/set）
- [ ] **Step 2:** `main/materials/thumbs.ts`：缓存键（path hash + mtime + size）、目录管理、命中读、图片生成与写缓存；单测
- [ ] **Step 3:** `ipc.ts` 注册 + `preload` 暴露
- [ ] **Step 4:** 缩略图加载协议（复用 `shy-asset://` 优先）
- [ ] **Commit:** `feat(素材): 缩略图磁盘缓存与画布状态 IPC`

## Task 2: 画布核心

**Maps to:** tasks 2.1–2.4

- [ ] **Step 1:** 布局纯函数（mtime 倒序、并列稳定、等宽网格流、输出 x/y/w/h）+ 单测
- [ ] **Step 2:** `MaterialCanvas`：transform 平移/缩放、光标锚点、坐标上界
- [ ] **Step 3:** 视口虚拟化（相交判定 + 占位）+ 单测
- [ ] **Step 4:** 列数随 scale/视口宽自适应
- [ ] **Commit:** `feat(素材): 无限画布核心与视口虚拟化`

## Task 3: 卡片与缩略图消费

**Maps to:** tasks 3.1–3.3

- [ ] **Step 1:** `CanvasCard` 各 kind 渲染
- [ ] **Step 2:** 视频首帧截帧器（超时/出错降级、并发 ≤3、回存缓存）
- [ ] **Step 3:** webp/gif 原图 CSS 缩放降级路径
- [ ] **Commit:** `feat(素材): 画布卡片与视频首帧截帧`

## Task 4: Lightbox

**Maps to:** tasks 4.1–4.3

- [ ] **Step 1:** `Lightbox` 按 kind 分派（图片/视频/音频/pdf/md/txt/系统打开回退）
- [ ] **Step 2:** Esc/遮罩/按钮关闭，画布视口保持
- [ ] **Step 3:** 移除 `MaterialViewer`
- [ ] **Commit:** `feat(素材): lightbox 取代全屏查看器`

## Task 5: 状态持久化与集成

**Maps to:** tasks 5.1–5.4

- [ ] **Step 1:** 状态读写（防抖、还原、默认头部定位）
- [ ] **Step 2:** 过滤重排不重置视口
- [ ] **Step 3:** 导入/轮询新项头部插入
- [ ] **Step 4:** 样式（令牌化）
- [ ] **Commit:** `feat(素材): 画布状态持久化与过滤导入联动`

## Task 6: 验收

**Maps to:** tasks 6.1–6.3

- [ ] **Step 1:** `npm run typecheck`
- [ ] **Step 2:** `npm test`
- [ ] **Step 3:** 手工点验 brainstorm 验收锚点（大库流畅、缓存命中、降级、lightbox、视口还原、过滤/导入）
- [ ] **Commit:**（若有修测）`test(素材): 画布相关覆盖`

---

## 不做

- 手动拖拽摆放 / 卡片位置持久化 / 多选框选 / 右键菜单
- 素材编辑（`MaterialEditor` 注册表保持 v1 为空）
- ffmpeg、react-flow、konva、pdfjs 等新依赖
- `MaterialItem` 模型与 `listMaterials` 遍历语义变更
