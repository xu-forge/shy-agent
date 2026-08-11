# shy 产品简报

> 状态：**部分已确认**（可进入 OpenSpec change；仍有 TBDs）  
> 更新日期：2026-08-11  
> 产品名：**shy**；数据根：`~/.shy`（`SHY_HOME` 可覆盖）  
> 流程：OpenSpec + **superpowers-bridge**（社区 schema）  

---

## 1. 一句话目标

做一个名为 **shy** 的个人 Electron Agent 客户端（**Windows + macOS**）：LangGraph 编排；OpenAI-compatible 模型（如 Minimax）；分层记忆；可操作电脑的长工作流；支持**交互式模式**与**目标模式**；Skills（`SKILL.md` + 脚本）可加载/CRUD，并允许 Agent 自创建。本机数据统一存放在 `~/.shy`。

---

## 2. MVP 范围（已确认 = 上述基础能力全部纳入首版）

| 能力 | 状态 | 要点 |
|------|------|------|
| 分层记忆 | 已确认 | 见 §3.4；长期可 UI 管理；短期 = 保关键压缩 |
| 本机操作 | 已确认 | 终端、文件、浏览器自动化、键鼠 GUI、剪贴板、截屏等 **都要** |
| 权限 | 已确认 | 默认**全自动**；删除等**高危操作需确认** |
| 双模式 | 已确认 | **标准交互式模式** + **目标模式**（结果导向） |
| Skills | 已确认 | `SKILL.md` + 自带脚本；用户与 Agent 均可创建/编辑/删除/加载 |
| UI / 栈 | 已确认 | Electron + React + Vite；编排 **LangGraph**；平台 **Win + Mac** |
| 模型 | 已确认 | **OpenAI-compatible** 接口（用户侧有 Minimax） |

---

## 3. 已确认决策

### 3.1 运行时与栈

- **B1** 模型接入：**OpenAI-compatible** API（配置 base URL / key / model；兼容 Minimax 等）
- **B2** Agent 编排：**LangGraph**
- **G2** 前端：**Electron + React + Vite**
- **D2** 平台：**Windows + macOS**（跨平台能力需从脚手架起考虑路径、权限、自动化差异）
- **A3** MVP：当前列出的基础能力即为 MVP（不做「只先做一条路径」的裁剪）

### 3.2 电脑操作与模式

- **D1** 操作范围：终端 / 文件 / 浏览器 / GUI（键鼠）等均纳入 MVP
- **D3** 权限：全自动执行；**高危操作（至少含删除类）必须向用户确认**后再执行
- **D4** 双模式：
  - **交互式模式**：标准对话协作
  - **目标模式**：结果导向，围绕目标推进至可验收完成（对照 Codex 一类体验）

### 3.3 Skills

- **E1** 格式：对齐 `SKILL.md` 包结构
- **E3 / E4** 包内可带脚本；允许 Agent 自行创建并落盘；技能 = 说明 + 可执行脚本/工具绑定

### 3.4 记忆模型（已细化）

三层职责：

| 层级 | 定义 | 读写方 | 备注 |
|------|------|--------|------|
| **长期记忆** | 偏好、可复用工作流、规范等稳定知识 | **用户**：查看 / 编辑 / 删除；**Agent**：可自行更新维护（增改删需可审计） | 非静默黑盒；UI 必须可管理 |
| **短期记忆** | **上下文压缩**的产物（滚动摘要 / 结构化压缩态） | 系统在上下文膨胀时生成与更新 | **尽量不丢关键数据**（见下方原则） |
| **当前上下文** | 本轮热窗口：近期消息、工具结果、任务状态等 | 运行时维护 | 超出窗口时经压缩流入短期记忆 |

**长期记忆原则：**

- 用户可在客户端浏览完整列表/详情，并直接编辑、删除
- Agent 可主动维护（合并重复、更新过时偏好、补充规范等），变更应可追溯（时间、来源：user / agent）
- **Agent 维护策略：默认可写，但必须告知用户**（UI/对话中可见变更通知；用户可事后编辑或删除）
- 写入仍属「可管理」：不是无感偷偷记聊天流水，而是结构化条目

**短期记忆 / 压缩原则（C2）：**

- 短期记忆 = 上下文压缩，不是另起一套「最近 24h 日记」
- 压缩目标：降低 token，同时**优先保留关键数据**，例如：
  - 用户明确约束与偏好（若尚未升为长期记忆）
  - 未完成任务状态、目标、验收标准
  - 文件路径、命令、错误信息、决策结论、工具产物引用
  - 对后续步骤有因果作用的中间结果
- 可丢弃/大幅折叠：寒暄、重复试错过程中的冗余输出、已被更新结论替代的旧草稿
- 实现细节（分层摘要、结构化 slot、引用原消息 id 等）留给 `memory-foundation` change 的 design/specs

### 3.5 工程流程

- **F1 / F2** 已在仓库初始化 OpenSpec，并安装社区 schema **`superpowers-bridge`**
- 默认 `openspec/config.yaml`：`schema: superpowers-bridge`

---

## 4. 存储方案建议（C4）— 推荐采用

**结论：SQLite（记忆） + 文件系统（Skills / 可读文档）混合；向量库延后。**

与「长期记忆可 UI 编辑/删除 + Agent 维护」高度匹配：SQLite 便于列表、审计字段、软删除与检索；Skills 仍用文件目录。

| 数据 | 推荐存储 | 原因 |
|------|----------|------|
| 长期记忆条目 | **SQLite**（可加 FTS5） | 用户 CRUD UI、Agent 维护、来源/时间戳、软删除 |
| 短期记忆（压缩态） | **SQLite 会话相关表** 或会话旁路字段 | 可恢复会话、可调试压缩质量 |
| Skills 包（`SKILL.md` + 脚本） | **本地目录文件** | 与生态格式一致；Agent/用户直接编辑 |
| 当前上下文 | **会话内存**（必要时快照） | 热路径 |
| 语义检索 | **暂缓独立向量库** | 先结构化 + FTS；量上来再加 |

