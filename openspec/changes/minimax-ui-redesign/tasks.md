## 1. 共享与设置

- [x] 1.1 `ModelSettings` 增加 `autoApproveTools?: boolean`（shared/ipc.ts）
- [x] 1.2 `settings/store.ts` 默认值 `false` 并纳入 `setSettings` 合并
- [x] 1.3 `confirm.ts` 闸门：弹窗前 `getSettings()`，`autoApproveTools` 为真则直接放行（含单测）
- [x] 1.4 补充/更新 `settings` 与 `confirm` 相关测试（`src/main/confirm.test.ts`）

## 2. 左栏重构

- [x] 2.1 `Sidebar.tsx` 重做：顶部导航 = 「新对话 / 技能 / 日历」（去掉新建任务按钮与搜索框）
- [x] 2.2 主导航列表（新对话 / 技能 / 日历，含图标；新对话点击即 `onNewSession`）
- [x] 2.3 底部会话列表（标题/模式/时间）与设置入口（shy 账户卡）
- [x] 2.4 设置入口 hover 弹选项（记忆 / 常规设置 / 运行日志），点击开弹窗
- [x] 2.5 `App.tsx` 布局/导航归置适配新 Sidebar 签名

## 7. 设置弹窗（左 tab：记忆 / 常规设置 / 运行日志）

- [x] 7.1 `SettingsDialog.tsx`：遮罩 + 弹窗 + 左侧 tab 导航
- [x] 7.2 记忆 tab 复用 `MemoryView`；常规设置 tab 复用 `SettingsPanel`
- [x] 7.3 运行日志 tab：新增 `LogsView`（`listAgentLogs` / `readAgentLog`）
- [x] 7.4 `App.tsx` 接入弹窗开关与 tab 选中；Esc / 遮罩 / 关闭按钮关闭

## 3. 空态主页（图二）

- [x] 3.1 `ChatWorkspace` 空态：居中 logo + 标语 + 大输入框 + 选项行
- [x] 3.2 选项行：`+`、`始终授权` toggle（读写 `autoApproveTools`）、展示型模型选择器、发送键
- [x] 3.3 功能 pills 映射现有 `SUGGESTIONS`
- [x] 3.4 空态发送进入线程

## 4. 对话区与产出卡片（图三）

- [x] 4.1 线程样式重做（用户/助手/工具/系统消息）
- [x] 4.2 工具卡片样式（复用 `ToolCallCard`）
- [x] 4.3 产出「已编辑文件」卡片：`listSessionFiles` 汇总 `write` 数，无记录显示空态（未显示）
- [x] 4.4 Composer 重做为图三样式（题注 + 模型徽标 + 发送）
- [x] 4.5 `/` 命令菜单：移除顶栏 `ModeToggle`；键首键入 `/` 弹出「模式（交互/目标）+ 技能（`listSkills` 过滤、插入引用草稿）」；支持 ↑/↓/Enter/Esc
- [x] 4.6 `InspectorPanel` 环境面板重做为图三右侧样式（任务/记忆/技能 三 tab + 进度条）

## 5. 样式与令牌

- [x] 5.1 `tokens.css` 扩展令牌（新增 `--sidebar-width` 等）
- [x] 5.2 `app.css` 分区重写（左栏 / 空态 / 线程 / 产出 / 环境面板），尽量复用既有类名
- [x] 5.3 各既有视图（记忆/技能/日历/设置）无样式回归（override 均为新类名或 chat 局部类）

## 6. 验收

- [x] 6.1 `npm run typecheck` 通过
- [x] 6.2 `npm run typecheck && npm test` 通过（49 files / 330 tests）
- [ ] 6.3 对照 brainstorm 验收锚点手工点验（Electron 界面视觉走查，需人工/截图确认）
