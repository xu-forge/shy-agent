# Proposal: active-file-context

## Why

代码项目打开某个 tab、素材项目打开 lightbox 后发起会话，模型目前不知道用户在看哪个文件。用户必须手动 `@` 或复述路径，否则「这段怎么改」无法落到当前文件。需要在发消息时隐式带上正在看的路径，并让模型仅在问题相关时去读它。

## What Changes

- **发送快照**：代码项目取当前激活 tab 的 `relativePath`；素材项目仅当 lightbox 打开时取当前素材 `relativePath`。无打开文件则不加字段。
- **隐式注入**：`ChatRequest` 增加可选 `activeView`；本轮 agent run 挂在运行时上下文，**不**写入用户消息正文/历史。
- **system-reminder**：新增 `<active-file>`：路径、kind（code|material）；规则为「有关则 `fs_read`，无关则忽略且不要主动提及」。不附文件预览或全文。
- **快照冻结**：本轮工具循环沿用发送瞬间的 `activeView`，不随用户随后切 tab / 关 lightbox 变化。

## Capabilities

### New Capabilities

- `active-file-context`：会话发送时可选携带当前查看文件，经 system-reminder 告知模型。

### Modified Capabilities

（无——不改代码工作区/素材库的打开语义，只多一条上报通道。）

## Impact

- **renderer**：`CodeWorkspace` 上报 `activePath`；`MaterialLibrary` 在 lightbox 打开时上报当前项；`App` 汇总；`ChatWorkspace.onSend` 写入 `ChatRequest.activeView`。
- **shared/preload**：`ChatRequest` 增加 `activeView?: { kind: 'code' | 'material'; relativePath: string }`。
- **main**：`service`/`turn-runner` 把 `activeView` 传入 reminder `env`；新 provider `activeFileReminderProvider`。
- **测试**：provider 有/无路径的文案；ChatRequest 类型；可选 renderer 纯函数「何时构成 activeView」。