**C4 已确认：混合（SQLite + 文件）；向量库延后。**

---

## 5. 过夜执行已确认默认（2026-08-10「全部按建议」）

### A. 定位

- [x] **A1** 单用户单 profile
- [x] **A2** UI/交互对标 **Codex**

### B. 模型 / 编排

- [x] **B1** OpenAI-compatible；设置页配置 `baseURL` / `apiKey` / `model`（不写死 Minimax）
- [x] **B3** 不做多 Agent 协作；LangGraph 单图 + 工具节点即可
- [x] LangGraph 运行在 **Electron main（Node）**

### C. 记忆细节

- [x] **C2** 短期记忆 = 保关键上下文压缩
- [x] **C3** 当前上下文可含工作区/终端等环境摘要（随工具结果注入，不做重型常驻快照服务）
- [x] **C5** 记忆**仅本地**，不上传云端
- [x] **C4** SQLite + 文件混合；向量库延后
- [x] Agent 维护长期记忆：默认可写，**必须通知用户**

### D. 工作流细节

- [x] **D2** Windows + macOS
- [x] **D5** MVP：运行时计划 + 目标模式自动续跑；可保存工作流定义 / 暂停恢复可后置
- [x] **高危确认**：删除；覆盖写重要路径；执行未知脚本；安装软件；外发敏感网络
- [x] 浏览器自动化：**Playwright**
- [x] GUI：Win 系统 API/PowerShell 优先；Mac Accessibility；差异写 README

### E. Skills 来源

- [x] **E2** 仅本地目录；暂无市场/Git 远程安装

### F. 规格习惯

- [x] **F3** 规格与任务以简体中文为主

### G. UI

- [x] **G1** 聊天主界面 + 侧栏（记忆/技能/轨迹）足够；无独立任务视图（MVP）
- [x] **G3** MVP 不做托盘/全局快捷键

### 执行授权

- [x] 允许按默认连续 propose → apply 多个 change；遇阻塞再停

### Change 顺序

1. `bootstrap-electron-shell`（收尾）
2. `agent-runtime-langgraph`
3. `memory-foundation`
4. `skills-manager`
5. `computer-use-tools`
6. `shell-integration`（接通主界面）

---

## 6. 开发流程（已落地）

```text
口头澄清 / brainstorm
    → 收敛后 /opsx:propose|new --schema superpowers-bridge
    → brainstorm → proposal → design → specs → tasks → plan
    → /opsx:apply（worktree + subagent TDD）
    → verify → retrospective → archive
```

约定：

- 功能/架构变更走 opsx change；小修直接改代码
- **不要**把 brainstorm/plan 写到 `docs/superpowers/`（应落入 `openspec/changes/<name>/`）
- 路由说明见根目录 `AGENTS.md`

工具状态：

- [x] `openspec init --tools cursor`
- [x] 安装并校验 `openspec/schemas/superpowers-bridge`
- [x] `openspec/config.yaml` 默认 schema
- [x] 本机 Superpowers 已安装（`~/.cursor/plugins/local/superpowers`）

---

## 7. 明确不做（直到首个 change 批准）

- 不搭建 Electron 业务脚手架以外的实现（等 `/opsx:propose`）
- 不实现记忆 / 工具 / Skills 业务代码
- 不接入具体模型 API

---

## 8. 建议的首个 OpenSpec change（待你点头）

推荐顺序：

1. **`bootstrap-electron-shell`** — Electron + React + Vite 空壳（Win/Mac）、目录约定、基础配置  
2. **`agent-runtime-langgraph`** — LangGraph + OpenAI-compatible 客户端、双模式入口、工具接口骨架  
3. **`memory-foundation`** — SQLite 长期记忆（用户 CRUD + Agent 维护审计）+ 保关键上下文压缩  
4. **`skills-manager`** — SKILL.md 加载与 CRUD  
5. **`computer-use-tools`** — 本机工具（Win/Mac）+ 高危确认闸门  

也可按你的偏好合并/调整顺序。

---

## 9. 决策记录

| 日期 | 议题 | 结论 |
|------|------|------|
| 2026-08-10 | 启动方式 | 先澄清需求并落档，暂不开发功能 |
| 2026-08-10 | B2 | LangGraph |
| 2026-08-10 | D1/D3 | 全能力；全自动 + 高危确认 |
| 2026-08-10 | D4 | 交互式 + 目标模式 |
| 2026-08-10 | E1/E3 | SKILL.md+脚本；允许 Agent 创建 |
| 2026-08-10 | C1 | 显式/可管理长期记忆 |
| 2026-08-10 | C4 | SQLite + 文件系统混合；向量库延后 |
| 2026-08-10 | Agent 维护长期记忆 | 默认可写，必须告知用户；用户可事后改/删 |
| 2026-08-10 | Superpowers | 已安装于 Cursor local plugins |
| 2026-08-10 | 壳 UI | 参考 Codex；就绪页+侧栏；ESLint+Prettier；electron-vite |
| 2026-08-10 | F1/F2 | 社区 schema `superpowers-bridge` |
| 2026-08-10 | A3/G2 | 现有能力即 MVP；React+Vite |
| 2026-08-10 | B1 | OpenAI-compatible（Minimax 等） |
| 2026-08-10 | D2 | Windows + macOS |
| 2026-08-10 | 长期记忆 UX | 用户可查看/编辑/删除；Agent 可更新维护（需审计） |
| 2026-08-10 | C2 短期记忆 | = 上下文压缩；保关键、少丢关键数据 |
