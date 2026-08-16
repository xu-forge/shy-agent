<!--
Raw capture of superpowers:brainstorming output.
不写入 docs/superpowers/specs/。
-->

# Brainstorm: goal-driver-acceptance

> 来源：2026-08-15～16 口头澄清（可执行验收 / GoalDriver / 开机续跑）+ 2026-08-17 对照会话 `9388e328` 修正完成语义。  
> 不写入 `docs/superpowers/specs/`。

## 1. 动机（第一轮）

用户目标：在 shy 里做出能跑两三天的 agent——自我校验结果，并根据失败去改。

现状：目标模式已有段式续跑、checkpoint、token 预算、停滞暂停；验收仍是同一 LLM 勾清单，`check` 只是说明。进程崩溃后需手动点「继续」。

## 2. 动机（第二轮，同花顺会话）

会话 `9388e328`（2026-08-16）：用户只发一句「帮我到同花顺总结周末这两天的新闻，并给出明天推荐的股票/概念/板块」。

实际：

- `plan` 拆出 7 条 checklist，侧栏标成「目标」
- 15:44 已有完整总结草稿；因「海外/商品」未勾，verify→act 继续
- 模型把空档当成「用户说了继续 / 谢谢」
- 崩溃提示被写入对话再开一轮
- 15:49 七条全勾才「目标完成」
- 库里只有 **一条** user 消息；结果散在对话中间

用户纠正：checklist 为最终目标服务；最后要输出所有结果，而不是把结果放中间让用户自己翻。

## 3. 范围

### In

- 领域无关的外循环内核（验收命令由用户/plan 配置）
- 冻结用户原话为唯一最终目标；checklist 只是步骤
- 步骤做完（或停滞暂停后用户继续）再 `deliver` 一份完整结果
- 过程可出草稿；只有带「完整结果」标记的才是交付
- 收口时模型判断若为报告类，再写 `~/.shy/artifacts/reports/` 文件
- 总验收命令（用户钉死，可选）+ 子项 `check`（可选，有则退出码为准）
- 失败输出回灌下一工作段；运行时错误不得当成人话
- 抽出 `GoalDriver`；LangGraph 只打一段工
- 打开应用后自动续 `running` 被中断的目标会话
- 侧栏 checklist chip 改为「步骤」；标题不得用模型 `<think>`
- 右侧 SessionPanel 增加「产物」tab（完整结果 + 报告入口）；deliver 时展开并切过去

### Out

- 独立后台 worker / 关窗口后继续跑
- 改交互式模式
- 允许 agent 修改用户钉死的总验收
- 云端调度、多机
- 把目标模式 UI 改成非聊天的「一次运行」壳（路线 3）

## 4. 决策链

| # | 议题 | 选定 |
|---|------|------|
| D1 | 落点 | 现有 my-agent，不新开仓库 |
| D2 | 领域 | 领域无关外循环，验收命令可配置 |
| D3 | 验收来源 | 用户可钉总验收 + agent 可写子项 check；有 check 则以退出码为准 |
| D4 | 进程守护 | 打开应用后自动恢复被中断的目标（非用户暂停） |
| D5 | 架构 | 独立 GoalDriver；图退化为工作段 |
| D6 | 完成判定 | 失败封闭：模型声称不算 done |
| D7 | 多会话 running | 只自动续最近更新的一条，其余改 paused |
| D8 | 完成后会话 | 不是「锁死/转交互/再发=新目标」那层；问题是 Driver 还在聊。`completed` 后硬停 |
| D9 | 草稿 vs 交付 | C：过程可出草稿；会话最底一条带「完整结果」标记才是交付 |
| D10 | 何时收口 | B：步骤做完（或做不动）再出覆盖各步产物的完整结果 |
| D11 | 完整结果放哪 | A：会话最底部带标记的消息；若模型判定为报告类，再落盘报告文件 |
| D12 | 谁判断报告 | A：收口时由模型判断 |
| D13 | 实现路线 | 2：并进本 change 的 GoalDriver，**改完成语义**（不另开「只加 deliver 节点」） |
| D14 | 无 check 步骤 | 允许开工；不单独勾完成；收口时装进完整结果。拒绝开工仅当步骤为空且无 `verifyCommand` |
| D15 | 停滞 | 先 `paused`，用户点继续再 deliver；不悄悄交残稿 |
| D16 | 产物 UI | A：收进本 change。现有右侧 SessionPanel 增加「产物」tab；deliver 后钉完整结果（及报告入口）。对话里仍保留带标记的完整结果。不做 WorkBuddy 式整页三栏重做 |

## 5. 路线取舍（第二轮）

1. 只加收口节点 — 改动小，但完成仍靠模型勾步骤，会和 GoalDriver 打架  
2. **并进 GoalDriver，改完成语义（选定）** — 一次改对生命周期  
3. 目标模式改成非聊天运行 — UI 重做，超出本次问题  

## 6. 依赖

| 项 | 状态 |
|---|------|
| 段循环 / checkpoint / token 预算 / 停滞设置 | ready（`service.ts` / `graph.ts` / settings） |
| `shell_exec` 与高危确认 | ready |
| 会话表 `goal/checklist/paused/checkpoint` | ready，需扩展列 |
| `~/.shy/artifacts/reports` | ready（路径已有） |
| 关窗口后的 OS 级守护 | 明确不做 |

## 7. 验收可陈述

见 `specs/goal-driver/spec.md`：原目标冻结、步骤非目标、完整结果唯一且在最后并钉在产物 tab、报告落盘、completed 后不再 act、错误不进对话、check 失败回灌、总验收失败不交付、无步骤且无总验收拒绝开工、停滞先暂停、开机续 running。
