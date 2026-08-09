## 1. 工程初始化

- [ ] 1.1 用 electron-vite 初始化 TypeScript + React 工程结构（保留现有 `docs/`、`openspec/`、`AGENTS.md`）
- [ ] 1.2 配置 npm scripts：`dev`、`build`、`test`（vitest）、`lint`、`format`
- [ ] 1.3 配置 ESLint + Prettier + TypeScript strict
- [ ] 1.4 写入/更新 README：Win/Mac 开发步骤、脚本说明、目录约定
- [ ] 1.5 配置 electron-builder 目标含 win 与 mac

## 2. 主进程与安全 IPC

- [ ] 2.1 实现 BrowserWindow 创建，启用 `contextIsolation` 且关闭 renderer `nodeIntegration`
- [ ] 2.2 实现 preload `contextBridge`，暴露 `window.myAgent`（ping + getPaths）
- [ ] 2.3 主进程处理对应 IPC，返回可验证结果
- [ ] 2.4 为路径/IPC 纯逻辑补充 vitest 最小测试

## 3. 渲染层壳 UI（Codex 风格）

- [ ] 3.1 实现左窄栏导航：聊天 / 记忆 / 技能（简体中文）+ CSS 变量基础色板
- [ ] 3.2 实现默认就绪说明 + 空对话轮廓 + 可见不可发送的输入区
- [ ] 3.3 增加「交互式 / 目标」模式切换外观占位（无真实执行）
- [ ] 3.4 记忆/技能入口显示克制占位，不伪造业务能力
- [ ] 3.5 就绪态调用 ping 并展示 IPC 正常（可放状态条，克制展示）

## 4. 验收收尾

- [ ] 4.1 Windows 上 `npm run dev` 冒烟：布局、占位、ping、lint
- [ ] 4.2 核对 app-shell / renderer-shell-ui 规格场景
- [ ] 4.3 更新 `openspec/config.yaml` 的 `dev_stack_command`（如适用）
