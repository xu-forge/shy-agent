# Tasks: material-canvas

## 1. IPC 与缩略图缓存（main/shared/preload）

- [x] 1.1 `shared/ipc.ts`：新增缩略图请求/结果与画布状态读写通道及类型（缓存键含 `mtime+size`）
- [x] 1.2 `src/main/materials/thumbs.ts`：缩略图缓存模块——键计算、路径解析（`~/.shy/cache/thumbs/<projectId>/`）、命中读、图片生成（Electron `nativeImage`，目标宽 480px）；含单测（键/路径/失效）
- [x] 1.3 `ipc.ts` 注册缩略图与画布状态通道；`preload` 暴露对应 `window.shy` 方法
- [x] 1.4 缩略图加载协议落地：复用 `shy-asset://`（顺带修正 handler 首段 host 丢失问题）；新增 `shy-material://` 协议按项目根校验读取素材原文件

## 2. 画布核心（renderer）

- [x] 2.1 `lib/materialLibrary.ts`：布局纯函数（mtime 倒序 + 等宽网格流，输出每项 x/y/w/h）与排序稳定性；单测覆盖并列/新增不扰动
- [x] 2.2 `MaterialCanvas` 组件：容器 + 大平面 transform（平移/缩放，光标锚点缩放，坐标上界）
- [x] 2.3 视口虚拟化：仅挂载视口±缓冲相交卡片，其余等尺寸占位；单测（挂载数受视口约束）
- [x] 2.4 缩放↔列数自适应联动

## 3. 卡片与缩略图消费

- [x] 3.1 `CanvasCard`：按 kind 渲染——图片缩略图、视频首帧缩略图、音频图标卡（名称+时长）、doc 封面卡、通用图标卡
- [x] 3.2 视频截帧器：隐藏 `<video>` 截首帧（`currentTime` 跳转 + 离屏 canvas），5s 超时/出错降级图标卡，并发 ≤3，结果回存主进程缓存
- [x] 3.3 webp/gif 等不支持缩放格式的降级路径（原图 `shy-material://` 直载）

## 4. Lightbox

- [x] 4.1 `Lightbox` 组件：按 kind 分派——图片原图、`<video controls>`、`<audio controls>`、pdf iframe（bar 常驻「用系统打开」回退）、md/txt 内嵌阅读、其余「用系统打开」
- [x] 4.2 关闭交互：Esc / 遮罩 / 关闭按钮；关闭后画布视口不变
- [x] 4.3 移除 `MaterialViewer.tsx` 及其样式引用

## 5. 状态持久化与集成

- [x] 5.1 画布状态读写（`~/.shy/state/material-canvas/<projectId>.json`）：防抖 300ms 写入、挂载读入还原、无状态默认定位头部
- [x] 5.2 过滤 chips 作用于画布集合并重排（不重置视口）
- [x] 5.3 导入与轮询刷新接入：新项插入布局头部、已有卡片位置不变
- [x] 5.4 `styles/app.css`：画布、卡片、lightbox 样式（沿用令牌）

## 6. 验收

- [x] 6.1 `npm run typecheck` 通过
- [x] 6.2 `npm test` 通过（89 files / 609 tests，含新增布局/虚拟化/缓存单测）
- [ ] 6.3 对照 brainstorm 验收锚点手工点验：1000+ 素材项目流畅浏览、缓存二次加载、降级路径、lightbox 各 kind、视口还原、过滤/导入联动

## 7. 验收反馈迭代（2026-08-28）

- [x] 7.1 滚轮/触控板双指改为滚动平移（`scrollViewport`）；Ctrl/Cmd+滚轮与触控板捏合（`ctrlKey` 合成事件，覆盖 mac）缩放；含单测
- [x] 7.2 `listMaterials` 跳过 `kind=other`（代码等不可展示类型不入素材库）；`fs-guard.test.ts` 补断言
- [x] 7.3 会话输入框 `@` 素材引用菜单：`mentionQueryBefore` 纯函数 + `SlashMenu` 扩展 material 项 + ChatWorkspace 接入（过滤/键控/Esc 保留草稿/替换 `@{relativePath}`）；含单测
- [x] 7.4 同步 spec delta（画布交互滚轮语义、素材收录范围、@ 引用 requirement）与 design 决策（D9–D11）
- [x] 7.5 @ 选中改为引用 chip 与文本同行内联呈现（`.composer-inputline`，× 防失焦删除、Backspace 删末尾、空文本可发送），发送时还原为 `@{相对路径}` 前缀；spec 场景与 D11 同步
- [x] 7.6 输入区重做为 tiptap：引用 chip 成为编辑器内容流的一部分（inline atom，Backspace 整删），mention suggestion 弹层复用 SlashMenu，`/` 菜单与全局快捷键迁移，发送原位序列化 `@{relativePath}`；引入依赖 `@tiptap/react`/`starter-kit`/`extension-mention`/`extensions`
- [x] 7.7 tiptap 修复轮：`path` 自定义 attr（扩展 Mention.addAttributes，修复 chip 无名字）；nodeView 自定义 chip（`@文件名` + × 删除按钮）；suggestion decoration 去样式（默认类撞全局 `.suggestion` pill 导致 `@` 触发即现绿圈）；@ 菜单打开时 Enter 交由 suggestion 键控（选中素材而非发送）
