# Design: material-canvas

## Context

`MaterialLibrary.tsx` 现为文字卡片网格 + 轮询刷新（`SESSION_FILES_POLL_MS`），点击卡片打开 `MaterialViewer` 全屏对话框：仅 `kind=image` 经 `projectFileReadDataUrl` 以 data URL 内嵌预览，其余只给「用系统打开」。数据侧 `MaterialItem` 已含 `id/relativePath/absPath/kind/mime/mtimeMs/size`；主进程 `listMaterials` 深遍历 `rootPath`，上限 `TREE_NODE_LIMIT`。渲染层已有 `shy-asset://` 自定义协议先例（artifacts 截图）。用户确认素材量级为上千，浏览器引擎为 Chromium（Electron）。

## Goals / Non-Goals

**Goals:**

- 素材主区改为无限画布画廊：平移/缩放、按修改时间倒序自动布局、视口虚拟化，上千项流畅。
- 画布直接渲染内容：图片缩略图、视频首帧缩略图、音频图标卡、文档封面卡。
- 点击卡片进 lightbox：图片大图 / 视频播放 / 音频播放 / PDF、md、txt 内嵌阅读 / 其他系统打开。
- 缩略图磁盘缓存（`~/.shy/cache/thumbs`），二次加载毫秒级。
- 按项目持久化视口与排序偏好；类型过滤 chips 保留。

**Non-Goals:**

- 不做自由拖拽摆放与卡片位置持久化（保持自动布局）。
- 不做多选/框选、右键菜单、画布内编辑素材。
- 不引入 ffmpeg、react-flow、konva、pdfjs 等新依赖。
- 不改 `MaterialItem` 模型与 `listMaterials` 遍历语义。

## Decisions

### D1：自研 DOM 画布，不用库

- **选择**：单容器 `overflow:hidden` + 内层大平面（`transform: translate(x,y) scale(s)`），卡片绝对定位其上。平移/缩放状态为一个 `{x, y, scale}`；滚轮缩放以光标为锚点。
- **理由**：画布节点是 `img/video/audio/iframe` 等 DOM 媒体，Konva/Fabric 等 canvas2d 方案无法直接承载；react-flow 面向节点图、依赖重，网格画廊反而要绕开其布局。自研成本低于适配成本，且零新依赖。
- **已考虑 alternative**：react-flow / konva → 拒绝（见上）。

### D2：自动布局 = 修改时间倒序 + 等宽网格流

- **选择**：`visible` 项按 `mtimeMs` 倒序（并列按 `relativePath` 稳定排序），以固定卡片宽（基准 220px）、行高按内容比例的流式网格从左上铺开；列数 = 视口宽 / (卡宽×scale)，缩放时重排列数。布局为纯函数，单测覆盖。
- **理由**：Agent 新产出 mtime 最新，天然出现在序列头部；自动布局无需持久化位置。

### D3：视口虚拟化

- **选择**：布局输出每项的 `(x, y, w, h)`；渲染时仅挂载与视口矩形（外扩一圈缓冲）相交的卡片，其余渲染同尺寸占位（维持滚动稳定）。轮询刷新后 diff 布局，已有项位置不变。
- **理由**：上千项全量挂载 DOM 会卡死；虚拟化是量级需求。

### D4：缩略图磁盘缓存（主进程）

- **选择**：新增 `src/main/materials/thumbs.ts`：输入 `(projectId, absPath, mtimeMs, size, kind)`，输出缓存文件路径。缓存键 = 文件路径 hash + `mtime-size`；命中直接回路径，未命中图片用 Electron `nativeImage` 缩放（目标宽 480px，PNG 输出），写 `~/.shy/cache/thumbs/<projectId>/<key>.png`。渲染层通过 `shy-asset://` 风格协议或自定义缩略图协议加载（实现期与 BrowserPanel 的 `shy-asset://` 统一，二选一，倾向复用）。
- **理由**：上千量级下原图直载会内存爆炸且大图解码卡顿；磁盘缓存二次加载毫秒级。`nativeImage` 为 Electron 内置，零新依赖。
- **已考虑 alternative**：原图 `<img loading="lazy">` 直载 → 拒绝（大图解码卡、内存高）。

### D5：视频首帧 = Chromium 截帧

- **选择**：renderer 端截帧器：隐藏 `<video preload="metadata">` 加载本地文件（走缩略图同源协议），`currentTime = min(0.1, duration/2)` 后 `drawImage` 到离屏 canvas，导出 data URL 经 IPC 交主进程写缓存；之后与图片同路径消费。解码失败（不支持的容器/编码，如部分 MOV/AVI）→ 该视频降级为图标卡。
- **理由**：零新依赖覆盖 mp4/webm 等主流格式；失败有兜底。截帧仅在「未命中缓存」时发生，且有并发上限（同一时刻 ≤3 个），避免上千视频同时截帧。
- **已考虑 alternative**：ffmpeg 静态二进制 → 拒绝（包体积、签名公证、依赖管理成本）。

### D6：Lightbox 槽位按 kind 分派

- **选择**：`Lightbox` 组件按 `kind` 渲染：`image` → 原图大图（原图直载，点开是低频动作可接受）；`video` → `<video controls>`；`audio` → `<audio controls>` + 文件名；`doc` → `.pdf` 用 `<iframe>`（Electron 内置 Chromium PDF 查看器），`.md`/`.txt` 读文本渲染（md 走现有 Markdown 渲染路径），其余 doc → 「用系统打开」；`other` → 「用系统打开」。Esc、遮罩点击、关闭按钮均可关闭。
- **理由**：全部用 Chromium 内置能力，零新依赖；与「缩略+点开」策略一致。

