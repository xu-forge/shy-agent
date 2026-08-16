## Context

shy 目标模式已有段式续跑、checkpoint、token 预算、停滞暂停。完成却由同一模型在 `verifyNode` 勾清单决定，清单项在 UI 上被当成多个「目标」，过程消息与交付混在一起。

对照会话 `9388e328`：用户一句话目标被拆成 7 条清单；15:44 已有完整总结，系统因未勾项继续 act，把空档和崩溃当成新对话，直到 15:49 才结束。

约束：交互式模式不变；高危命令走现有确认闸门；不做关窗口后的 OS 守护；本 change 尚未写代码（0 任务），可直接改完成语义而不另开 change。

## Goals / Non-Goals

**Goals**

- GoalDriver 拥有目标生命周期；工作图只打一段工
- 用户原话冻结为唯一 `goal`；checklist 只是步骤
- 步骤做完后 `deliver` 一份完整结果（会话最底带标记 + 右侧产物 tab）；报告类再落盘文件
- 有 `check` / `verifyCommand` 时以退出码为准；模型声称不算完成
- `completed` 后硬停；运行时错误不进对话当成人话
- 启动后续被中断的 `running`（只续最新一条）

**Non-Goals**

- 改交互式模式
- 关窗口后继续跑 / 独立 worker
- 把目标模式 UI 改成非聊天壳
- 允许 agent 改写 `verifyCommand`

## Decisions

### D1. Driver 外循环，图只干活

选定：独立 `GoalDriver`；`graph.ts` 目标路径仅为 `act → tools`。  
备选：只加 `deliver` 节点、仍用 verify 勾清单 — 会与可执行验收打架。  
备选：目标模式改成非聊天运行 — UI 超出范围。

### D2. 完成对象是用户原目标

选定：启动时把用户消息写入 `goal` 并冻结；plan 只产出步骤，不得改写 `goal`。  
备选：plan 重写「总目标」+ 3–8 条清单当完成条件 — 即现状，同花顺会话已证明会漂。

### D3. 草稿可有，交付钉在对话末尾和产物栏

选定：过程可 emit 普通 assistant 草稿；仅 `deliver` 发 `type: 'result'`。同一份 `resultContent` 出现在：(1) 会话最底带「完整结果」标记的消息；(2) 右侧 SessionPanel 新增「产物」tab。报告类再写 `~/.shy/artifacts/reports/`，产物 tab 提供打开入口。deliver 时目标会话自动展开侧栏并切到产物。  
备选：只留对话底部标记 — 长草稿后仍要滚。  
备选：整页三栏重做（WorkBuddy 式） — 超出本 change。

### D4. 可选 check，缺 check 不拒开工

选定：有 `check` 则退出码 0 才勾该步；无 `check` 不单独完成、收口时装进完整结果。拒绝开工仅当步骤为空且无 `verifyCommand`。  
备选（第一稿）：每项必须有 check 否则拒绝 — 报告类任务无法开工。

### D5. 总验收拦住完整结果

选定：若用户钉了 `verifyCommand`，必须退出码 0 才 emit 完整结果并 `completed`；失败当草稿回灌。未钉则完整结果本身即交付。

### D6. 停滞先暂停再交付

选定：连续 N 段验收零进展 → `paused`；用户点继续后再 `deliver`。不自动交残稿。

### D7. 错误与崩溃不当对话

选定：工具/运行时错误只走 status 与 L2 日志，禁止 `appendMessage` 成 user/assistant 再触发 act。崩溃时磁盘保持 `running` 以便开机续。

### D8. completed 后再发送

选定：Driver 不再续同一张清单；提示目标已完成（要跟进开新会话）。

### D9. 产物挂在现有侧栏，不重做三栏

选定：`SessionPanel` 增加第三个 tab「产物」（与任务/文件并列）。任务 tab 在目标模式下 chip 为「步骤」（即任务进程）。文件 tab 仍是工具读写记录，与产物分开：产物是 Driver 交付物，文件是过程痕迹。

## Risks / Trade-offs

- [报告误判] 模型把非报告当成报告或反过来 → 完整结果消息始终存在；文件只是附加。可后续加用户勾选，本轮不做。
- [无 check 的步骤空转] 报告步骤可能永远不「done」 → 收口条件改为「带 check 的步骤全过，或停滞暂停后用户继续」，无 check 项不阻塞。
- [deliver 本身用 LLM] 汇总仍可能漏步骤产物 → prompt 强制对照 `goal` + 各步 evidence；有 `verifyCommand` 时另有客观闸门。
- [开机误续历史] 旧 checkpoint 被当成 running → 迁移：历史会话一律 `idle`（`paused=1` 除外）。

## Migration Plan

1. 会话表加 `run_status`、`verify_command`、`approved_checks`、`result_content`、`result_report_path`。
2. `paused=1` → `run_status=paused`；其余现有行 → `idle`。不把旧 checkpoint 标成 `running`。
3. 上线后仅新目标会话走 Driver；交互式不变。
4. 回滚：停用 Driver 分流即可回到旧 `runAgent` 循环（旧 verify 代码删除后不可自动回滚行为，需 git revert）。

## Open Questions

无阻塞项。报告落盘文件名用会话 id + 时间戳即可。
