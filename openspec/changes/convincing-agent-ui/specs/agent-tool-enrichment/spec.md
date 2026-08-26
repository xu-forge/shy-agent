## ADDED Requirements

### Requirement: 主 Agent 工具注册完整性
主 Agent（interactive 与 goal 的 act 阶段）MUST 注册本 change 定义的 enrichment 工具全集；subagent allowlist 与 `react-prompt.ts` 中引用的工具名 MUST NOT 出现在 ghost 状态（仅白名单有、未 `registerTool`）。

#### Scenario: 无 ghost 工具
- **WHEN** 审计 `SUBAGENT_TOOL_ALLOWLIST` 与 `registerTool` 注册表
- **THEN** allowlist 中每条工具名 MUST 在主 agent 或对应 subagent 运行时实际可调用

#### Scenario: prompt 与注册表一致
- **WHEN** 审计 `react-prompt.ts` 工具列表
- **THEN** 所列工具 MUST 全部已注册，且描述与 `registerTool` 的 description 语义一致

---

### Requirement: web_search 网页检索
系统 MUST 注册 `web_search(query, maxResults?)`，返回结构化 JSON（`query` + `results[]`，每项含 `title`、`url`、`snippet`），供 Search Renderer 展示。

#### Scenario: 主 agent 调用 web_search
- **WHEN** LLM 在 act 阶段发起 `web_search`
- **THEN** dispatcher MUST 执行并 emit `tool_call` / `tool_result`，且 result MUST 可被 renderer 解析为 snippet 列表

#### Scenario: 空结果
- **WHEN** 检索无命中
- **THEN** MUST 返回 `{ results: [] }` 而非抛未捕获异常

### Requirement: web_fetch 网页抓取
系统 MUST 注册 `web_fetch(url, waitMs?)`（可与既有 `browser_fetch` 共享实现），抓取指定 URL 正文/元数据；MUST 处理 redirect（跟随或返回新 URL 供重试，对齐 WorkBuddy WebFetch 规则）。

#### Scenario: 抓取成功
- **WHEN** LLM 调用 `web_fetch` 且 URL 可访问
- **THEN** result MUST 含 `url`、`title`（若有）、`content` 或 `snippet`，且 WebFetch Renderer MUST 展示摘要而非裸 JSON

#### Scenario: Redirect
- **WHEN** 抓取返回 3xx 至不同 host
- **THEN** 工具 MUST 在 result 中标注 `redirectUrl`，prompt SHOULD 引导模型用新 URL 重试

---

### Requirement: grep 工作区内容搜索
系统 MUST 注册 `grep(pattern, path?, glob?, maxMatches?)`，在工作区内用 ripgrep 或等价实现搜索文件内容；结果 MUST 含 `matches[]`（`file`、`line`、`text`）。

#### Scenario: 模式命中
- **WHEN** pattern 在工作区有匹配
- **THEN** MUST 返回有序 matches，且 MUST 限制 maxMatches 防止超大输出

#### Scenario: 无匹配
- **WHEN** pattern 无命中
- **THEN** MUST 返回 `{ matches: [] }`

### Requirement: glob 文件路径匹配
系统 MUST 注册 `glob(pattern, cwd?)`，返回匹配路径列表（相对工作区或绝对路径规范化）。

#### Scenario: glob 命中
- **WHEN** pattern 如 `**/*.ts` 有文件
- **THEN** MUST 返回 `paths[]` 数组

### Requirement: fs_list 目录列表
系统 MUST 注册 `fs_list(path?)`（prompt 已提及但未实现），列出目录条目（name、type、size 可选）。

#### Scenario: 列出工作区根
- **WHEN** 未传 path
- **THEN** MUST 列出当前工作区根目录

---

### Requirement: fs_edit 增量文件编辑
系统 MUST 注册 `fs_edit(path, old_string, new_string)` 或等价 patch 语义，在工作区内做精确替换编辑；MUST 捕获 diff 供 session 文件列表与 Edit Renderer 使用。

#### Scenario: 替换成功
- **WHEN** old_string 在文件中唯一匹配
- **THEN** MUST 写入新内容并返回 `{ ok: true, path }`

#### Scenario: 匹配不唯一
- **WHEN** old_string 零或多于一次出现
- **THEN** MUST 返回明确 error，且 MUST NOT 部分写入

---

### Requirement: read_me 可视化设计指南
系统 MUST 注册 `read_me(module)`，module MUST 支持 WorkBuddy 对齐的子集：`diagram`、`mockup`、`interactive`、`chart`、`art`；返回该模块的设计约束（CSS 变量、尺寸、配色、主题 light/dark 规则），供模型在 `show_widget` 前加载。

