## ADDED Requirements

### Requirement: L2 Agent Run Log Files
系统 MUST 在每次 Agent 运行（交互或目标模式）开始时分配 `runId`，并将 L2 事件追加写入 `logs/agent/<run-id>.jsonl`。L2 MUST 至少包含：运行起止、每次面向用户的助手/LLM turn 记录、每次工具调用（名称与结果摘要）、错误与结束原因。单行过大字段 MUST 截断。日志写入失败 MUST NOT 阻断 Agent 主流程。

#### Scenario: Run produces jsonl
- **WHEN** 用户发起一次 Agent 对话或目标运行并至少完成一轮模型或工具活动
- **THEN** `logs/agent/` 下 MUST 出现对应 `runId` 的 `.jsonl` 文件，且文件中 MUST 含 `run_start` 与至少一条 `llm_turn` 或 `tool_call` 行

#### Scenario: Tool call logged
- **WHEN** Agent 成功或失败地执行工具并产生 tool 事件
- **THEN** 日志 MUST 追加 `kind=tool_call`（或等价）行，包含工具名与截断后的 detail

#### Scenario: Logging failure is non-fatal
- **WHEN** 日志目录不可写或单次 append 失败
- **THEN** Agent 运行 MUST 继续，错误 MAY 记入 `logs/app` 或主进程日志

---

### Requirement: Settings Run Log Browser
设置界面 MUST 提供「运行日志」分区：列出 `logs/agent` 下日志文件（按修改时间倒序）、支持查看某一文件的解析后内容（大文件可分段加载）、并 MUST 提供打开日志目录的操作。

#### Scenario: List logs in settings
- **WHEN** 用户打开设置且 `logs/agent` 中存在日志文件
- **THEN** 运行日志分区 MUST 展示文件列表供选择

#### Scenario: View log detail
- **WHEN** 用户选中某一日志文件
- **THEN** 界面 MUST 展示其内容（原始或按行解析的可读视图）

#### Scenario: Open logs directory
- **WHEN** 用户点击打开日志目录
- **THEN** 系统 MUST 在操作系统文件管理器中打开 `logs/agent`（或 shy home 日志根）目录
