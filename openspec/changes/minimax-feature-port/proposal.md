# Proposal: minimax-feature-port

## Why

参考 `../MiniMaxCode/`（MiniMax Agent Desktop）的实现，把其核心能力移植到 shy：多层级 Skill 系统、内嵌可视浏览器（WebContentsView + 原生 CDP）、agent loop hooks 体系，以及配套 UI。当前 shy 的技能只是单目录 markdown + token 匹配注入；浏览器只有 headless Playwright 文本抓取，无可视、不可交互；turn-runner 无 hook 扩展点；子代理运行器存在但未暴露为 LLM 工具。

MiniMaxCode 的 renderer 无源码（预编译 Next.js 产物），因此 UI 侧只能基于既有 `minimax-layout` 设计继续对齐；agent/skill/browser 逻辑参照其 `mavis-packages/` TS 源与 `dist/main/modules/browser/` 可读 JS 改写为 shy 主进程内的小型化实现。

## What Changes

- **Skill 系统升级**：多根目录 `SkillRegistry`（user 全局 `~/.shy/skills` / agent 级 / 项目级 `.shy/skills` / builtin 种子），目录 + `SKILL.md`（YAML frontmatter）格式，root priority 同名去重，`fs.watch` 热重载并推事件到渲染层；system prompt 改为注入 token 预算内（min(2% context, 5000)）的技能目录（catalog），新增 `skill` 工具按 name 读取技能内容；SkillsView 显示来源徽章、启用开关、变更自动刷新。
- **内置浏览器**：`src/main/browser/` 新模块 — 单例 manager + 每 tab 一个 `WebContentsView`（partition `persist:shy-browser`，sandbox + contextIsolation），隐藏 = 移出屏；`webContents.debugger` 原生 CDP 实现点击/输入/滚动/拖拽/截图/文件上传；`DOMSnapshot.captureSnapshot` + `Accessibility.getFullAXTree` 生成带 `browser-element:{uuid}` ref 的元素快照（分页 + TTL），动作经 ref → backendNodeId → box model 求坐标；对 LLM 暴露单一 `browser` 工具（22 个 action union），结果清洗 ≤64KiB，截图存 `~/.shy/artifacts`；`browser:*` IPC 供渲染层控制。
- **Agent loop 增强**：turn-runner 新增六类 hooks（beforeLlmCall / afterLlmCall / beforeToolCall / afterToolCall / onHistoryChanged / onStepEnd）；新增 `dispatch_subagent` 内置工具接现有 subagent runner（explore/worker/verifier + 并发/预算限制）。
- **UI 对齐**：ChatWorkspace 增加浏览器面板（显示内嵌浏览器区域或截图预览 + URL 状态条）；ToolCallCard 渲染 browser 截图缩略图与 subagent 卡片；SlashMenu 技能项接新 registry；SkillsView 重构。

### 简化决策（相对 MiniMax 原实现）

不做：exclusive-skill 闸门、评论模式、agent 光标 overlay、设备预览、Chrome profile 导入、后台渲染 host、skill hub 远程安装、多模型切换。

## Capabilities

### New Capabilities

- `skills-registry`：多根技能注册表（扫描/去重/热重载/catalog 注入/skill 工具）。
- `embedded-browser`：内嵌浏览器运行时与 `browser` 工具（WebContentsView + CDP + 快照 ref 模型）。
- `agent-hooks`：turn-runner hook 扩展点与 `dispatch_subagent` 工具。
- `browser-ui`：渲染层浏览器面板与工具卡片展示。

### Modified Capabilities

- `minimax-layout`：ChatWorkspace 增加浏览器面板区域；SlashMenu/SkillsView 数据源换为 skills-registry（不改既有布局语义）。

## Impact

- **main**：新增 `src/main/browser/`（manager/controller/cdp-helper/browser-actions/snapshot/ipc）；`src/main/skills/` 重构（registry/store/catalog/enabled-state）；`src/main/agent/turn-runner/` 加 hooks；`src/main/agent/tools/` 新增 `browser`、`skill`、`dispatch_subagent` 工具。
- **shared**：`ipc.ts` 新增 `browser:*` 通道常量与类型；skills 类型扩展（root/source/enabled）。
- **preload**：`window.shy` 暴露 browser 控制方法。
- **renderer**：ChatWorkspace / ToolCallCard / SlashMenu / SkillsView。
- **测试**：registry / catalog / cdp-helper（fake webContents）/ hooks 触发序 / 新工具单测；现有 330 测试不回归。
