## ADDED Requirements

### Requirement: 会话顶栏 Dock 工具条
当会话为主列且允许展示右侧 Dock 时，会话顶栏右侧 MUST 提供四个控件，从左到右为：打开方式、内置浏览器、文件目录、任务详情。打开方式 MUST 为下拉，MUST NOT 单独展开一块 Dock 内容。

#### Scenario: 有对话时可见
- **WHEN** 未绑定会话已有用户或助手消息，或代码项目处于普通会话布局
- **THEN** 顶栏 MUST 显示上述四个控件

#### Scenario: 代码 IDE 不展示
- **WHEN** 会话已绑定代码项目且布局为 IDE（文件树 | 编辑器 | 右侧会话）
- **THEN** 界面 MUST NOT 在会话 aside 上再叠一套本 Dock 工具条

---

### Requirement: 单一 Dock 互斥模式
右侧 MUST 至多展开一个 Dock。Dock 模式 MUST 为 `tasks`、`browser`、`files` 之一，或收起。点击浏览器、文件目录或任务详情 MUST 展开对应模式；再次点击当前模式 MUST 收起 Dock。缺省 MUST 为收起。展开与收起 MUST 使用水平滑动，收起后 MUST NOT 保留占位白边。

#### Scenario: 切换模式
- **WHEN** Dock 处于任务详情，用户点击文件目录
- **THEN** Dock MUST 保持展开并显示文件目录，MUST NOT 同时显示任务详情内容

#### Scenario: 再点收起
- **WHEN** Dock 处于浏览器模式，用户再次点击浏览器控件
- **THEN** Dock MUST 收起，宽度 MUST 过渡到 0

#### Scenario: 展开后收起钮位置
- **WHEN** Dock 已展开
- **THEN** 收起控件 MUST 在 Dock 标题栏右上角，会话顶栏 MUST NOT 再显示浏览器/目录/任务详情三个开关（打开方式下拉可保留）

---

### Requirement: 打开方式在访达中显示
打开方式下拉 MUST 提供「在访达中显示」（Windows 上为资源管理器等价打开）。目标路径：会话已绑定项目时 MUST 为该项目 `rootPath`；否则 MUST 为该会话默认 workspace 目录。

#### Scenario: 未绑定打开 workspace
- **WHEN** 用户在未绑定会话选择「在访达中显示」
- **THEN** 系统 MUST 打开 `sessions/{sessionId}/workspace` 对应目录（不存在时可创建后再打开）

#### Scenario: 已绑定打开项目根
- **WHEN** 用户在已绑定项目的会话选择「在访达中显示」
- **THEN** 系统 MUST 打开该项目 `rootPath`

---

### Requirement: 任务详情模式
`tasks` 模式 MUST 展示「任务详情」：上方面板为进度/步骤（目标清单与 Agent 任务），下方面板为产物列表。产物条目 MUST 显示会话或项目工作区下的相对目录与文件名，MUST NOT 把本机绝对路径作为主文案。

#### Scenario: 相对路径产物
- **WHEN** 产物文件位于会话 workspace 下 `guides/a.html`
- **THEN** 产物面板 MUST 显示目录 `guides` 与文件名 `a.html`，MUST NOT 以 `/Users/.../workspace/guides/a.html` 作为主标签

#### Scenario: 空态
- **WHEN** 当前会话无任务且无 write 产物
- **THEN** 两块面板 MUST 分别显示暂无任务、暂无产物

---

### Requirement: 浏览器模式
`browser` 模式 MUST 在 Dock 内嵌入现有内置浏览器面板。离开该模式或收起 Dock 时 MUST 隐藏原生浏览器视图。

#### Scenario: 打开浏览器
- **WHEN** 用户点击地球控件
- **THEN** Dock MUST 展开并显示内置浏览器地址栏与页面槽

#### Scenario: 切走则隐藏
- **WHEN** 用户从浏览器模式切到任务详情
- **THEN** 系统 MUST 隐藏原生 WebContents 视图，避免浮在其它模式之上

---

### Requirement: 文件目录与预览
`files` 模式 MUST 列出工作区目录树：未绑定会话根为该会话 workspace；已绑定项目根为 `rootPath`。树中路径 MUST 为相对路径。用户选中文件后，系统 MUST 按类型预览：图片、Markdown、HTML、纯文本 MUST 在 Dock 内只读预览；其它类型 MUST 用系统打开或在访达中显示，MUST NOT 当作可编辑 IDE。

#### Scenario: 未绑定只列 workspace
- **WHEN** 未绑定会话 workspace 内有 `攻略.html`
- **THEN** 文件树 MUST 显示 `攻略.html`，MUST NOT 显示 `~/.shy/sessions/...` 绝对前缀

#### Scenario: Markdown 预览
- **WHEN** 用户点选工作区内一个 `.md` 文件
- **THEN** Dock MUST 渲染该文件 Markdown 正文

#### Scenario: 未知类型
- **WHEN** 用户点选一个无预览器的二进制文件
- **THEN** 系统 MUST 在访达中显示或用系统默认应用打开，MUST NOT 在 Dock 内当文本乱码展示为唯一结果
