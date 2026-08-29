# Tasks: active-file-context

## 1. 协议与 reminder

- [x] 1.1 `shared/ipc.ts`：`ChatRequest` 增加可选 `activeView?: { kind: 'code' | 'material'; relativePath: string }`；preload 类型同步
- [x] 1.2 `ReminderInput.env` 增加可选 `activeView`；新增 `activeFileReminderProvider`（有路径才输出 `<active-file>` 块与读/忽略规则）；注册到 default registry（非 critical）；单测：有/无字段、空路径跳过
- [x] 1.3 `service` / `turn-runner`：`RunArgs` 接收 `activeView`，本轮每次 `buildReminder` 传入同一快照；`appendMessage` 仍只存用户原文；单测或现有 turn-runner 用例断言 prompt 含路径

## 2. Renderer 上报

- [ ] 2.1 `CodeWorkspace` 向父级回调当前 `activePath`（无 tab 时 `null`）；关闭最后 tab 清掉
- [ ] 2.2 `MaterialLibrary` 向父级回调 lightbox 打开时的 `relativePath`，关闭时 `null`；lightbox 内切换文档同步更新
- [ ] 2.3 `App` 按当前工作区 kind 汇总 `activeView`；`ChatWorkspace.onSend` 写入 `chat({ ..., activeView })`；无查看文件则省略字段

## 3. 验收

- [ ] 3.1 `npm run typecheck` 通过
- [ ] 3.2 `npm test` 通过
- [ ] 3.3 手工：代码 tab / 素材 lightbox / 无关问题 / 发送后关 lightbox 本轮仍带快照
