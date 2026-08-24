# project-entity Specification

## Purpose

项目是代码/素材工作区的容器：SQLite 持久化，会话可空挂载 `projectId`，首条消息时绑定，删除只解绑不删磁盘。

## Requirements

### Requirement: 项目持久化
系统 MUST 将项目存为 SQLite 记录，字段至少包含 `id`、`name`、`type`（仅 `code` 或 `material`）、`rootPath`（本机绝对路径）、`createdAt`、`updatedAt`。`rootPath` MUST 唯一。创建后 MUST NOT 允许修改 `type`。

#### Scenario: 创建代码项目
- **WHEN** 用户添加项目并选择类型 `code` 与一个存在的可读目录
- **THEN** 系统 MUST 插入一条 `type=code` 的项目，`name` 默认为该目录 basename，`rootPath` 为所选绝对路径

#### Scenario: 重复路径拒绝
- **WHEN** 用户添加项目所选目录已被另一项目使用
- **THEN** 系统 MUST 拒绝创建并返回错误，不得插入第二条记录

### Requirement: 会话归属
会话 MUST 具有可空 `projectId`。`projectId` 为 null 的会话 MUST 归入虚拟分组「未选择项目」。一个项目 MUST 可以包含多条会话。

#### Scenario: 旧会话
- **WHEN** 迁移前已存在的会话被列出
- **THEN** 其 `projectId` MUST 为 null，并出现在「未选择项目」下

#### Scenario: 项目内多会话
- **WHEN** 用户在同一项目下发出两条均已绑定的会话
- **THEN** 两条会话 MUST 都列出该 `projectId`，且共享同一 `rootPath`

### Requirement: 首条消息绑定
空会话在发出第一条用户消息之前 MUST NOT 持久化 `projectId`。Composer 的待选项目 MUST 仅在此次发送时写入。若会话已有用户消息或已绑定，系统 MUST 拒绝再次绑定。

#### Scenario: 发送前可改
- **WHEN** 用户在空会话上先选项目 A，再改为不选，然后发送第一条消息
- **THEN** 该会话 MUST 仍为 `projectId = null`

#### Scenario: 发送后锁定
- **WHEN** 空会话选择项目 A 并成功发送第一条消息
- **THEN** 系统 MUST 把该会话 `projectId` 设为 A，之后绑定接口 MUST 返回错误且不更改归属

### Requirement: 工作区解析
`getSessionWorkspace(sessionId)` MUST 在会话已绑定且项目仍存在时返回该项目 `rootPath`；否则 MUST 返回 `~/.shy/sessions/{sessionId}/workspace`。

#### Scenario: 绑定代码项目
- **WHEN** 会话已绑定 `type=code` 的项目
- **THEN** 该会话上文件/shell 工具的相对路径 MUST 解析到项目 `rootPath` 下

#### Scenario: 项目已删除回退
- **WHEN** 会话曾绑定的项目记录已被删除
- **THEN** `getSessionWorkspace` MUST 回退到会话目录，且 MUST NOT 抛出未捕获异常

### Requirement: 删除项目只解绑
删除项目 MUST 只删除 `projects` 行，并将该项目下会话的 `projectId` 置为 null。系统 MUST NOT 删除 `rootPath` 磁盘内容，MUST NOT 删除会话消息。

#### Scenario: 删除后会话仍在
- **WHEN** 用户确认删除一个含两条会话的项目
- **THEN** 两条会话 MUST 仍可打开，且均出现在「未选择项目」下；原文件夹 MUST 仍存在于磁盘
