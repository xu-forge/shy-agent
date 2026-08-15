# Design: goal-driver-acceptance

目标模式拆成两层：GoalDriver 拥有生命周期与客观验收；LangGraph 只打一段工。交互式模式不走 Driver。

## 职责

**GoalDriver**

- 启动时一次 plan（LLM）：产出清单及每项 `check` 命令
- 循环：调用工作图一段 → 落盘 → 执行子项 check →（子项全过时）执行 `verifyCommand` → 全过则结束，否则把失败写入下一段输入
- token 预算、停滞、暂停/取消
- `runStatus` 与 checkpoint
- 应用启动时恢复被中断的 `running` 会话

**工作图（`graph.ts` 收瘦）**

- 目标模式节点：`act → tools → act…`，达到 `segmentSteps` 正常结束本段
- 删除作为完成判定的 `verifyNode` / `routeAfterVerify`
- 不写入 `done` / `evidence` / `lastExitCode`
- v1 清单的 title/`check` 在 plan 之后冻结；Driver 只更新验收字段

## 一次目标

```text
plan（若磁盘上尚无清单）
  → 循环：
      工作图打一段
      落盘
      跑未通过子项的 check
      子项全过且存在 verifyCommand → 跑总验收
      全过 → runStatus=completed
      有失败 → 回灌 evidence，下一段
      预算/停滞 → runStatus=paused（不自动续）
```

## 数据

`GoalChecklistItem`：`id`、`title`、`done`、`check?`（可执行命令）、`evidence?`（最近一次验收输出截断，约 8KB）、`lastExitCode?`。

会话新增：

- `verifyCommand`：用户钉死的总验收；agent 不可改
- `runStatus`：`idle | running | paused | completed | cancelled`
- `approvedChecks`：本会话已确认过的 check 命令，后续静默执行

现有 `paused` 布尔由 `runStatus === 'paused'` 派生，UI 可继续用。

迁移：`paused=1` → `paused`；其余历史会话 → `idle`。不把旧 checkpoint 当成 `running`，避免本 change 上线后误续历史任务。

## 完成规则（失败封闭）

1. 子项 `done === true` 当且仅当该项 `check` 退出码为 0。
2. 没有 `check` 的子项不能完成。
3. 清单非空时，每一项都必须有非空 `check`，否则视为 plan 失败，`runStatus=idle`，不开工。
4. 目标完成：清单为空则只认总验收；清单非空则每一项都过，且若有 `verifyCommand` 也必须过。
5. 清单为空且无 `verifyCommand`：拒绝开工，`runStatus=idle`。

## 验收执行

- 与 `shell_exec` 同一 shell；默认超时 5 分钟；工作目录为 Electron 主进程 cwd（命令字符串可自行 `cd`）。
- 顺序：未通过的子项 check → 全部通过后再跑 `verifyCommand`。
- 用户钉死的总验收：目标启动时确认一次，记入 `approvedChecks`。
- agent 写入的 `check`：第一次走高危确认；拒绝视为该项失败；通过后记入 `approvedChecks`。
- 超时、非零退出、启动失败：均为失败。

回灌：下一段注入一条消息，说明验收未通过、按输出修改、不要改验收命令；附 title、exit code、evidence。

停滞：连续 N 段（沿用 `stagnationRounds`）没有任何一项新通过、总验收也未通过 → 软暂停。有工具活动但验收零进展仍计停滞。

## 开机续跑

`app.whenReady`：IPC 与窗口就绪后，扫描 `mode === 'goal' && runStatus === 'running'`。

- 只自动续 `updated_at` 最新的一条
- 其余改为 `paused`，原因：启动时已有其它目标在跑
- 不续 `paused` / `completed` / `cancelled` / `idle`
- 续跑先跑一轮验收，再决定是否再打工作段

崩溃时主进程来不及把状态写成 paused，磁盘上保持 `running`，这正是自动续跑的信号。用户点暂停必须先落盘 `paused`。

## 错误与边界

- 暂停：当前工作图或验收在闸门口停下，进度已落盘。
- 取消：结束循环，`cancelled`，checkpoint 保留但不自动续。
- 预算打满：`paused`，原因 `budget`。
- 交互式模式：不创建 Driver，行为与现在一致。

## 测试

不依赖真实 LLM：plan/工作图用假 provider 或直接驱动 Driver 的验收与续跑 API。

1. 子项 check 非零 → done 仍 false，下一段输入含 evidence
2. 子项全绿、总验收失败 → 未完成，总验收输出回灌
3. 无总验收且无任何 check → 拒绝开工
4. 磁盘 `running` 且无活 runtime → 模拟启动后续上
5. `paused` 启动后仍暂停
6. 两个 `running` → 只续最新一条，另一条变 paused
