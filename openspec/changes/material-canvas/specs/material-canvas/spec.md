## ADDED Requirements

### Requirement: 无限画布交互

素材项目主区 MUST 以无限画布承载素材卡片：支持拖拽或触控板平移；滚轮与触控板双指 MUST 表现为滚动（沿滚动方向平移视图）而非缩放；Ctrl+滚轮（Windows/Linux）、Cmd+滚轮（macOS）与触控板捏合手势 MUST 以光标为锚点缩放。画布坐标范围 MUST 有上界（如 ±100000px）以防浮点精度问题。

#### Scenario: 平移画布
- **WHEN** 用户在画布空白处拖拽
- **THEN** 画布 MUST 平移，所有卡片随之移动

#### Scenario: 滚轮滚动
- **WHEN** 用户在画布上滚动滚轮（无修饰键）
- **THEN** 画布 MUST 沿滚动方向平移，MUST NOT 改变缩放级别

#### Scenario: 缩放画布
- **WHEN** 用户以 Ctrl+滚轮、Cmd+滚轮或触控板捏合缩放
- **THEN** 画布 MUST 以光标位置为锚点缩放，光标下的内容点 MUST 保持视觉位置不变

### Requirement: 自动布局

画布 MUST 将过滤后的 `MaterialItem` 按 `mtimeMs` 倒序（并列按 `relativePath` 稳定）以等宽网格流自动布局，从画布原点铺开；列数 MUST 随缩放级别与视口宽度自适应。布局 MUST 为纯函数。新素材（导入或会话写入）MUST 依排序自然出现在布局头部，且已有卡片位置 MUST 保持不变。

#### Scenario: 修改时间倒序
- **WHEN** 项目中有 mtime 为 t1 < t2 < t3 的三个素材
- **THEN** 布局序列 MUST 为 t3、t2、t1 对应的卡片

#### Scenario: 新素材不扰动已有位置
- **WHEN** 轮询刷新发现项目新增一个文件
- **THEN** 已有卡片在布局中的相对位置 MUST 不变，新卡片 MUST 出现在序列头部

### Requirement: 视口虚拟化

画布 MUST 仅挂载与当前视口矩形（含外扩缓冲区）相交的卡片 DOM，其余项以等尺寸占位维持布局稳定。上千素材时平移与缩放 MUST 保持可交互。

#### Scenario: 上千素材流畅浏览
- **WHEN** 项目含 1000+ 素材且用户快速平移画布
- **THEN** 同一时刻挂载的卡片数 MUST 受视口+缓冲约束，不随素材总量线性增长

### Requirement: 画布卡片呈现

画布卡片 MUST 按 kind 呈现：`image` 显示缩略图；`video` 显示首帧缩略图（截帧失败或超时 MUST 降级为图标卡）；`audio` 显示含名称与时长（可得时）的图标卡；`doc` 显示封面卡并标识可读格式（pdf/md/txt）；无法解码或 `other` 显示通用图标卡。缩略图 MUST 走磁盘缓存，缓存键 MUST 含文件 `mtime` 与 `size` 以自动失效；二次加载 MUST 命中缓存而不重新生成。

#### Scenario: 图片缩略图缓存命中
- **WHEN** 同一图片第二次进入视口
- **THEN** 系统 MUST 直接读取磁盘缓存缩略图，MUST NOT 重新生成

#### Scenario: 视频截帧失败降级
- **WHEN** 某视频的容器/编码无法被内置解码器截帧或截帧超时（5s）
- **THEN** 该卡片 MUST 降级为图标卡，画布其余部分 MUST 不受影响

#### Scenario: mtime 变化失效
- **WHEN** 某素材文件被覆盖写入（mtime 或 size 变化）
- **THEN** 缩略图缓存 MUST 视为失效并重新生成

### Requirement: Lightbox 查看

点击画布卡片 MUST 在画布上层打开 lightbox 而非全屏对话框：`image` 显示原图；`video` 提供内嵌播放控件；`audio` 提供内嵌播放控件；`doc` 中 pdf MUST 以内嵌查看器打开（加载失败回退「用系统打开」），md/txt MUST 内嵌渲染阅读，其余 doc 与 `other` MUST 提供「用系统打开」。Esc、遮罩点击、关闭按钮 MUST 均可关闭并返回画布（画布视口状态不变）。

