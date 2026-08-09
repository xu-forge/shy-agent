<!--
Raw capture of superpowers:brainstorming (re-run).
OpenSpec redirect: written to this change's brainstorm.md (NOT docs/superpowers/specs/).
-->

# Brainstorm — bootstrap-electron-shell

## Background

- 产品：my-agent 个人 Agent 客户端（见 `docs/product-brief.md`）
- 仓库状态：绿地（仅 docs / openspec / AGENTS.md）
- 本 change：Electron 可运行空壳；不实现记忆 / LangGraph / Skills / 本机工具
- 平台：Windows + macOS
- Superpowers brainstorming 重跑日期：2026-08-10

## Clarifying decisions (this session)

| Q | Decision |
|---|----------|
| 默认主内容区 | **A** — 就绪/欢迎 + 侧栏三入口（聊天 / 记忆 / 技能占位） |
| 质量工具 | **A** — ESLint + Prettier + TypeScript 严格模式 |
| 脚手架方案 | **A / 方案 1** — electron-vite + electron-builder |
| UI/交互对标 | **参考 Codex**（对话优先、工具过程可读、界面克制） |

## Approaches considered (scaffold)

1. **electron-vite + electron-builder（选定）** — 一体 TS/React，Win/Mac 打包省事  
2. 手写 Vite renderer + 独立 Electron main — 控制力强，样板过重  
3. Electron Forge — 完整但无既有偏好，磨合成本不更低  

## Design (approved §1–§4)

### §1 Architecture

- main：窗口、生命周期、`ipcMain`（`ping`、`getPaths`）
- preload：`contextIsolation` + `contextBridge` → `window.myAgent`
- renderer：React 壳 UI（Codex 风格布局）
- 安全：`contextIsolation: true`，`nodeIntegration: false`
- 数据根约定：`app.getPath('userData')`（本 change 只读查询）
- 明确不做：LangGraph / 记忆 / Skills / 本机工具

### §2 Directory & IPC

```text
src/main/
src/preload/
src/renderer/
src/shared/          # IPC 契约类型
```

- `ping()` → `'pong'`
- `getPaths()` → `{ userData, platform }`
- npm；scripts：`dev` / `build` / `test`（vitest）
- ESLint + Prettier

### §3 UI / Interaction (Codex-inspired)

- 对话区为主视觉；左侧窄栏：聊天 / 记忆 / 技能
- 默认：就绪说明 + 空对话轮廓；输入框可见但本阶段不发送
- 记忆/技能：克制占位，不伪造能力
- 少卡片/少徽章；可留一处静态「工具轨迹示意」条
- 预留「交互式 / 目标」模式切换外观（disabled 或仅 UI）
- 简体中文；CSS 变量定基础色板
- 不做：真实发消息、流式、真实工具轨迹、会话列表后端

### §4 Testing & acceptance

- vitest：IPC/纯函数形状
- 手工：`npm run dev` 冒烟（窗口、侧栏、就绪+空对话、模式占位、ping）
- ESLint + Prettier + `tsc` 通过
- Windows 本机验收；macOS 配置+README（无 Mac 不阻塞）
- 非目标：E2E、签名、真实 Agent 联调

## Out of scope

LangGraph、OpenAI-compatible 客户端、SQLite 记忆、Skills CRUD、电脑操作、双模式真实执行。

## Approval

用户已口头批准 §1–§4（2026-08-10）。  
下一步：落盘后请用户审阅本文件及同步后的 `design.md` / specs，再进入 `writing-plans`。