#### Scenario: 加载 diagram 模块
- **WHEN** LLM 调用 `read_me({ module: 'diagram' })`
- **THEN** MUST 返回结构化 design guide 文本，且 UI MAY 折叠展示（非用户主要阅读对象）

### Requirement: show_widget 内联可视化
系统 MUST 注册 `show_widget(spec)`，接受 `widgetType`（table、cards、chart、diagram、html 等）与 `data`/`html` payload；`tool_result` MUST 供 WidgetRenderer 流式或一次性渲染 inline 卡（非文件）。

#### Scenario: 合法 widget
- **WHEN** spec 合法
- **THEN** renderer MUST 渲染 visual 卡，且 MUST 适配当前 IDE 主题（light/dark）

#### Scenario: 非法 spec
- **WHEN** spec 无法解析
- **THEN** MUST 返回 error，renderer MUST NOT 崩溃

### Requirement: present_artifact 产物呈现
系统 MUST 注册 `present_artifact(paths?, url?)`（对齐 WorkBuddy `present_files`）：呈现 session artifacts 内文件或 http(s)/localhost URL；HTML 文件 MUST 可内嵌预览；多文件 MUST 支持批量 paths。

#### Scenario: 呈现本地 HTML
- **WHEN** path 指向 session 内 `.html` 产物
- **THEN** UI MUST 展示产物卡并 MUST 提供预览入口

#### Scenario: 呈现 localhost URL
- **WHEN** 传入 `http://localhost:*` URL
- **THEN** MUST 在内置 browser 预览面板打开（需服务已由 shell 启动）

#### Scenario: 路径越权
- **WHEN** path 不在允许范围
- **THEN** MUST 拒绝并返回 error

---

### Requirement: ask_user 用户澄清
系统 MUST 注册 `ask_user(question, options?)`，在模型需澄清或二选一时向用户提问；renderer MUST 展示问题与选项，用户回答 MUST 作为 tool result 回传 LLM。

#### Scenario: 多选项提问
- **WHEN** LLM 调用 `ask_user` 且含 options
- **THEN** UI MUST 渲染可点击选项，用户选择后 MUST 回传选中值

### Requirement: read_lints 诊断读取
系统 MUST 注册 `read_lints(paths?)`，返回工作区 TypeScript/ESLint 诊断（file、line、message、severity），供 ReadLints Renderer 展示。

#### Scenario: 有 lint 错误
- **WHEN** 工作区存在诊断
- **THEN** MUST 返回结构化 `diagnostics[]`

---

### Requirement: 主 Agent 暴露任务工具
主 Agent MUST 可调用既有 `task` / `task_query` / `task_output` / `task_stop`（与 WorkBuddy TaskCreate/TaskList 心智对齐）；时间轴 MUST 用 TaskToolRenderer 展示任务创建/更新摘要。

#### Scenario: 创建任务可见
- **WHEN** LLM 调用 `task` 创建子任务
- **THEN** timeline MUST 展示人话任务摘要（非仅 JSON）

---

### Requirement: 安全与权限
Enrichment 工具 MUST 复用 shy 既有 confirm 闸门：写/删/ shell / 越权路径 MUST 走高危确认；web_fetch/web_search MUST 受 network 策略约束（若项目已有 gate）。

#### Scenario: fs_edit 高危路径
- **WHEN** 编辑敏感路径（`.ssh`、settings 等）
- **THEN** MUST 触发 confirm 或拒绝

### Requirement: Widget 与预览渲染安全
Widget / HTML 预览 MUST 在 sandbox iframe 或预定义 React schema 内渲染；MUST NOT 对任意 HTML 无 CSP 地使用 `dangerouslySetInnerHTML`。

#### Scenario: 非信任 HTML
- **WHEN** widget payload 含任意 HTML
- **THEN** MUST sandbox 或 fallback 纯文本

---

## ADDED Requirements（Phase 2f 可选）

### Requirement: image_gen 图像生成（可选）
若 settings 配置图像 API，系统 MAY 注册 `image_gen(prompt, ...)`（对齐 WorkBuddy ImageGen）；MAY 提供 ImageGenRenderer。未配置 API 时 MUST 不在主 agent 工具列表暴露。

#### Scenario: 未配置 API
- **WHEN** 无 image API key
- **THEN** `image_gen` MUST NOT 出现在 LLM tools schema
