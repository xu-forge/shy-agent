# Verify: zcode-home-replica

## 自动化验证（2026-08-22）

- `npm run typecheck`：0 错误
- `npm test`：56 files / 380 tests，367 passed + 13 skipped，0 failed
- `npm run build`（electron-vite）：通过
- `npx openspec validate zcode-home-replica --strict`：valid

## 实现说明

- 左栏：`Sidebar.tsx` 重写为 shy 标题 / + 新建任务 / 定时任务 / 技能 / 分组·项目 tab / 会话项目条目 / 任务空态 / 账户卡；旧会话列表与展开结构移除。
- 空态：`ChatWorkspace.tsx` 时段问候语 + 卡片 composer（橙色「完全访问」绑 autoApproveTools、只读模型徽标、圆形深色发送键、placeholder「向 shy 提问，使用 / 选择命令或能力」）+ 3 条列表式示例。
- 无功能控件（搜索/自动化/插件市场/项目·环境选择器/质量选择/闲时任务卡/功能推广卡）按决策不渲染；「自动化/插件市场」位替换为 shy 真实的「定时任务/技能」入口。
- 样式为 app.css 末尾覆盖层（新类 sb-brand/sb-subnav/sb-list-tabs/project-*/full-access/example-*），未删旧规则，线程视图与技能/日历/设置视图无回归（typecheck + 既有测试保障）。

## 全站视觉统一轮（2026-08-23，frontend-design skill）

- 建立身份 token 层（tokens.css）：`--ink/--canvas/--line/--amber`（light + dark），语义为 ink=主操作与用户之声、amber=agent 自主性专用。
- app.css 追加「ink & amber」统一层：主按钮墨色；用户消息墨块/agent 纸面隐喻；工具卡描边化 + 运行中 amber 脉冲；线程态 composer 与空态同卡；设置弹窗（左 tab rail + amber 激活竖条 + 毛玻璃遮罩）；二级视图三段式（pane 头/工具行/内容卡）；chips 墨灰统一；日历网格线分隔 + 墨色时间点；日志 mono 纸带；Inspector 进度墨色、运行 amber；深色模式下阴影清零。
- 验证：typecheck 0 错误、384 测试全绿、electron-vite build 通过。

## 设置弹窗精修轮（2026-08-23）

- 结构去嵌套：SettingsPanel / MemoryView 不再各自携带 `.pane-frame` + h1（弹窗内标题重复、布局溢出的根因）；SettingsPanel 删除与独立 tab 重复的「运行日志」区。
- 分区呼吸：常规设置分「模型接入（硬配置）/ 运行参数（调优）/ 外观」三区，eyebrow 标题 + 分隔线 + 每区一句使用提示。
- 表单网格：统一 150px label 栏；数字参数窄输入（120px）；说明文字缩进对齐输入列；apiKey 保持密文 + 显示切换并加 autoComplete=off。
- 反馈：tab 切换 160ms 淡入（respect reduced-motion）；保存行吸附底部（毛玻璃）+「已保存」toast；数据目录移至保存行。
- 记忆 tab：底部支撑行（agent 维护说明）；压缩阈值（%）成为独立字段；完全访问开关进入运行参数区。
- 验证：typecheck 0 错误、384 测试全绿、build 通过。

## 修订（2026-08-22，用户反馈）

- 左栏去掉「分组 | 项目」tab 概念：纯会话历史列表（标题 + 相对时间，无模式徽标、无图标）；删除图标仅悬停时显示。typecheck 0 错误、380 测试回归通过。

## 未完成（待人工）

- 4.4 对照截图像素级人工走查（需图形环境运行 Electron）。
