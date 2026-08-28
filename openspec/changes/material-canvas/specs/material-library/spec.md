## MODIFIED Requirements

### Requirement: 素材画布

素材项目主区 MUST 以无限画布（见 `material-canvas` 能力）展示 `MaterialItem` 卡片，并提供按 `kind` 的过滤（全部 / 图片 / 视频 / 音频 / 文档）。素材列表 MUST 只收录可展示类型（媒体与文档），代码等不可展示类型（`kind=other`）MUST NOT 进入素材列表。会话新写入 `rootPath` 的文件 MUST 在刷新后出现在画布中。

#### Scenario: 过滤图片
- **WHEN** 用户选择「图片」过滤
- **THEN** 画布 MUST 只展示 `kind=image` 的卡片

#### Scenario: 产物出现在库中
- **WHEN** 绑定素材项目的会话把文件写进 `rootPath`
- **THEN** 刷新后画布 MUST 包含该文件卡片

#### Scenario: 代码文件不入库
- **WHEN** `rootPath` 下存在 `app.ts`、`data.bin` 等不可展示类型文件
- **THEN** 素材列表 MUST NOT 包含这些文件

### Requirement: 查看器与编辑器注册口

点击画布卡片 MUST 打开 lightbox（见 `material-canvas` 能力）而非编辑器。系统 MUST 提供 `MaterialEditor` 注册表（`id`、适用 `kind`/`mime`、标签、组件）。v1 注册表 MUST 为空，MUST NOT 在 UI 上展示编辑入口。

#### Scenario: 打开图片
- **WHEN** 用户点击一张 `kind=image` 的卡片
- **THEN** lightbox MUST 显示该图片原图，MUST NOT 打开修图编辑器

#### Scenario: 空注册表
- **WHEN** 应用启动且未注册任何 `MaterialEditor`
- **THEN** 素材界面 MUST NOT 出现「编辑」或修图/剪辑入口
