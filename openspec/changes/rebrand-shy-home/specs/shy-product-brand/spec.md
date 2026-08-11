## ADDED Requirements

### Requirement: User-Visible Product Name
用户可见品牌（侧栏品牌名、窗口标题、助手消息署名、关于/脚注文案等）MUST 显示为 `shy`，MUST NOT 再向用户展示产品名 `my-agent`。

#### Scenario: Shell chrome shows shy
- **WHEN** 用户打开应用主界面
- **THEN** 侧栏品牌与窗口标题 MUST 使用 `shy`

#### Scenario: Assistant identity
- **WHEN** 界面展示助手消息署名或系统提示中的自我身份
- **THEN** 身份 MUST 为 `shy`（或等价「你是 shy」），MUST NOT 为 `my-agent`

---

### Requirement: Technical Identifiers Use shy
构建与运行时技术标识 MUST 使用 shy：`package.json` 的 `name`、Electron appId / productName（若配置）、IPC 通道前缀 MUST 为 `shy:`；preload 暴露给 renderer 的主 API 对象 MUST 为 `window.shy`。

#### Scenario: IPC channel prefix
- **WHEN** 主进程与渲染进程通过 IPC 通信
- **THEN** 通道名 MUST 以 `shy:` 开头，MUST NOT 再注册 `my-agent:` 前缀通道作为权威接口

#### Scenario: Renderer API object
- **WHEN** 渲染进程调用本机能力
- **THEN** MUST 通过 `window.shy` 调用（实现完成时 MUST NOT 依赖 `window.myAgent` 作为唯一入口）
