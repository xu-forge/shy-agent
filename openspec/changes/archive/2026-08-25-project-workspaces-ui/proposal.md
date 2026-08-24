# Proposal: project-workspaces-ui

## Why

当前 shy 仍是 MiniMax 蓝主题加宽侧栏会话列表，没有项目实体，Agent 工作区固定在 `~/.shy/sessions/{id}/workspace`。用户要用图一色板改版，并把工作分成代码项目（打开本机目录 + Monaco）和素材项目（目录即素材库）；所有会话挂在项目下，未绑定的归「未选择项目」。右侧工具区改为会话详情（含产物）与浏览器。现在做是为了一次对齐导航、工作区与 Agent `workspaceDir`，避免后续再拆布局。

## What Changes

**主题与导航**
- From: MiniMax 蓝 `#0094fc`、宽 Sidebar 平铺会话
- To: 图一色板（主色 `#4ADE80`、背景 `#F8FAFC`）；最左侧单列导航可展开收起，展开时为新建任务 + 按项目分组会话（含「未选择项目」），收起不展示会话历史；代码文件树在代码主区内
- Reason: 会话历史与新建任务回到最左侧同一条导航，与旧侧栏一致
- Impact: 非破坏；深色模式保留为衍生色

**项目实体与绑定**
- From: 只有 session；工作区恒为会话目录
- To: SQLite `projects`（`type` = code|material，`rootPath` 本机目录）；session 可空 `projectId`；composer 左下角选项目 / 新建项目，默认不选；**第一条消息发出时**才绑定并切换布局，之后锁定
- Reason: 项目是代码/素材工作区的容器，且空会话保持普通对话页
- Impact: 新增 IPC 与表；旧会话 `projectId` 为空，行为不变

**代码 / 素材工作区**
- From: 无
- To: 代码 = 文件树 + Monaco（可编辑保存）+ 右侧会话；素材 = `MaterialItem` 网格 + 查看器壳 + 右侧会话；绑定后 Agent `workspaceDir` = `rootPath`；右侧会话输入区不展示项目选择器
- Reason: 图三/图四；会话产物即素材库文件
- Impact: 新依赖 Monaco；新 IPC 列目录 / 读写文件 / 导入素材

**普通对话右侧**
- From: Inspector 三 tab（任务 / 文件 diff / 浏览器）
- To: 两 tab（会话详情含本会话产物 / 浏览器）
- Reason: 用户不要工具列表，要产物；浏览器保留
- Impact: 非破坏；任务/diff 数据仍在，只是普通对话不再展示

**删除项目**
- From: 无
- To: 删项目记录，会话 `projectId` 置空；不删磁盘、不删消息
- Reason: 高危删除必须确认且不误伤用户文件
- Impact: 非破坏

## Capabilities

### New Capabilities

- `project-entity`：项目持久化、会话绑定（首条消息）、`workspaceDir` 解析、删除解绑。
- `code-workspace`：代码项目文件树 + Monaco 编辑保存 + Agent 改写刷新。
- `material-library`：素材网格、`MaterialItem`、查看器壳、导入文件、编辑器注册口（v1 空）。
- `shell-layout-theme`：图一 token、图标轨 + 分组二级栏、composer 项目选择器、未选择项目右侧两 tab。

### Modified Capabilities

（主库 `openspec/specs/` 仅有 `goal-driver`，其需求不因项目工作区改变。Inspector / 布局既有 change 未归档为主规格，本轮以新 capability 描述行为，不挂 delta。）

## Impact

- **main**：`projects` 表与 store；`sessions.project_id` 迁移；`getSessionWorkspace` 按项目 `rootPath` 解析；目录树/素材扫描/选文件夹/导入文件 IPC；`dialog.showOpenDialog`。
- **shared / preload**：`Project` / `MaterialItem` 类型；`projects*`、`projectTree*`、`projectMaterials*`、`sessionsBindProject` 等通道。
- **renderer**：App 布局切换；Sidebar 拆成图标轨+二级栏；Composer 项目选择器；CodeWorkspace（文件树+Monaco）；MaterialLibrary（网格+查看器）；InspectorPanel 改为详情/浏览器。
- **依赖**：新增 `monaco-editor` + `@monaco-editor/react`（Vite worker 配置）。
- **测试**：项目 CRUD / 绑定锁定 / workspaceDir 解析 / 目录忽略规则 / MaterialItem 分类；typecheck + 既有会话测试回归。
