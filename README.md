<div align="center">

# shy

**一个跑在你自己电脑上的个人 Agent 客户端。**

自带模型接口、分层记忆、本地技能包、内置可视化浏览器与子代理编排 ——
数据全部落在你自己的 `~/.shy`，不经过任何第三方服务端。

[快速开始](#-快速开始) · [功能](#-功能) · [架构](#-架构) · [路线图](#-路线图)

</div>

---

## 为什么是 shy

市面上的 Agent 产品大多把会话、记忆和凭据托管在云端。shy 反其道而行：

- **本地优先** —— 会话/记忆/技能/日志全部本地存储（SQLite + 文件系统），`SHY_HOME` 可重定向
- **模型自由** —— 任何 OpenAI-compatible 端点（Minimax、DeepSeek、本地 vLLM/Ollama…）
- **自主但有闸门** —— 目标模式可以整夜自跑，删除/敏感写/高危命令强制用户确认
- **可观测** —— 每次 LLM turn 与工具调用落 L2 日志，思考流实时可见

## ✨ 功能

### 对话与自主执行

- **交互式模式** —— 逐步协作，流式输出 + 工具调用时间轴
- **目标模式** —— LLM 生成验收清单后自动续跑：分段落盘、崩溃恢复、停滞软暂停、blocked 审计、token 预算、完成报告
- **子代理** —— `task`（后台）与 `dispatch_subagent`（同步）派发 explore / worker / verifier 三类子代理，并发与预算受控
- **Turn hooks** —— `beforeLlmCall / afterLlmCall / beforeToolCall / afterToolCall / onHistoryChanged / onStepEnd` 六类扩展点，支持 skip / replaceMessages / retry / fail 决策语义

### 技能系统（多根注册表）

- 四级来源根：**project**（`.shy/skills`）> **agent** > **user**（`~/.shy/skills`）> **builtin**，同名按优先级去重
- 目录 + `SKILL.md`（YAML frontmatter），兼容旧单文件格式
- `fs.watch` 热重载，编辑保存即生效并推送 UI
- system prompt 注入 token 预算内的技能目录，LLM 用 `skill` 工具按需读取全文
- 每技能可启用/禁用，Agent 也能自建技能

### 内置可视化浏览器

- `WebContentsView` 内嵌于聊天窗口（独立 `persist:shy-browser` 分区，sandbox + contextIsolation）
- 原生 CDP 驱动：点击 / 输入 / 滚动 / 拖拽 / 截图 / 文件上传（`webContents.debugger`，无 Playwright 依赖）
- 元素快照 + `browser-element:{uuid}` ref 模型：分页、TTL、导航即失效
- 对 LLM 暴露单一 `browser` 工具（22 个 action），`file:` / `javascript:` 导航走确认闸门

### 记忆

- **长期记忆** —— SQLite，用户可查看/编辑/删除，Agent 写入时会通知你
- **短期记忆** —— 会话上下文超过水位阈值时保关键压缩（4 档策略，LLM 真总结）
- **技能目录与压缩共享 token estimator**，预算 = min(2% 上下文, 5000)

### 本机工具链

shell 执行、文件读写删（**相对路径一律落到会话工作区** `~/.shy/sessions/{id}/workspace`）、截图、GUI 点击、剪贴板等；高危操作（删除、敏感路径覆盖、安装类命令、GUI 动作）强制确认，可开「完全访问」跳过逐条弹窗。

## 🚀 快速开始

```bash
# 前置：Node.js 20+
git clone <repo> && cd my-agent
npm install
npx electron-builder install-app-deps   # better-sqlite3 原生模块
npm run dev
```

启动后打开 **设置 → 常规设置 → 模型接入**，填入任意 OpenAI-compatible 端点：

| 字段 | 示例 |
|------|------|
| Base URL | `https://api.minimaxi.com/v1` |
| API Key | `sk-…` |
| Model | `MiniMax-M3` |

（可选）`npx playwright install chromium` 启用 headless `browser_fetch`。

## 🗂 数据目录

一切本机数据统一在 `~/.shy`（`SHY_HOME` 可覆盖）：

```
~/.shy/
├── config/settings.json      # 模型与运行参数
├── db/shy.sqlite             # 会话 / 记忆 / 任务
├── skills/                   # 用户级技能（SKILL.md）
├── skills-builtin/           # 内置种子技能
├── sessions/{id}/workspace/  # 每会话独立工作区（工具相对路径落点）
├── logs/agent/*.jsonl        # L2 运行日志
└── artifacts/                # 报告 / 截图（shy-asset:// 可展示）
```

首次启动若检测到旧 Electron `userData`（原 my-agent）数据，会自动迁移到 `~/.shy`。

## 🏗 架构

Electron 三进程 + 自研编排（无 LangChain 依赖）：

```
src/
├── main/                     # Electron 主进程
│   ├── agent/
│   │   ├── turn-runner/      # 8 步生命周期 + hooks（核心循环）
│   │   ├── graph.ts          # LangGraph 形状适配器
│   │   ├── service.ts        # 会话编排 / catalog 注入 / 压缩
│   │   ├── goal-driver.ts    # 目标模式：清单/验收/续段/预算
│   │   ├── subagent/         # 子代理 runner + store
│   │   ├── tools/            # 自研 dispatcher + 内置工具
│   │   │                     #   shell / fs / memory / skill / browser / task…
│   │   └── compaction/       # 4 档上下文压缩
│   ├── browser/              # 内嵌浏览器（manager/controller/CDP/快照）
│   ├── skills/               # 多根注册表 / catalog / 启用状态
│   ├── memory/               # 长期记忆 + 短期压缩
│   ├── sessions/             # SQLite 会话存储
│   ├── schedule/             # cron 定时任务 + 提醒
│   └── event-bridge/         # 1-to-N EventBus → IPC → 渲染层
├── preload/                  # contextBridge 类型化 API（window.shy）
└── renderer/                 # React 19 界面（ink & amber 设计体系）
    └── src/components/       #   对话 / 技能 / 日历 / 记忆 / 设置 / 浏览器面板
```

事件流：主进程 `EventBus` → `bridgeEventBusToIpc` → 渲染层 `onEvent` 订阅（`assistant_delta` 思考流、`tool_call/result`、`goal_complete`、`skills_changed`、`browser_navigated/screenshot`…）。

## 🧪 测试与脚本

```bash
npm test          # vitest（380+ 用例：registry/CDP/快照/hooks/工作区…）
npm run typecheck # tsc node + web 双工程
npm run lint      # eslint
npm run build     # electron-vite 构建
npm run build:win # Windows 安装包
npm run build:mac # macOS 安装包（需在 macOS 执行）
```

## 🔧 扩展点

- **新工具**：`registerTool(name, factory)`（`src/main/agent/tools/registry.ts`），zod schema 自动转 OpenAI tool format
- **Turn hook**：`RunTurnDeps.hooks`（`src/main/agent/turn-runner/types.ts`）
- **技能根**：`buildDefaultSkillRoots`（`src/main/skills/registry.ts`）
- **功能开发流程**：OpenSpec change（见 `openspec/changes/`，schema=superpowers-bridge）

## 🗺 路线图

- [ ] MCP 协议支持
- [ ] 多模型切换与会话级模型绑定
- [ ] 浏览器多 tab 管理界面
- [ ] 项目/分组数据模型
- [ ] 插件化技能市场

## 📄 许可证

MIT
