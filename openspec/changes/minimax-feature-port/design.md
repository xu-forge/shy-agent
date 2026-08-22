# Design: minimax-feature-port

## 1. Skill 系统升级（`src/main/skills/`）

参照 `mavis-packages/skills/src/registry.ts`，去掉 stat/ino 缓存与 symlink 防御的复杂度，保留核心模型：

- **类型**：`SkillRootKind = 'user' | 'agent' | 'project' | 'builtin'`；`SkillEntry { name, title, description, content, rootId, rootKind, priority, frontmatter, dir, mtimeMs, enabled }`；`SkillSnapshot { version, generatedAt, entries, winners, losers }`（同名按 root priority：project > agent > user > builtin，败者进 losers 仅诊断用）。
- **格式**：目录 + `SKILL.md`，frontmatter 解析复用现有 `store.ts` 的简易 YAML 解析（name/title/description 标量）。现有 `~/.shy/skills/*.md` 单文件在扫描时兼容读取（虚拟为同名 entry）。
- **热重载**：`fs.watch` 根目录与技能目录，debounce 300ms + max-wait 2s 后 `refresh()`，通过 EventBus 推 `skills_changed` 事件，渲染层收到后重新 `skillsList`。
- **catalog 注入**：`service.ts` 的 system prompt 组装处，用 token 预算 `min(2% × contextWindow, 5000)`（复用 `compaction/token-estimator`）渲染目录文本（名称 + 描述，单条描述 ≤1024 字符），附使用说明「调用 skill 工具读取」。替代现有 `match.ts` 注入（match.ts 保留一个 change 周期后删除）。
- **skill 工具**：`skill({ name })` → 返回该技能 SKILL.md 全文（来自当前 snapshot winner）。
- **enabled-state**：`{dataDir}/skills/enabled.json` 记录禁用名单（按 rootId + name），catalog 与 skill 工具均跳过禁用项。

## 2. 内置浏览器（`src/main/browser/`）

从 MiniMax `dist/main/modules/browser/` 改写，简化为单 BrowserSession（多 tab）、无挂起/恢复持久化（v1 进程内生命周期）：

- **controller.ts**：`BrowserController` 每 tab `new WebContentsView({ webPreferences: { partition: 'persist:shy-browser', sandbox: true, contextIsolation: true, nodeIntegration: false } })`；`contentView.addChildView` 附着主窗口；`hide()` = setBounds 负坐标 + removeChildView；`showTabExclusive()` 保证单 tab 可见。
- **cdp-helper.ts**：`wc.debugger.attach('1.3')`（失败视为已附着）；`sendCommand` 带 Promise.race 超时（默认 15s）；实现 `dispatchClickEvent`（Input.dispatchMouseEvent pressed/released）、`typeByBackendNodeId`（dispatchKeyEvent + insertText，符号键 keyCode 表）、`dispatchMouseWheel`、`drag`、`captureScreenshot`（Page.captureScreenshot）、`getBoxModelByBackendNodeId`、`scrollIntoView`、`focus`、`setFileInputFiles`。
- **snapshot**：`inspect()` 用 `DOMSnapshot.captureSnapshot` + `Accessibility.getFullAXTree` 提取可交互元素（a/button/input/select/textarea/[role]），元素赋 `ref = browser-element:{uuid}`，按 agent 优先级排序，上限 200 元素；分页 `offset` 读取；快照按 tab 保存、TTL 5 分钟、主导航变更即失效。动作时 `ref → backendNodeId → DOM.getBoxModel → 中心坐标`（先 scrollIntoViewIfNeeded）。
- **embedded-browser-manager.ts**：单例；`executeAgentTool(sessionId, action, input)` 校验 action ∈ 22 个 union；维护 tabs、当前 tab、URL 状态；事件（导航/截图）经 EventBus 推渲染层。
- **工具层**：`src/main/agent/tools/browser.ts` 单工具 `browser({ action, input })`，zod schema 注册进 `dispatcher.ts`；结果 JSON 序列化后截断 ≤64KiB；截图写 `~/.shy/artifacts/browser/`，返回 `{ path, width, height }`（base64 只走渲染事件，不进 LLM 结果，省 token）。
- **IPC**（`shared/ipc.ts` 新增常量 + preload）：`browser:show / hide / set-bounds / get-state / navigate / screenshot / open-external`。open-external 保留 confirm 闸门（沿用 computer.ts 逻辑）。
- **布局换算**：渲染层传 CSS 像素 + `zoomFactor`，主进程换算 DIP；window resize 时渲染层重发 set-bounds。

## 3. Agent loop 增强（`src/main/agent/turn-runner/`）

- **hooks**：`TurnHooks { beforeLlmCall?, afterLlmCall?, beforeToolCall?, afterToolCall?, onHistoryChanged?, onStepEnd? }`（数组）。触发点埋在 `lifecycle.ts` 纯步骤中：
  - `beforeLlmCall(input) → 'continue' | { type: 'skip', reason } | { type: 'replaceMessages', messages, reason } | { type: 'abort', reason }`（compaction 未来可迁入此处，本期仅埋点）
  - `afterLlmCall(input) → 'continue' | { type: 'retry', reason, prompt } | { type: 'fail', reason }`
  - before/afterToolCall 包裹 `runTools` 每次调用（before 可返回 `{ type: 'skip', reason }`）
  - `onHistoryChanged` 在 appendHistory 后；`onStepEnd` 在 decideNext 前
- **dispatch_subagent 工具**：`builtin.ts` 新增，参数 `{ type: 'explore'|'worker'|'verifier', task, maxSteps?, maxTokens? }`，内部调 `subagent/runner.ts`，结果截断；沿用现有并发上限 3。

## 4. UI（`src/renderer/src/`）

- **浏览器面板**：ChatWorkspace 右侧可切换区域（Header 加「浏览器」开关）；开启时主进程把 WebContentsView bounds 放到该区域（渲染层算好 DIP rect 经 set-bounds 下发）；面板顶条显示当前 URL/标题 + 后退/刷新/关闭；面板关闭 = hide。截图预览：浏览器工具产生截图时事件携带 artifacts 路径，面板底部缩略图列表。
- **ToolCallCard**：`browser` 工具显示 action 摘要 + 结果内截图路径缩略图；`dispatch_subagent` 显示类型徽标与返回摘要。
- **SlashMenu / SkillsView**：数据源改为 `skillsList` 新返回（含 rootKind/enabled）；SkillsView 加来源徽章列 + 启用 toggle + skills_changed 自动刷新。

## 权限与安全

- 浏览器 partition 独立（persist:shy-browser），不共享主会话 cookie。
- `browser` 工具 navigate 到 file:/javascript: 需 confirm；upload_files 路径做 realpath 校验。
- 不引入新的自动外发行为。

## 测试策略

- registry：临时目录多根扫描/去重/watch（fake timers）；catalog 预算截断。
- cdp-helper：fake webContents.debugger 记录命令序列断言参数。
- snapshot：fake captureSnapshot 数据 → ref 分配/解析往返。
- hooks：lifecycle 单测断言触发顺序与决策分支。
- 工具：browser/skill/dispatch_subagent 以注入 fake manager/registry 方式单测。