### D7：画布状态持久化（视口 + 排序偏好）

- **选择**：`~/.shy/state/material-canvas/<projectId>.json`：`{ x, y, scale, sortBy }`（`sortBy` v1 仅 `mtime_desc`，字段留扩展）。防抖 300ms 写入；`MaterialLibrary` 挂载时读入，无文件时给默认视口（定位到序列头部）。新 IPC：`materialCanvasStateGet/Set`。
- **理由**：用户明确要还原上次浏览位置；JSON 状态文件与 `~/.shy` 数据根约定一致。

### D8：过滤与导入在画布下的行为

- **选择**：chips 过滤作用于 `visible` 集合，画布以过滤后集合重排（视口位置不重置）；导入成功后新项按 mtime 倒序插入头部并重排；轮询刷新发现新文件同样处理。
- **理由**：保留现有过滤/导入语义，画布只是新的呈现层。

### D9：滚轮滚动、Ctrl/Cmd 缩放（验收反馈迭代）

- **选择**：无修饰键滚轮/触控板双指 = 沿滚动方向平移（`scrollViewport`，向下滚动 = 视口下移，与常规滚动一致）；Ctrl+滚轮（Windows/Linux）、Cmd+滚轮（macOS）与触控板捏合 = 光标锚点缩放。捏合手势由 Chromium 合成为 `ctrlKey=true` 的 wheel 事件，故判定条件统一为 `e.ctrlKey || e.metaKey`。
- **理由**：用户验收反馈「下滑上滑是滚动而不是缩放」；与 Figma/Miro 等画布产品惯例一致，且天然覆盖 mac 捏合。

### D10：素材收录范围（验收反馈迭代）

- **选择**：`listMaterials` 遍历时跳过 `kindFromName` 判定为 `other` 的文件（代码、未知二进制等），素材列表只收媒体（image/video/audio）与文档（pdf/doc/docx/md/txt）。不占 `TREE_NODE_LIMIT` 计数。
- **理由**：用户验收反馈「代码相关的不算素材」；画布与 @ 引用菜单都只面向可展示内容。

### D11：会话输入 @ 引用素材（验收反馈迭代，tiptap 重做）

- **选择**：输入区由原生 textarea 重做为 tiptap（`@tiptap/react` + `starter-kit` + `extension-mention` + `@tiptap/extensions` Placeholder，零自研 contenteditable）。引用 chip 即 ProseMirror inline atom node（`mention-chip` 类，attrs: id/label/path），与文本同一内容流，换行后 chip 保持在内联位置；Backspace 整体删除。`@` 触发经 Mention suggestion：items 过滤素材（文件名+相对路径，上限 50），弹层复用 `SlashMenu`（amber「素材」badge），↑/↓/Enter/Esc 经 suggestion `onKeyDown` 桥接；Esc 仅关菜单保留文本，继续输入重新激活。发送序列化（`serializeComposerText`）将 chip 原位展开为 `@{relativePath}`，段落间换行；发送后清空编辑器。`/` 命令菜单逻辑保持：文档文本以 `/` 开头即激活，键控经 `editorProps.handleKeyDown` 桥。editor 在组件顶层 `useEditor` 创建一次，empty 态与 dock 态共用实例（重挂不丢内容）；`/`、Cmd/Ctrl+K 聚焦 editor。
- **理由**：用户两轮反馈——chip 必须是「输入框内容的一部分」而非外挂前缀行；原生 textarea 无法内联混排，自研 contenteditable 的 IME/选区风险高，tiptap mention 扩展开箱即用且中文 IME 成熟。显式 `@路径` 序列化对 Agent 定位素材无歧义，Agent 侧无需新协议。

## Risks / Trade-offs

- [Risk] Chromium 截帧对部分编码/容器失败或长时间黑帧 → Mitigation: 超时（5s）与 error 事件均降级图标卡；降级不影响画布其他部分。
- [Risk] Electron 内置 PDF 查看器在个别版本不可用 → Mitigation: iframe `onerror`/加载失败回退「用系统打开」按钮态。
- [Risk] 大平面 transform 在极端平移距离下浮点精度抖动 → Mitigation: 限制画布坐标范围（如 ±100k px）。
- [Trade-off] lightbox 原图直载，打开超大图有短暂加载 → 接受（低频动作）；后续可复用缩略图做渐进加载。
- [Trade-off] `nativeImage` 不支持 webp/gif 输入 → 这两类图片 v1 走原图 CSS 缩放展示（懒加载），不进缓存；视觉一致、实现让路。

## Migration Plan

1. shared IPC 类型 + main 缩略图模块（含缓存键/路径单测）。
2. 画布核心组件（布局纯函数 → 虚拟化 → 平移缩放）。
3. 各 kind 卡片渲染 + 缩略图消费（图片先行，视频截帧接入）。
4. Lightbox 替换 `MaterialViewer`。
5. 状态持久化 + 过滤/导入/轮询集成。
6. 样式、`npm run typecheck` + `npm test`、手工点验验收锚点。
7. Rollback：删除画布组件与 IPC 即回到网格；缓存目录可整体删除，无破坏性。

## Open Questions

- （非阻塞）缩略图加载走复用 `shy-asset://` 还是新增专用协议：实现期二选一，倾向复用，不阻塞设计。
