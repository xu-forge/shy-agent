# Tasks: zcode-home-replica

## 1. 左栏重构

- [x] 1.1 `Sidebar.tsx`：顶部 shy 标题 + 「+ 新建任务」+ 定时任务/技能入口（替换自动化/插件市场位）
- [x] 1.2 会话历史列表：标题 + 相对时间条目（无分组/项目 tab、无模式徽标），hover 出删除图标
- [x] 1.3 「任务」区空态（还没有任务）；底部 shy 账户卡沿用

## 2. 主区空态重构

- [x] 2.1 时段问候语替换 logo/标语
- [x] 2.2 卡片式 composer：输入框 + 底部行（橙色「完全访问」绑 autoApproveTools、只读模型徽标、圆形发送）
- [x] 2.3 3 条列表式示例替换 suggestion pills；保留 `/` 斜杠菜单行为

## 3. 样式

- [x] 3.1 `app.css` 左栏/空态分区重写（220px 侧栏、f7f8fa 主区底、卡片 composer、示例列表）
- [x] 3.2 隐藏无功能控件后其余视图（技能/日历/设置/线程）无回归

## 4. 验收

- [x] 4.1 `npm run typecheck && npm test` 通过
- [x] 4.2 `npm run build` 通过
- [x] 4.3 `openspec validate --strict` 通过
- [ ] 4.4 对照截图人工走查（左栏结构 / 问候语 / composer 卡 / 示例列表像素级比对）
