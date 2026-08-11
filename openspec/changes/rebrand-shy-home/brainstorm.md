# Brainstorm: rebrand-shy-home

> 来源：与用户口头澄清（2026-08-11），结论已收敛。  
> 注：本环境无 `superpowers:brainstorming` 技能，按已收敛对话原样落档。

## 1. 动机

产品仍叫 **my-agent**，数据落在 Electron 默认 `userData`（mac 约为 `~/Library/Application Support/my-agent/`）。问题：

1. **品牌名临时感强**，侧栏 / 窗口 / 助手自称 / IPC / 包名不一致地散落 `my-agent`。
2. **数据路径不透明、难备份**：用户期望家目录点文件 `~/.shy`，便于会话、skills、运行日志统一管理与迁移。
3. **Agent 运行过程缺少可审计落盘**：目前主要活在 UI 消息流与 sqlite 字段里，排障困难。

用户要求：**一次做全，不只是 MVP**——品牌、数据根、L2 日志、自动迁移、设置内日志浏览一并做完。

## 2. 范围

### In
- 品牌全面改为 **shy**（UI、助手自称、窗口标题、`package.json` / productName、appId、IPC 前缀 `shy:*`、UA、系统提示词、文档可见名等）。
- 数据根统一为 **`~/.shy`**（Win/Mac：`homedir()/.shy`）。
- 集中路径模块 `getShyPaths()`；业务禁止散落 `app.getPath('userData')`；Electron `userData` 可指到 `~/.shy` 防漏网。
- 目录树：`config/`、`db/`、`skills/`、`sessions/`、`logs/{agent,app}/`、`artifacts/{reports,screenshots}/`、`cache/`。
- SQLite 规范化为 `db/shy.sqlite`（会话/记忆/任务/工作流等仍可一库）。
- **自动迁移**：首次启动若 `~/.shy` 未就绪且旧 userData 有数据 → 迁入并写 `migration.json` 标记；可重入、不二次覆盖。
- Agent 运行日志 **L2**：每次 LLM turn + 每次 tool call 一行 jsonl → `logs/agent/<run-id>.jsonl`。
- **设置页内「运行日志」分区**：列表 + 详情浏览；可打开日志目录。
- 测试环境变量改为 `SHY_HOME`（可短暂兼容旧 `MY_AGENT_TEST_DATA`）。
- 更新 `docs/product-brief.md` / README 中产品名与数据路径说明。

### Out
- GitHub 仓库改名 / 本地文件夹从 `my-agent` 改名（需用户在远端/本机另行操作）。
- 多 profile、云同步、日志远程上报。
- 拆成多套 sqlite（本期保持一库，仅路径与文件名规范化）。

## 3. 主要决策（已决）

| # | 决策 | 选定方案 |
|---|------|----------|
| D1 | 品牌改名范围 | **都改**（用户可见 + 技术标识：IPC/appId/包名等） |
| D2 | 数据根 | `~/.shy`，跨平台 `path.join(homedir(), '.shy')` |
| D3 | 路径策略 | 显式 `getShyPaths()` 为主；可兼用 `app.setPath('userData', shyHome)` |
| D4 | SQLite | 一库：`~/.shy/db/shy.sqlite` |
| D5 | Agent 日志粒度 | **L2**（llm turn + tool call） |
| D6 | 日志 UI | **设置页内分区**（非独立导航） |
| D7 | 旧数据 | **自动迁移** + migration 标记 |
| D8 | 完成度 | **一次做全**，不做 MVP 裁剪 |

## 4. 跨系统依赖

| 依赖 | 状态 | 备注 |
|------|------|------|
| `app.getPath('userData')` 调用点 | ready | settings / memory db / skills / reports / screenshots / ipc getPaths |
| `src/shared/ipc.ts` 通道前缀 | ready | 全量 `my-agent:` → `shy:`（破坏性，需同步 preload） |
| `package.json` / electron-builder | ready / mockable | productName、appId |
| Agent graph/service emit | ready | 埋 L2 日志写入 |
| SettingsPanel | ready | 增加运行日志分区 |
| 旧 userData 路径 | ready | 迁移源；mac Library / win AppData |

## 5. 验收标准

1. 全新安装：写入只发生在 `~/.shy/...`；用户可见界面无 `my-agent` 品牌残留。
2. 有旧数据：启动后会话 / skills / 设置可用；迁移标记存在；旧根不再作为写入根。
3. 跑一轮交互或目标模式：`logs/agent/*.jsonl` 含 LLM turn 与 tool call 行。
4. 设置页可浏览运行日志列表与单条详情，并可打开日志目录。
5. IPC 通道为 `shy:*`；`package.json` name / app 标识为 shy。
6. `npm run typecheck && npm test` 通过（或等价项目测试命令）。

## 6. 风险与权衡

- [Risk] IPC 前缀变更导致旧 preload 与主进程不匹配 → Mitigation: 同版本同步改 shared/preload/main，无跨版本兼容承诺（个人客户端）。
- [Risk] 迁移误覆盖新数据 → Mitigation: 仅当目标不存在或空且无 migration 成功标记时迁入；冲突写旁路备份。
- [Risk] L2 日志体积增长 → Mitigation: 按 run 分文件；后续可加保留策略（本期至少可浏览/打开目录）。
- [Trade-off] 仓库目录仍可叫 my-agent → 接受；产品名与数据根先统一为 shy。

## 7. 对话收敛

最近轮次均为确认分叉（都改 / L2 / 自动迁移 / 设置内日志浏览 / 一次做全），无新分叉。用户确认「开始吧」进入 propose。
