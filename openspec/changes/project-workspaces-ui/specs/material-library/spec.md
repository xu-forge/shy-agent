## ADDED Requirements

### Requirement: MaterialItem 模型
素材项目 MUST 将 `rootPath` 下的文件映射为 `MaterialItem`，至少包含 `id`（稳定，v1 为 posix 相对路径）、`relativePath`、`absPath`、`kind`（`image` | `video` | `audio` | `doc` | `other`）、`mime`、`mtimeMs`、`size`，以及可选 `sourceSessionId`、`derivedFrom`。`kind` MUST 由扩展名映射（例如 `.png/.jpg/.webp/.gif` → `image`，`.mp4/.mov/.webm` → `video`，`.mp3/.wav/.m4a` → `audio`，`.pdf/.doc/.docx/.md/.txt` → `doc`）。

#### Scenario: 分类
- **WHEN** 目录中有 `a.png`、`b.mp4`、`c.pdf`
- **THEN** 三者的 `kind` MUST 分别为 `image`、`video`、`doc`

#### Scenario: 会话产物带会话 id
- **WHEN** 本项目某会话对 `rootPath/out.png` 有 `write` 记录
- **THEN** 对应 `MaterialItem.sourceSessionId` MUST 为该会话 id

### Requirement: 素材网格
素材项目主区 MUST 以卡片网格展示 `MaterialItem`，并提供按 `kind` 的过滤（全部 / 图片 / 视频 / 音频 / 文档）。会话新写入 `rootPath` 的文件 MUST 在刷新后出现在网格中。

#### Scenario: 过滤图片
- **WHEN** 用户选择「图片」过滤
- **THEN** 网格 MUST 只展示 `kind=image` 的卡片

#### Scenario: 产物出现在库中
- **WHEN** 绑定素材项目的会话把文件写进 `rootPath`
- **THEN** 刷新后网格 MUST 包含该文件卡片

### Requirement: 查看器壳与编辑器注册口
点击卡片 MUST 打开查看器壳而非编辑器。查看器 MUST 按 `kind` 选择预览插槽：图片可内嵌预览，其它 kind 至少提供「用系统打开」。系统 MUST 提供 `MaterialEditor` 注册表（`id`、适用 `kind`/`mime`、标签、组件）。v1 注册表 MUST 为空，MUST NOT 在 UI 上展示编辑入口。

#### Scenario: 打开图片
- **WHEN** 用户点击一张 `kind=image` 的卡片
- **THEN** 查看器壳 MUST 显示该图片预览，MUST NOT 打开修图编辑器

#### Scenario: 空注册表
- **WHEN** 应用启动且未注册任何 `MaterialEditor`
- **THEN** 素材界面 MUST NOT 出现「编辑」或修图/剪辑入口

### Requirement: 导入文件
素材项目 MUST 允许用户通过系统文件选择器选取文件，并将其复制到 `rootPath` 内（不得写出该目录）。复制成功后网格 MUST 包含新卡片。

#### Scenario: 导入进库
- **WHEN** 用户导入 `/tmp/x.png` 到素材项目
- **THEN** `rootPath` 下 MUST 出现该文件的副本，网格 MUST 显示对应卡片
