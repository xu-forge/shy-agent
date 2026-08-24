# Design: project-workspaces-ui

## Context

shy 是 Electron + React + Vite 桌面 Agent。当前壳是 `Sidebar`（宽栏会话列表）+ `ChatWorkspace` + `InspectorPanel`（任务 / diff / 浏览器）。主题在 `src/renderer/src/styles/tokens.css`，主色 MiniMax 蓝。会话存在 SQLite `sessions`；Agent 工具相对路径基准是 `getSessionWorkspace(sessionId)` → `~/.shy/sessions/{id}/workspace`（`src/main/paths.ts`，`service.ts` 与 `goal-driver.ts` 都调用它）。没有项目实体，也没有本机目录选择器。

本 change 把「项目」做成一等公民：代码项目打开用户已有文件夹并用 Monaco 编辑；素材项目把同一类文件夹显示为网格；所有会话挂在项目下，未绑定的显示为「未选择项目」。

## Goals / Non-Goals

**Goals:**
- 图一色板落地（浅色主色 `#4ADE80`，深色衍生保留）。
- 64px 图标轨 + 按项目分组的二级侧栏。
- 项目 CRUD + 会话绑定：composer 左下角选择/新建，默认不选；首条消息才绑定并切布局，之后锁定。
- 绑定后 Agent `workspaceDir` 使用项目 `rootPath`。
- 代码工作区：忽略常见垃圾目录的文件树 + Monaco 可编辑保存。
- 素材工作区：`MaterialItem` 网格 + 查看器壳 + 导入；为日后修图/剪辑预留 `MaterialEditor` 注册表。
- 未选择项目右侧仅「会话详情（含产物）/ 浏览器」。

**Non-Goals:**
- 实现在线修图/剪辑（只留插槽）。
- 会话中途更换项目、修改项目 `type`。
- git 集成、多根 workspace、一个 `rootPath` 挂多个项目。
- 删除项目时删除磁盘文件或会话消息。
- 普通对话右侧保留任务 / diff tab。

## Decisions

### D1：项目是 SQLite 实体，目录仍在用户磁盘
- **选择**：表 `projects(id, name, type, root_path, created_at, updated_at)`；`root_path` 唯一。`sessions` 增加可空 `project_id`。文件不拷贝进 `~/.shy`。
- **理由**：用户明确要打开本机已有文件夹；SQLite 便于列表与外键。
- **已考虑 alternative**：仅「最近打开目录」不入库 → 无法作为会话容器，拒绝。独立 `~/.shy/projects/{id}` 沙箱 → 用户要绑已有仓库，拒绝。

### D2：首条消息才绑定
- **选择**：空会话始终普通对话布局。Composer 持有 `pendingProjectId: string | null`（默认 null）。`onSend` 在 `window.shy.chat` 之前，若会话尚无用户消息且尚未绑定，调用 `bindSessionProject({ sessionId, projectId })`。绑定成功后按 `type` 切代码/素材布局。已有消息或已绑定则选择器只读。
- **理由**：用户要求发送前可改、发送后锁定，且空会话不提前变成 IDE。
- **已考虑 alternative**：选中即切布局 → 用户明确拒绝。

### D3：`getSessionWorkspace` 单点解析
- **选择**：`getSessionWorkspace(sessionId)` 查 session → project：有 `rootPath` 则返回它，否则返回原会话 workspace。`service.ts` / `goal-driver.ts` 不改调用点。
- **理由**：所有文件/shell 工具已用 `ctx.workspaceDir`；改一处即可。
- **已考虑 alternative**：在 ChatRequest 里传 workspace → 易漏 goal 续跑路径，拒绝。

### D4：新建项目挂在 composer，无独立「添加项目」主导航
- **选择**：选择器菜单：不选 / 已有项目列表 / 「添加项目…」。添加 = 选 `code|material` + `dialog.showOpenDialog({ properties: ['openDirectory'] })`。默认名 = 文件夹 basename。同路径已存在则报错不创建。
- **理由**：用户指定输入框左下角；项目因会话而存在，避免空项目。

### D5：代码工作区 = 文件树替换二级栏 + 中间 Monaco
- **选择**：main 进程递归列出 `rootPath`（忽略 `node_modules` `.git` `dist` `out` `.next` `coverage` `.shy`）。renderer 用 `@monaco-editor/react`；保存走 `fs.writeFile` IPC（受 `rootPath` 约束，禁止写出目录）。打开文件的 mtime 与 `session_files` 轮询对比，Agent 写过则 reload。右侧复用 `ChatWorkspace` 线程+composer（变窄约 320px），头部下拉同项目其它会话。
- **理由**：用户要可用编辑器而非只读预览；忽略规则避免树卡死。
- **已考虑 alternative**：只读预览 / 先做壳 → 用户选 Monaco。

