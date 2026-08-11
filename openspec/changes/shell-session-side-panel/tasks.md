# Tasks

## 1. 数据层

- [ ] 1.1 `memory/db.ts` 新增 `session_files` 表与 `session_id` 索引（含 migration 幂等创建）
- [ ] 1.2 `memory/db.ts` 新增 `session_tasks` 表与 `session_id` 索引
- [ ] 1.3 `memory/db.ts` 导出 `recordFileOp` / `listFiles` / `listTasks` / `upsertTask` / `updateTaskDone` / `deleteTask`
- [ ] 1.4 单元测试：DB 增删改查、迁移幂等、并发写入不重复

## 2. builtin.ts 埋点

- [ ] 2.1 在 `builtin.ts` 顶部加 JSDoc 列出需打点工具（**本期**：`fs_read` / `fs_write` / `fs_delete`；扩展占位 `fs_edit` / `fs_copy` / `fs_move`）
- [ ] 2.2 `fs_read` 成功路径调用 `recordFileOp(sessionId, 'read', path)`
- [ ] 2.3 `fs_write` 成功路径调用 `recordFileOp(sessionId, 'write', path)`
- [ ] 2.4 `fs_delete` 成功路径调用 `recordFileOp(sessionId, 'delete', path)`
- [ ] 2.5 单元测试：mock 工具成功/失败路径，验证 DB 行存在/不存在

## 3. LangGraph 任务事件

- [ ] 3.1 新增事件 `task` 的 emit helper（接受 `{ sessionId, kind, id, title?, done?, evidence? }`）
- [ ] 3.2 目标模式 plan 节点生成 checklist 时，改为逐项 emit `task` 事件（source='goal'）
- [ ] 3.3 `goal` 事件 payload 移除 `checklist` 字段（保留 `goal` 文本）
- [ ] 3.4 main 端 `task` 事件 handler 写入 `session_tasks` 表
- [ ] 3.5 单元测试：graph emit 序列正确，DB 行一致

## 4. IPC 与 preload

- [ ] 4.1 `shared/ipc.ts` 新增 `SessionFileRecord` / `SessionTaskRecord` / `FileOp` / `TaskEvent` 类型
- [ ] 4.2 `shared/ipc.ts` `IPC` 字典新增 5 个 channel 名
- [ ] 4.3 `main/ipc.ts` 注册 handler：`session:files:list` / `session:files:reveal` / `session:tasks:list` / `session:tasks:update` / `session:tasks:delete`
- [ ] 4.4 `preload/index.ts` + `index.d.ts` 暴露新方法
- [ ] 4.5 单元测试：preload 暴露签名与实现一致

## 5. Renderer - MemoryView 升级

- [ ] 5.1 引入搜索框 + 防抖
- [ ] 5.2 来源过滤（全部 / 用户 / Agent）
- [ ] 5.3 排序（更新时间 / 创建时间 / 标题）
- [ ] 5.4 卡片列表加 checkbox、tags chips、hover 操作
- [ ] 5.5 编辑态切到右侧 drawer
- [ ] 5.6 视觉与 tokens 对齐（card 类名收编、间距、阴影）
- [ ] 5.7 替换 `confirm` 为 `ConfirmDialog`

## 6. Renderer - SkillsView 升级

- [ ] 6.1 列表加搜索框
- [ ] 6.2 排序（更新时间 / 创建时间 / 名称）
- [ ] 6.3 frontmatter 实时预览条
- [ ] 6.4 保存按钮在未修改时 disabled
- [ ] 6.5 视觉精修（与 MemoryView 风格一致）
- [ ] 6.6 替换 `confirm` 为 `ConfirmDialog`

## 7. Renderer - SessionPanel 新增

- [ ] 7.1 新建 `SessionPanel.tsx` 与样式
- [ ] 7.2 顶栏「侧栏」切换按钮（与 Settings 按钮相邻）
- [ ] 7.3 状态持久化到 `localStorage`
- [ ] 7.4 任务 tab 子组件 `TaskList` / `TaskItem`（勾选、来源 chip、编辑/删除、Agent 角标）
- [ ] 7.5 文件 tab 子组件 `FileList` / `FileItem`（op chip、同路径合并、复制/reveal/移除）
- [ ] 7.6 跨平台 reveal：Win `explorer /select,` / Mac `open -R`
- [ ] 7.7 `App.tsx` 把 SessionPanel 接入 ChatWorkspace
- [ ] 7.8 `ChatWorkspace.tsx` 移除 `.goal-panel` 渲染
- [ ] 7.9 单元测试：组件快照 + 事件回调

## 8. 小瑕疵清理

- [ ] 8.1 替换剩余 `window.confirm` / `confirm()`（删除会话等）
- [ ] 8.2 错字（`occured` → `occurred` 等）
- [ ] 8.3 重复样式去重 / 类名收编（`.card-like` → `.card`）
- [ ] 8.4 删除未使用类（`.evidence` 等）

## 9. 验证

- [ ] 9.1 `npm run typecheck` 通过
- [ ] 9.2 `npm test` 通过
- [ ] 9.3 `npm run lint` 通过
- [ ] 9.4 手动 smoke：交互模式发一条带文件操作的 message，侧栏文件 tab 出现；目标模式生成 checklist，侧栏任务 tab 出现
