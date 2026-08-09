## Context

`demo/my-agent` 已完成产品发现与 OpenSpec + `superpowers-bridge` 初始化，应用代码仍为空。本 change 建立 Electron + React + Vite 宿主（Win/Mac），UI/交互骨架参考 Codex。约束：安全默认；ESLint + Prettier；不实现 Agent 业务。

经 Superpowers brainstorming 重跑确认：默认就绪页+侧栏；脚手架选 electron-vite + electron-builder。

## Goals / Non-Goals

**Goals:**

- `npm install` + `npm run dev` 打开 Codex 风格壳窗口
- 安全 preload/IPC 骨架（`ping`、`getPaths`）
- 侧栏：聊天 / 记忆 / 技能；主区就绪 + 空对话轮廓；模式切换仅占位
- ESLint + Prettier + TypeScript 严格模式；vitest 最小覆盖
- Win/Mac 构建配置就位；README 说明开发步骤

**Non-Goals:**

- 真实对话发送/流式、模型调用、LangGraph
- SQLite 记忆与上下文压缩
- Skills 加载/CRUD、本机自动化
- E2E、代码签名/公证

## Decisions

### D1：脚手架
- **选择**：electron-vite + electron-builder
- **理由**：一体 TS/React，跨平台打包成本低
- **已考虑**：手写双管线；Electron Forge

### D2：安全模型
- **选择**：`contextIsolation: true`；`nodeIntegration: false`；preload `contextBridge` 暴露 `window.myAgent`
- **理由**：后续高权限本机操作，壳阶段锁定边界

### D3：UI 信息架构（Codex）
- **选择**：左窄栏模块入口 + 主对话区；默认就绪说明与空对话轮廓；输入框可见不可发送；「交互式/目标」控件占位
- **理由**：用户要求对标 Codex；壳阶段对齐交互心智，避免他日大改布局
- **已考虑**：极简单页 Hello；直接假聊天且无侧栏

### D4：质量工具
- **选择**：ESLint + Prettier + TS strict
- **理由**：用户选定；减少后续返工

### D5：测试
- **选择**：vitest 测 shared/IPC 纯逻辑；UI 手工冒烟；无 E2E
- **理由**：壳阶段轻量且可验证

### D6：userData
- **选择**：`app.getPath('userData')` 只读暴露；不写业务数据
- **理由**：统一 Win/Mac 持久化根

## Risks / Trade-offs

- [Risk] Codex 视觉细节主观 → Mitigation: 以「对话优先、克制、少卡片」为验收原则，色板用 CSS 变量便于迭代
- [Risk] Mac 签名/实机无法在 Win 上完整验证 → Mitigation: README + builder 配置就位；实机后续补
- [Trade-off] 壳阶段放模式切换占位可能改文案 → 接受，避免布局返工
- [Risk] electron-vite 模板覆盖现有 docs/openspec → Mitigation: 生成时保留/合并，禁止删除 openspec

## Migration Plan

N/A — 绿地。回滚删除新增源码与依赖即可。

## Open Questions

- 应用显示名 / bundle id 是否品牌化？（壳阶段可用 `my-agent` / `com.local.my-agent`）
- 图标：默认 Electron 图标直至有设计资产
