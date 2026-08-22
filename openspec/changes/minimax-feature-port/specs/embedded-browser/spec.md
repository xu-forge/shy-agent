## ADDED Requirements

### Requirement: 内嵌浏览器视图
系统 MUST 以 `WebContentsView`（独立 partition `persist:shy-browser`、sandbox、contextIsolation）在主窗口内呈现浏览器内容；同一时刻 MUST 至多一个 tab 可见；隐藏 MUST 不销毁 WebContents。

#### Scenario: 显示与隐藏
- **WHEN** 渲染层请求 show 后请求 hide
- **THEN** 浏览器区域分别附着与移出主窗口，tab 状态保留

### Requirement: browser 工具
系统 MUST 向 LLM 暴露单一 `browser` 工具，action 集合 MUST 覆盖：inspect、query、navigate、open_tab、back、forward、reload、click、double_click、drag、hover、fill、type、press_key、check、uncheck、select_option、scroll、wait、screenshot、upload_files；结果序列化后 MUST ≤64KiB。

#### Scenario: 导航并快照
- **WHEN** LLM 依次调用 navigate 与 inspect
- **THEN** 工具 MUST 返回页面可交互元素列表，元素带 `browser-element:{uuid}` ref

#### Scenario: ref 点击
- **WHEN** LLM 用先前 inspect 返回的 ref 调用 click
- **THEN** 系统 MUST 解析 ref 到元素坐标并注入 CDP 鼠标事件

#### Scenario: 快照过期
- **WHEN** 主文档发生导航后使用旧 ref
- **THEN** 工具 MUST 返回 ref 失效错误并提示重新 inspect

### Requirement: 截图
screenshot 动作 MUST 经 `Page.captureScreenshot` 产生 PNG 并落盘 `~/.shy/artifacts/browser/`，结果含文件路径与尺寸。

#### Scenario: 截图落盘
- **WHEN** LLM 调用 screenshot
- **THEN** artifacts 目录出现 PNG 文件，工具结果含其路径与宽高

### Requirement: 安全闸门
navigate 到 `file:` / `javascript:` URL MUST 经过用户确认；upload_files 路径 MUST 做 realpath 校验。

#### Scenario: 高危导航确认
- **WHEN** LLM 调用 navigate 指向 file: URL
- **THEN** 系统 MUST 弹确认，拒绝则导航不执行

### Requirement: 渲染层控制通道
系统 MUST 提供 IPC：show / hide / set-bounds / get-state / navigate / screenshot / open-external；页面导航与截图 MUST 以事件推送到渲染层。

#### Scenario: 状态查询
- **WHEN** 渲染层调用 get-state
- **THEN** 返回 tabs、当前 tab、URL 与标题
