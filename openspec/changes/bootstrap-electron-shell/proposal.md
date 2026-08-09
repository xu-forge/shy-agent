## Why

仓库目前只有产品简报与 OpenSpec 流程，没有可运行的客户端骨架，后续记忆、LangGraph、Skills 等能力没有挂载点。现在先落地 Electron + React + Vite 跨平台（Win/Mac）空壳，能本地启动与构建，为后续 change 提供稳定工程基线，避免业务与脚手架纠缠。

## What Changes

- 新增 Electron 桌面应用工程（TypeScript）：main / preload / renderer（React + Vite）
- 配置安全默认（contextIsolation、无 renderer nodeIntegration）与最小 IPC 骨架
- 提供 `npm run dev` / 构建脚本，覆盖 Windows 与 macOS 开发路径
- 增加 Codex 风格 UI 壳：左窄栏（聊天 / 记忆 / 技能）、就绪说明 + 空对话轮廓、模式切换占位；输入区不可真实发送
- 配置 ESLint + Prettier + TypeScript 严格模式
- 补充 README 与目录约定；不引入 Agent/记忆/工具业务实现

**工程基线**
- From: 无应用代码，仅 docs + openspec
- To: 可启动的 Electron 壳与约定目录
- Reason: 为后续能力提供宿主
- Impact: non-breaking（绿地新增）

## Capabilities

### New Capabilities

- `app-shell`: 桌面应用窗口生命周期、安全 preload/IPC 骨架、跨平台启动与基础构建
- `renderer-shell-ui`: React 渲染层 Codex 风格导航/对话轮廓与占位（无真实 Agent 功能）

### Modified Capabilities

- （无 — `openspec/specs/` 尚无既有能力）

## Impact

- 新增 npm 依赖：electron、electron-vite、react、typescript、electron-builder（或等价）等
- 新增源码树（建议 `src/main`、`src/preload`、`src/renderer`）与配置文件
- 开发机需 Node.js；Mac 构建需在 macOS 或后续 CI 上验证
- 不影响已有产品简报内容；为后续 `agent-runtime-langgraph` 等 change 预留扩展点
