# Proposal: material-canvas

## Why

素材项目主区当前是纯文字卡片网格（只有类型标签 + 文件名，无缩略图），查看器壳仅支持图片 data URL 内嵌预览，视频/音频/文档只能「用系统打开」。在用户确认的上千素材量级下，既看不到内容、也无法高效浏览。用户希望中间区域改为画布式展示：直接渲染图片预览、视频首帧、文档封面，点击后再放大细看。

## What Changes

- **素材主区画布化**：`MaterialLibrary` 的网格替换为自研 DOM 无限画布画廊——支持平移（拖拽/触控板）与缩放（滚轮/Cmd+滚轮），按修改时间倒序自动布局，列数随缩放自适应；视口虚拟化（仅挂载视口±缓冲的卡片）支撑上千素材。
- **缩略图磁盘缓存**：主进程新增缩略图生成与缓存模块，缓存目录 `~/.shy/cache/thumbs/<projectId>/`；图片缩放生成缩略图，视频用 Chromium 内置解码截首帧（renderer 截帧回存）；以 `mtime+size` 做失效键；解码失败降级为图标卡。
- **画布卡片**：图片/视频 → 缩略图；音频 → 图标卡（名称+时长）；文档 → 封面卡（PDF/md/txt 可读标识）；其他 → 通用图标卡。
- **Lightbox 取代全屏查看器**：点击卡片在画布上层弹出 lightbox：图片大图、视频播放、音频播放、PDF/md/txt 内嵌阅读，其他类型「用系统打开」；Esc/关闭按钮返回画布。现有 `MaterialViewer` 全屏对话框退役。
- **画布状态持久化**：按项目持久化视口（x/y/scale）与排序偏好到 `~/.shy`，重开还原；类型过滤 chips 保留，过滤后画布重排。

## Capabilities

### New Capabilities

- `material-canvas`：素材无限画布（平移/缩放/自动布局/虚拟化）、缩略图缓存（含视频首帧）、lightbox、画布状态持久化。

### Modified Capabilities

- `material-library`：「素材网格」要求改为画布画廊承载（过滤与新产物入库语义保留）；「查看器壳」要求改为 lightbox 承载（编辑器注册表 v1 为空的语义保留）。

## Impact

- **renderer**：`components/material/` 新增 `MaterialCanvas`（画布容器/平移缩放/虚拟化）、`CanvasCard`（各 kind 卡片）、`Lightbox`；`MaterialLibrary.tsx` 改为画布宿主；`lib/materialLibrary.ts` 扩展布局/排序纯函数；`styles/app.css` 新增画布与 lightbox 样式。`MaterialViewer.tsx` 移除。
- **main**：新增 `materials/thumbs.ts`（缩略图生成与缓存读写，Electron `nativeImage`/离屏，无新 npm 依赖）；`ipc.ts` 注册缩略图与画布状态 IPC。
- **shared**：`ipc.ts` 新增缩略图请求/结果与画布状态读写通道类型。
- **preload**：`window.shy` 新增 `materialThumb`、`materialCanvasStateGet/Set`（命名以实现为准）。
- **测试**：`lib/materialLibrary` 布局/排序/缓存键纯函数；main 缩略图缓存路径与失效；既有 material 相关测试更新。
