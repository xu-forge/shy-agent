# Tasks: minimax-feature-port

## 1. Skill 系统升级

- [x] 1.1 `src/main/skills/registry.ts`：多根扫描（user/agent/project/builtin）、SKILL.md + 兼容单文件 md、priority 去重、snapshot（含单测）
- [x] 1.2 `src/main/skills/enabled-state.ts`：禁用名单持久化，registry/catalog/skill 工具过滤
- [x] 1.3 热重载：fs.watch + debounce，EventBus 推 `skills_changed`（含单测）
- [x] 1.4 `src/main/skills/catalog.ts`：token 预算渲染目录文本；`service.ts` system prompt 换用 catalog（替换 match.ts 注入）
- [x] 1.5 `skill` 工具（tools/）按 name 读取技能内容；IPC `skillsList` 返回 rootKind/enabled（含单测）
- [x] 1.6 SkillsView：来源徽章、启用 toggle、skills_changed 自动刷新；SlashMenu 数据源适配

## 2. 内置浏览器

- [x] 2.1 `src/main/browser/cdp-helper.ts`：attach/sendCommand 超时、click/type/scroll/drag/screenshot/boxModel/fileUpload 原语（fake debugger 单测）
- [x] 2.2 `src/main/browser/snapshot.ts`：captureSnapshot + AX 树 → 元素列表 + ref 分配/解析、分页、TTL（单测）
- [x] 2.3 `src/main/browser/controller.ts`：WebContentsView 创建/附着/隐藏/单 tab 可见/销毁
- [x] 2.4 `src/main/browser/browser-actions.ts` + `embedded-browser-manager.ts`：navigate/click/fill/type/… 动作与 `executeAgentTool` 分发
- [x] 2.5 `src/main/agent/tools/browser.ts`：单 `browser` 工具（zod、22 action、64KiB 清洗、截图落盘 artifacts）
- [x] 2.6 IPC + preload：`browser:show/hide/set-bounds/get-state/navigate/screenshot/open-external`；导航/截图事件推渲染层
- [x] 2.7 安全：file:/javascript: 导航 confirm；upload_files realpath 校验（含单测）

## 3. Agent loop 增强

- [x] 3.1 `turn-runner` 增加六类 hooks 类型与触发点（lifecycle.ts 埋点，含顺序/决策分支单测）
- [x] 3.2 `dispatch_subagent` 工具：接 subagent runner，类型/预算参数，结果截断（含单测）
- [x] 3.3 context 预算接线：catalog 与 compaction 共用 token estimator

## 4. UI

- [x] 4.1 ChatWorkspace 浏览器面板：开关、bounds 下发（zoom 换算）、URL 状态条、后退/刷新/关闭
- [x] 4.2 ToolCallCard：browser 截图缩略图与 action 摘要；dispatch_subagent 卡片
- [x] 4.3 tokens.css/app.css 补浏览器面板与卡片样式；其余视图无回归

## 5. 验收

- [x] 5.1 `npm run typecheck && npm test` 通过（既有 330 测试不回归）
- [x] 5.2 `npm run build`（electron-vite）通过
- [x] 5.3 `openspec validate --strict` 通过
- [ ] 5.4 手动走查：技能热重载/来源徽章；浏览器打开网页 → inspect → click/fill → screenshot 面板可见；dispatch_subagent 一次 explore 任务
