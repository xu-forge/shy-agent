## 1. 数据模型与设置

- [x] 1.1 shared/ipc.ts 扩展 check 与 tokenBudget/segmentSteps；移除 recursionLimit/hardRoundCap
- [x] 1.2 settings/store.ts 默认值

## 2. 图运行时

- [x] 2.1 AgentState 新增 tokenUsed / toolActivityCount / lastVerifyToolActivityCount
- [x] 2.2 usage 累计与 token 预算暂停
- [x] 2.3 工具级停滞判定
- [x] 2.4 verify prompt 与 check 透传；移除 hardRoundCap

## 3. 段式续跑循环（service）

- [x] 3.1 persistSegment 段尾落盘
- [x] 3.2 外部循环——单段 invoke → 未完成自动续段
- [x] 3.3 段间按需压缩（上下文水位超阈值才压缩）+ 注入 resume prompt
- [x] 3.4 recursionLimit 改大常量；移除设置读取

## 4. UI 与测试

- [x] 4.1 SettingsPanel：token 预算 + 段步数 + contextWindow 输入；移除 recursionLimit/hardRoundCap 输入
- [x] 4.2 typecheck / build / test 通过
