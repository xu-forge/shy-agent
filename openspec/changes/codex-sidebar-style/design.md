# Design: codex-sidebar-style

## Context

shy 侧栏在 `Sidebar.tsx`：展开时 `sb-brand`（shy）+ `sb-new-task` + `sb-subnav`（calendar/skills）+ `sb-group` 会话分组 + 底栏账户。用户要以 Codex 截图为参考做**视觉与项目区交互**对齐，并去掉品牌标题。会话/项目数据模型、`groupSessionsByProject`、删除项目确认流保持不变。

## Goals / Non-Goals

**Goals:**

- 侧栏信息架构观感：短导航 →「项目」树 →「最近」→ 底栏设置入口
- 项目行：文件夹图标、展开/收起、选中/hover 圆角底、`⋯` → 移除项目
- 子会话缩进列表，点击仍 `onSelectSession`
- 无「shy」导航标题
- 暗色主题可用现有 CSS 变量

**Non-Goals:**

- 工作 OS / `activeProjectId` 改造
- 拉取请求、工作树、置顶、归档、项目重命名、搜索铃
- 改主区、Composer、Agent 事件

## Decisions

### D1：只改 renderer 壳，不改 IPC

- **选择**：删除项目仍调用现有 `onDeleteProject`；最近列表由 props `groups`/`sessions` 在客户端按 `updatedAt` 排序截取
- **理由**：A 范围无新后端
- **已考虑 alternative**：为「最近」加 SQLite 字段 → 过重

### D2：无品牌标题

- **选择**：移除 `.sb-brand`（或等价节点）；顶区仅收起钮 + 短导航
- **理由**：用户明确不要「shy ⌄」
- **已考虑 alternative**：保留底栏「shy」名 → 保留（连接状态需要锚点）

### D3：项目区交互对齐 Codex

- **选择**：
  - 分区标题「项目」（小字 muted）
  - 具名项目：左侧 folder 线图标；整行可点切换折叠；右侧 `⋯` 仅在 hover 或 active 时显示
  - `⋯` 打开浮层菜单，首项「移除项目」（危险色可选）；点击菜单外关闭
  - 未绑定组（`group.id === null`）：无文件夹图标，标题仍可用「未选择项目」，折叠行为与项目组一致
  - 子会话：相对项目行缩进；active 会话用圆角灰底；删除会话可保留 hover 垃圾桶或次级菜单（不阻塞；至少一种删除路径）
- **理由**：用户强调项目块图标与交互
- **已考虑 alternative**：常驻垃圾桶 → 拒绝，破坏 Codex 干净感

### D4：短导航文案

- **选择**：「新对话」/「已安排」/「技能」；行为分别绑定 `onNewSession`、`nav=calendar`、`nav=skills`
- **理由**：有能力才展示
- **已考虑 alternative**：把技能标成「插件」→ 易误解为市场

### D5：最近区

- **选择**：从所有 `groups` 扁平会话按 `updatedAt` desc 取 N（建议 8～12）；展示标题；点击选会话；可与项目树条目重复
- **理由**：纯展示
- **已考虑 alternative**：只显示未在展开树中的会话 → 逻辑复杂且不像 Codex

### D6：样式策略

- **选择**：重写 sidebar 相关 CSS，用 `--bg-panel` / `--bg-hover` / `--text-muted` 等 token；选中态接近浅灰圆角，避免实心强调色块当行背景
- **理由**：跟主题系统一致
- **已考虑 alternative**：硬编码 Codex `#F5F5F5` → 暗色会坏

## Risks / Trade-offs

- [Risk] `⋯` 菜单被侧栏 `overflow:hidden` 裁切 → Mitigation：菜单 `position:fixed` 或 portal，或允许侧栏 `overflow: visible` 于菜单打开时
- [Risk] 最近与树重复点击路径混淆 → Mitigation：接受；两者都打开同一会话
- [Trade-off] 无「编辑」菜单项 → 无 rename IPC；避免空壳
- [Trade-off] 收起态 flyout 需同步新 DOM 结构 → 复用 `renderBody`

## Migration Plan

1. 改 `Sidebar.tsx` 结构 + 抽 `recentSessions` 纯函数与单测
2. 更新 `app.css` sidebar 段；自测展开/收起/暗色
3. 更新 `shell-layout-theme` 相关测试文案（若有）
4. Rollback：回退 Sidebar/CSS 即可，无 DB

N/A — 无部署/数据迁移。

## Open Questions

- 无（编辑/置顶已明确不做）