#### Scenario: 点开视频
- **WHEN** 用户点击一个 `kind=video` 的卡片
- **THEN** lightbox MUST 打开并可播放该视频，Esc 后 MUST 返回画布原视口

#### Scenario: PDF 回退
- **WHEN** 内嵌 PDF 查看器加载失败
- **THEN** lightbox MUST 提供「用系统打开」入口

### Requirement: 画布状态持久化

系统 MUST 按项目持久化画布视口（x/y/scale）与排序偏好至 `~/.shy`（如 `state/material-canvas/<projectId>.json`），写入 MUST 防抖；重新打开同一项目时 MUST 还原上次视口与排序偏好；无持久化状态时 MUST 以默认视口定位到布局头部。排序偏好字段 MUST 预留扩展（v1 仅修改时间倒序）。

#### Scenario: 重开还原视口
- **WHEN** 用户将某项目画布缩放并平移后关闭应用，再次打开该项目
- **THEN** 画布 MUST 还原到关闭前的视口位置与缩放级别

#### Scenario: 首次打开
- **WHEN** 项目无持久化画布状态
- **THEN** 画布 MUST 以默认缩放定位到最新素材（布局头部）

### Requirement: 过滤与导入联动

类型过滤 chips MUST 作用于画布集合并触发重排，且 MUST NOT 重置视口位置；导入成功后画布 MUST 立即包含新卡片。

#### Scenario: 过滤不重置视口
- **WHEN** 用户在平移后选择「图片」过滤
- **THEN** 画布 MUST 仅展示 `kind=image` 卡片并重排，视口位置 MUST 保持

#### Scenario: 导入即见
- **WHEN** 用户导入一张图片
- **THEN** 画布 MUST 出现该图片缩略图卡片

### Requirement: 会话输入 @ 引用素材

绑定素材项目的会话输入框 MUST 基于富文本编辑器（tiptap）实现：键入 `@`（行首或空白字符后）MUST 弹出素材引用菜单，按 `@` 后文本实时过滤（匹配文件名与相对路径），↑/↓ 移动、Enter MUST 选中素材（而非发送消息）、Esc 仅关闭菜单（保留已输入文本）。触发字符与输入中的 `@token` MUST NOT 呈现引用 chip 样式。选中后素材 MUST 以引用 chip 的形式成为编辑器内容的一部分（内联混排：chip 与文本同行流式排列，文字换行后 chip 保持在内容流中），chip MUST 显示素材文件名并自带 × 删除按钮（Backspace 亦可整体删除）；草稿中 MUST NOT 残留 `@路径` 文本。发送时 chip MUST 原位还原为消息文本中的 `@{素材相对路径}`。菜单每次打开时 MUST 刷新素材列表；未绑定素材项目时 MUST NOT 弹出。`/` 命令菜单行为 MUST 保持不变。

#### Scenario: 键入 @ 弹出菜单
- **WHEN** 用户在绑定素材项目的会话输入框键入 `@`
- **THEN** 输入框上方 MUST 弹出素材引用菜单，展示素材（文件名 + 相对路径）

#### Scenario: 选中成为内联引用 chip
- **WHEN** 用户过滤后按 Enter 选中一项
- **THEN** 草稿中的 `@token` MUST 被替换为该素材的内联引用 chip（显示文件名），chip 与后续文本在同一内容流中

#### Scenario: Backspace 删除引用
- **WHEN** 用户将光标移至引用 chip 后并按 Backspace
- **THEN** 该 chip MUST 整体删除，不留残留字符

#### Scenario: 发送还原为路径
- **WHEN** 用户带着引用 chip 发送消息
- **THEN** 发出的消息文本中 chip MUST 原位还原为 `@{相对路径}`；编辑器随发送清空

#### Scenario: Esc 关闭不丢文本
- **WHEN** 菜单打开时用户按下 Esc
- **THEN** 菜单 MUST 关闭且已输入文本（含 `@token`）MUST 保留；继续输入时菜单 MUST 可重新出现
