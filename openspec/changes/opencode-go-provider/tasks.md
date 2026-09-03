## 1. Settings：provider 与 Go 端点

- [x] 1.1 `ModelSettings` 增加 `provider?: 'custom' | 'opencode-go'`；store 缺省 `custom`；未知/缺失当 `custom`
- [x] 1.2 实现 `resolveLlmConfig(settings, session?)`：Go 固定 `baseURL=https://opencode.ai/zen/go/v1`；model = `session?.model ?? settings.model`
- [x] 1.3 settings / resolve 单测（custom 不改 URL；Go 强制 URL；覆盖优先）

## 2. 会话 model 持久化

- [ ] 2.1 `sessions` 表 `ALTER` 增加可空 `model`；`rowToSummary` / create / get 读写
- [ ] 2.2 IPC + preload：`setSessionModel(sessionId, model | null)`（或等价 update）
- [ ] 2.3 sessions store 单测：新会话 null；更新后落盘

## 3. LLM 调用点接入

- [ ] 3.1 interactive `service.ts` / turn-runner 入口改用 `resolveLlmConfig`
- [ ] 3.2 goal-driver / verify / 标题生成等有 session 的路径改用同一 helper
- [ ] 3.3 抽测或更新现有测试：两会话不同 model 时请求参数正确（可 mock）

## 4. OpenCode Go 模型列表

- [ ] 4.1 内置 chat.completions 白名单常量（对照 Go 文档）
- [ ] 4.2 主进程 `listOpenCodeGoModels`：`GET …/v1/models` + 短缓存；失败回退白名单；过滤非 completions（能辨则滤）
- [ ] 4.3 IPC + preload；列表失败回退单测

## 5. 设置 UI

- [ ] 5.1 SettingsPanel：Provider 切换（Custom / OpenCode Go）
- [ ] 5.2 Go：API Key + 默认 model（可选手填或下拉）；baseURL 只读/隐藏并自动 Go
- [ ] 5.3 Custom：保留现有三字段

## 6. Composer 模型选择器

- [ ] 6.1 ChatWorkspace：Go 时 `model-pill` → 可选择控件；选项来自 `listOpenCodeGoModels`
- [ ] 6.2 选择写入当前会话 `model`，不改 `settings.model`；展示 `session.model ?? settings.model`
- [ ] 6.3 Custom 时保持只读 pill；会话 model 不在列表时仍显示该 id

## 7. 验收

- [ ] 7.1 `npm run typecheck && npm test` 通过
- [ ] 7.2 手测：Go+Key 请求打到 zen/go；两会话不同模型；新会话用全局默认；Custom 只读；列表失败有回退