### D6：素材 = 文件系统为真相源 + `MaterialItem` 适配层
- **选择**：扫描 `rootPath` 生成 `MaterialItem { id, relativePath, absPath, kind, mime, mtimeMs, size, sourceSessionId?, derivedFrom? }`。`id` 先用 posix 相对路径；`kind` 由扩展名映射。网格按 kind 过滤。查看器壳按 kind 渲染预览（图片用 `<img>`，其它展示图标+「用系统打开」）。`MaterialEditor` 注册表存在但 v1 为空；日后编辑器写新文件并填 `derivedFrom`。导入：系统选文件，复制进 `rootPath`。
- **理由**：用户要产物即素材，且后续修图/剪辑不能逼我们推翻网格。
- **已考虑 alternative**：v1 就建 `materials` 表 → 过早；纯 readdir 无类型 → 无法挂编辑器，拒绝。

### D7：导航混合方案
- **选择**：`app-shell` 改为 `[IconRail 64px][SecondarySidebar][Main][Optional right]`。轨上：项目（默认）、技能、日历、设置。二级栏：项目分组会话；代码布局下二级栏改为文件树。未选择项目：Main=对话，Right=Inspector 两 tab。
- **理由**：用户选 hybrid；文件树需要稳定宽度。

### D8：普通对话右侧两 tab
- **选择**：`InspectorPanel` tab 改为 `details` / `browser`。详情：标题、创建时间、模型名、消息数、本会话 `listSessionFiles` 产物列表（可 reveal）。去掉任务与 diff tab。代码/素材布局不渲染 Inspector（聊天已在右侧）。
- **理由**：用户明确「会话详情、浏览器两个 tab」；任务/diff 数据保留但不在此展示。

### D9：删项目只解绑
- **选择**：确认后 `DELETE FROM projects`；`UPDATE sessions SET project_id = NULL`。不 `rm` `rootPath`，不删 `session_messages`。
- **理由**：与产品高危确认原则一致，避免误删用户仓库。

### D10：主题 token 整站替换
- **选择**：改 `tokens.css` 浅色变量；深色按同一色相提高对比。圆角控件 8px、卡片 16px。不删 `[data-theme='dark']`。
- **理由**：图一是色板；设置里已有主题切换。

## Risks / Trade-offs

- [Risk] Monaco 在 electron-vite 下 worker 路径易坏 → Mitigation: 使用 `@monaco-editor/react` 官方 Vite 配置；plan 里单独验收语法高亮。
- [Risk] 用户选了超大目录（含 node_modules 未忽略干净）→ Mitigation: 硬编码忽略名单 + 深度/条目上限（例如 5000 节点），超出截断并提示。
- [Risk] Agent 在用户仓库里误删 → Mitigation: 现有高危确认闸门仍生效；本期不扩大自动批准范围。
- [Risk] 绑定后 `workspaceDir` 切换，已打开的工具上下文仍指向旧目录 → Mitigation: 绑定发生在首条 `chat` 之前，该 turn 创建的 `ToolContext` 已是新路径。
- [Trade-off] 代码/素材布局下暂时没有浏览器 tab → 接受；浏览器仍可从「未选择项目」会话使用。
- [Trade-off] 素材编辑器 v1 为空壳 → 接受；接口先稳定。

## Migration Plan

1. DB：`projects` 表 + `sessions.project_id`（`ALTER TABLE` 兼容旧库）。
2. `getSessionWorkspace` 解析 + 单测（null 项目 / 代码项目 / 素材项目 / 项目已删回退会话目录）。
3. IPC + preload + 选文件夹。
4. Token 与图标轨/分组侧栏（此时绑定尚未切 IDE，视觉先可用）。
5. Composer 选择器 + bind-on-send。
6. Inspector 两 tab。
7. 文件树 IPC + Monaco。
8. 素材扫描 + 网格 + 查看器 + 导入。
9. App 按绑定结果切三套布局。
10. `typecheck` / `lint` / `test`；手工点验四张图对应路径。

Rollback：git 回退。DB 新列可空，旧数据无需回填；留下的 `projects` 表不影响旧会话路径解析（无 `project_id` 即旧行为）。

## Open Questions

- （无阻塞）文件树条目上限具体数字：默认 5000，走查若不够再调。
- （无阻塞）Monaco 深色/浅色是否跟随 `data-theme`：跟随。
