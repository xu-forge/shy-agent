## ADDED Requirements

### Requirement: 高危操作确认闭环
当 main 请求高危确认时，系统 MUST 向 renderer 发送 `confirm_required`（含 action、detail、requestId）；renderer MUST 展示 ConfirmDialog；用户选择 MUST 经 toolConfirm IPC 回传；120 秒内无响应 MUST 视为拒绝。

#### Scenario: 用户允许操作
- **WHEN** renderer 收到 confirm_required 且用户点击允许
- **THEN** 系统 MUST 调用 toolConfirm(requestId, true) 并关闭对话框，工具继续执行

#### Scenario: 用户拒绝或超时
- **WHEN** 用户点击拒绝或 120s 内未响应
- **THEN** 系统 MUST 解析为 false，工具 MUST 返回用户拒绝错误
