## 1. 项目实体与工作区解析

- [x] 1.1 `src/main/projects/store.ts`：`projects` 表 CRUD；`root_path` 唯一；创建后不可改 `type`（含单测）
- [x] 1.2 `sessions` 增加可空 `project_id`；`SessionSummary`/`SessionDetail` 带出；旧行迁移为 null
- [x] 1.3 `bindSessionProject`：仅当无用户消息且未绑定时允许；否则拒绝（含单测）
- [x] 1.4 `getSessionWorkspace`：绑定且项目存在 → `rootPath`，否则会话目录；项目已删回退（含单测）
- [x] 1.5 删除项目：删记录 + 会话 `project_id` 置空；不删磁盘、不删消息（含单测）

## 2. IPC 与选文件夹

- [x] 2.1 `shared/ipc.ts` 增加 `Project` / `MaterialItem` / `ProjectType` 与通道名
- [x] 2.2 `ipc.ts` + preload：`projectsList/Create/Delete`、`sessionsBindProject`、`projectPickFolder`（`showOpenDialog` 选目录）
- [x] 2.3 `projectTreeList` / `projectFileRead` / `projectFileWrite`：限制在 `rootPath` 内，忽略名单与 5000 节点上限（含单测）
- [x] 2.4 `projectMaterialsList` / `projectMaterialsImport`：扩展名→kind；导入复制进 `rootPath`（含单测）

## 3. 主题与壳布局

- [x] 3.1 `tokens.css` 换成图一浅色 token；深色衍生仍走 `data-theme`
- [x] 3.2 最左侧单列 `Sidebar` 可展开收起；展开时展示新建任务 + 按项目分组会话（含「未选择项目」）；收起仅图标、不展示会话历史
- [x] 3.3 `App.tsx` 三套布局：未绑定对话+Inspector；代码=文件树|编辑器|会话；素材=网格|会话
- [x] 3.4 `InspectorPanel` 改为「会话详情 / 浏览器」两 tab；详情含元数据与 `listSessionFiles` 产物；去掉任务/diff tab

## 4. Composer 绑定流

- [x] 4.1 Composer 左下角项目选择器：默认不选 / 已有项目 / 添加项目（类型+选文件夹）
- [x] 4.2 空会话选了项目也不切 IDE；`onSend` 先 `bindSessionProject` 再 `chat`；绑定后右侧会话输入区不展示项目选择器
- [x] 4.3 代码项目头部下拉切换同项目其它会话；文件树在代码主区内，导航展开时始终为会话列表

## 5. 代码工作区

- [x] 5.1 接入 `monaco-editor` + `@monaco-editor/react`（electron-vite worker 可用）
- [x] 5.2 文件树 UI + 点文件开 tab；保存走 `projectFileWrite`
- [x] 5.3 Agent `write` 刷新干净 tab；脏 tab 提示冲突不覆盖

## 6. 素材工作区

- [x] 6.1 `MaterialItem` 网格 + kind 过滤；会话新文件刷新后出现
- [x] 6.2 查看器壳：图片内嵌预览，其它「用系统打开」；`MaterialEditor` 注册表 v1 为空、无编辑入口
- [x] 6.3 导入文件到 `rootPath` 并刷新网格

## 7. 验收

- [x] 7.1 `npm run typecheck && npm run lint && npm test` 通过
- [x] 7.2 `npm run build` + `npx openspec validate --strict --change project-workspaces-ui` 通过
- [x] 7.3 手工走查：色板、分组侧栏、绑定时机、代码 Monaco、素材网格、删项目解绑
