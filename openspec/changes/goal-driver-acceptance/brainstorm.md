# Brainstorm: goal-driver-acceptance

> 来源：与用户口头澄清（2026-08-15～16）。对话按 superpowers:brainstorming 收敛后落档。  
> 不写入 `docs/superpowers/specs/`。

## 1. 动机

用户目标：在 **my-agent（shy）** 里做出能跑两三天的 agent——自我校验结果，并根据失败去改。

现状：目标模式已有段式续跑、checkpoint、token 预算、停滞暂停；验收仍是同一 LLM 勾清单，`check` 只是说明。进程崩溃后需手动点「继续」。

## 2. 范围

### In
- 领域无关的外循环内核（验收命令由用户/plan 配置）
- 总验收命令（用户钉死）+ 子项 `check` 命令，运行时执行，退出码为准
- 失败输出回灌下一工作段
- 抽出 `GoalDriver`；LangGraph 只打一段工
- 打开应用后自动续 `running` 被中断的目标会话

### Out
- 独立后台 worker / 关窗口后继续跑
- 改交互式模式
- 允许 agent 修改用户钉死的总验收
- 云端调度、多机

## 3. 主要决策（已决）

| # | 议题 | 选定 |
|---|------|------|
| D1 | 落点 | 现有 my-agent，不新开仓库 |
| D2 | 领域 | D：领域无关外循环，验收命令可配置 |
| D3 | 验收来源 | C：用户可钉总验收 + agent 写子项 check；都以退出码为准 |
| D4 | 进程守护 | B：打开应用后自动恢复被中断的目标（非用户暂停） |
| D5 | 架构 | 3：独立 GoalDriver；图退化为工作段 |
| D6 | 完成判定 | 失败封闭：模型声称不算 done |
| D7 | 多会话 running | 只自动续最近更新的一条，其余改 paused |

## 4. 依赖

| 项 | 状态 |
|---|------|
| 段循环 / checkpoint / token 预算 / 停滞设置 | ready（`service.ts` / `graph.ts` / settings） |
| `shell_exec` 与高危确认 | ready |
| 会话表 `goal/checklist/paused/checkpoint` | ready，需扩展列 |
| 关窗口后的 OS 级守护 | 明确不做 |

## 5. 验收可陈述

见 `specs/goal-driver/spec.md` 场景：check 失败不勾 done、总验收失败不结束、无检查拒绝开工、启动续 running、不续 paused、多 running 只续一条。
