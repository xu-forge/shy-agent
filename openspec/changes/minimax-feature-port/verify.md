# Verify: minimax-feature-port

## 自动化验证（2026-08-22）

- `npm run typecheck`：0 错误（node + web 两套 tsconfig）
- `npm test`：56 test files / 380 tests，367 passed + 13 skipped，0 failed（原 330 测试无回归，新增 37：skills registry 11、cdp-helper 8、snapshot 5、embedded-browser-manager 7、turn hooks 5 等）
- `npm run build`（electron-vite）：通过
- `npx openspec validate minimax-feature-port --strict`：valid

## 实现与设计的偏差（已记录）

- 快照实现用注入页面脚本（CSS 路径 + 视口矩形）替代 MiniMax 的 `DOMSnapshot.captureSnapshot + AX 树`：ref → CSS 路径 → 动作时 `DOM.querySelector` → box model 坐标，语义等价且代码量小一个量级。
- `browser-actions.ts` 独立文件未拆（动作直接内联在 `embedded-browser-manager.ts` 的 `executeAgentTool` switch 中）。
- IPC 通道名实际为 `shy:browser-*`（原计划 `browser:*` 前缀），并额外补了 back/forward/reload 三个通道；open-external 由既有 `browser_open`（computer.ts）覆盖。
- 截图经新增 `shy-asset://` 特权协议在渲染层展示（`protocol.handle` + 路径穿越防护）。

## 未完成（待人工）

- 5.4 手动 Electron 走查：技能热重载与来源徽章；浏览器面板打开网页 → inspect → click/fill → screenshot；dispatch_subagent 一次 explore 任务。需要真实模型 key 与图形环境。
