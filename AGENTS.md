# shy

个人 Electron Agent 客户端（产品名 shy，数据根 `~/.shy`）。产品决策见 [`docs/product-brief.md`](docs/product-brief.md)。

技术栈（已确认）：Electron + React + Vite；Agent 编排 LangGraph。

## Workflow routing（OpenSpec + Superpowers）

本仓库使用社区 schema [`superpowers-bridge`](https://github.com/JiangWay/openspec-schemas/tree/main/superpowers-bridge) 桥接 OpenSpec 与 Superpowers。默认见 `openspec/config.yaml`。

### 入口路由

| 你观察到的触发 | 怎么做 |
|---|---|
| 用户开始「设计讨论 / brainstorm」 | 口头 `superpowers:brainstorming`，**不要**写入 `docs/superpowers/specs/`。对话按下方 5 条收敛后，再提议 `/opsx:propose` |
| 用户直接 `/opsx:new` / `/opsx:ff` / `/opsx:propose` | 走 schema 流程；各 artifact 指令会注入 |
| 用户明确是 bugfix / 错字 / 配置微调 / 文档 | 直接改代码 — **不要**开 change |
| 用户已在某个 change 中 | 用 `/opsx:continue`、`/opsx:apply`、`/opsx:verify`、`/opsx:archive` 推进 |

### 何时不用 opsx（直接改）

| 场景 | 直接改？ |
|---|---|
| 新功能 / 新能力 / 架构变更 / 破坏性变更 | ❌ 走 opsx |
| Bug 修复（无契约变化）/ 补测试 / lint / 非破坏依赖升级 / 错字 / 文档 / 配置值微调 | ✅ 直接改 |

原则：**流程仪式与风险成正比**。

### 口头 brainstorm → 提升为 opsx 的 5 条

全部满足才提议 promote（缺一则继续澄清；**永不**写到 `docs/superpowers/specs/`）：

1. **范围锁定** — 一句话说明 in/out  
2. **主要设计分叉已决** — 备选已权衡；剩余 TBD 有负责方与影响范围  
3. **跨系统依赖已归类** — ready / mockable / unknown  
4. **验收标准可陈述** — 具体通过条件  
5. **对话在收敛** — 近几轮是确认，不是新分叉  

满足后主动问：「是否 `/opsx:propose`？」——等用户确认，禁止自动开 change。

### 反模式

- brainstorm 写到 `docs/superpowers/specs/`
- writing-plans 写到 `docs/superpowers/plans/`
- 带着未决阻塞性 TBD 就 promote
- 为 bug/错字开 change

详情：[superpowers-bridge README](https://github.com/JiangWay/openspec-schemas/blob/main/superpowers-bridge/README.md#entry--exit-gates)。

### 本项目补充

- 规格与任务以**简体中文**为主  
- 功能实现前先有 OpenSpec artifacts；apply 阶段再写代码  
- 高危本机操作（删除等）必须有用户确认闸门（见 product-brief）
