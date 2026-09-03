## ADDED Requirements

### Requirement: 日历实例运行状态
周卡片与月短条的状态文案 MUST 优先反映关联 run：`running` → 执行中；`succeeded` → 执行成功；`failed` → 执行失败；`waiting_confirm` → 等待确认。无 run 时：任务未启用 → 已暂停；`at` 仍在未来 → 待执行；`at` 已过去 → 未执行。MUST NOT 将「过去且无 run」展示为执行成功。

#### Scenario: 成功态
- **WHEN** 某实例存在 `status=succeeded` 的 run
- **THEN** 日历上该实例 MUST 显示「执行成功」（或等价成功文案）

#### Scenario: 过去无 run
- **WHEN** 实例 `at` 已过且无对应 run
- **THEN** 状态 MUST 为「未执行」且 MUST NOT 为「执行成功」

---

### Requirement: 结果弹层
当用户点击存在 run 的实例时，系统 MUST 打开结果弹层（而非仅配置详情），至少包含：标题、「本地」标识、状态徽章、开始时间、结束时间（若有）、耗时（若可计算）、正文区。正文规则：提醒成功 → 提醒文案；跑技能成功 → 优先会话 `result_content`，否则最后一条非空助手消息，仍空则可读占位；失败 → `errorMessage`；执行中 → 进行中说明。弹层 MUST 提供「查看定时任务」；当 run 含 `sessionId` 时 MUST 提供「继续对话」。

#### Scenario: 打开成功结果
- **WHEN** 用户点击已成功执行的跑技能实例
- **THEN** MUST 出现结果弹层，展示成功态、时间信息与结果正文，且提供「继续对话」与「查看定时任务」

#### Scenario: 提醒已发出
- **WHEN** 用户点击已成功提醒的实例
- **THEN** 正文区 MUST 展示提醒文案，且可不提供「继续对话」（无 session 时）

---

### Requirement: 无 run 时配置详情
当用户点击尚无 run 的实例时，系统 MUST 继续打开现有配置详情弹层（标题、本地、状态、频率、预计时间、动作摘要、「查看定时任务」），MUST NOT 假装已有执行结果。

#### Scenario: 尚未触发
- **WHEN** 用户点击未来的待执行实例且无 run
- **THEN** MUST 打开配置详情且 MUST NOT 展示伪造的执行成功正文

---

### Requirement: 继续对话导航
用户在结果弹层选择「继续对话」时，系统 MUST 导航打开该 run 的 `sessionId` 对应会话（与侧栏打开会话同一用户路径）。

#### Scenario: 打开会话
- **WHEN** 结果弹层存在 `sessionId` 且用户点击「继续对话」
- **THEN** UI MUST 切换到该会话视图

---

### Requirement: 编辑表单策略控件
定时任务创建/编辑表单 MUST 提供：模式（目标 / 普通，默认目标）、允许自动确认高危（默认关，附简短说明）、所属项目（项目列表 +「未选择项目」，默认未选择）。保存后再次打开 MUST 回显已存值。

#### Scenario: 回显
- **WHEN** 用户将任务设为普通模式、开启自动确认并选择某项目后保存再编辑
- **THEN** 表单 MUST 回显上述三项
