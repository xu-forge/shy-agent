# Design: rebrand-shy-home

## Context

当前所有持久化依赖 Electron `app.getPath('userData')`（settings.json、memory.sqlite、skills/、reports/、screenshots/）。品牌字符串与 IPC 通道以 `my-agent` 为主。Agent 运行没有独立 jsonl 审计日志。用户已收敛：产品名 **shy**、数据根 **`~/.shy`**、日志 **L2**、**自动迁移**、日志浏览放在**设置页**，且要求一次做全。

## Goals / Non-Goals

**Goals:**
- 运行时唯一权威数据根为 `~/.shy`（可通过 `SHY_HOME` 覆盖，供测试）
- 业务代码只通过 `getShyPaths()` 取路径
- 旧 userData 自动、可重入地迁入新树
- 品牌与 IPC 全面 shy
- 每次 agent run 产生 L2 jsonl；设置页可浏览

**Non-Goals:**
- 改 git 远程仓库名 / 本地工程目录名
- 多 profile、云同步
- 拆多套 sqlite
- 日志远程上报或复杂保留策略 UI（可后续）

## Decisions

### D1：路径解析与 Electron userData
- **选择**：`resolveShyHome()` = `process.env.SHY_HOME || path.join(os.homedir(), '.shy')`；导出 `getShyPaths()`；启动最早调用 `app.setPath('userData', shyHome)` 作为兜底。
- **理由**：显式子路径清晰；setPath 防止漏网第三方/旧代码。
- **已考虑 alternative**：仅 setPath、业务继续 getPath('userData') → 子目录语义模糊，拒绝。

### D2：目录布局
- **选择**：
  ```
  ~/.shy/
    config/settings.json
    db/shy.sqlite
    skills/
    sessions/<session-id>/
    logs/agent/<run-id>.jsonl
    logs/app/
    artifacts/reports/
    artifacts/screenshots/
    cache/
    migration.json
  ```
- **理由**：配置 / 库 / 技能 / 日志 / 产物分离，便于备份与排障。
- **已考虑 alternative**：扁平全扔根目录 → 难演进，拒绝。

### D3：SQLite 文件名
- **选择**：迁移时将旧 `memory.sqlite` 复制/移动为 `db/shy.sqlite`；代码只打开新路径。
- **理由**：品牌一致；一库够用。
- **已考虑 alternative**：保留文件名 memory.sqlite → 与产品名脱节，拒绝。

### D4：迁移策略
- **选择**：启动时 `ensureShyHome()`：创建目录树 → 若无成功 migration 标记且检测到旧 Electron userData 有关键文件 → 复制（优先 copy，成功后写 `migration.json`）→ 冲突则写入 `artifacts/migration-backup-<ts>/`。可重入：已有 `migration.json.status=success` 则跳过。
- **理由**：个人客户端安全优先，不破坏源；失败可重试。
- **已考虑 alternative**：直接 rename 移动 → 失败难回滚，拒绝作为默认。

### D5：旧 userData 探测
- **选择**：在 `app.setPath` **之前**读取 Electron 默认 userData（或通过 `app.getPath('userData')` 在 setPath 前缓存）；同时兼容已存在的 `~/Library/Application Support/my-agent` / 对应 Windows 路径。
- **理由**：setPath 后默认路径会变，必须先缓存。
- **已考虑 alternative**：写死平台路径字符串 → 脆弱，仅作 fallback。

### D6：IPC 与品牌
- **选择**：所有 `IPC.*` 通道改为 `shy:` 前缀；`window.myAgent` API 对象可重命名为 `window.shy`（或保留 myAgent 别名一版）。**选定：preload 暴露 `window.shy`，并暂时 `window.myAgent = window.shy` 兼容同版本热重载期，任务结束前移除别名。**
- **理由**：产品 API 面与品牌一致；短别名降低遗漏风险。
- **已考虑 alternative**：只改文案不改 IPC → 半吊子，用户要求都改，拒绝。

### D7：L2 日志模型
- **选择**：`AgentRunLogWriter`：run 开始分配 `runId`；对 graph emit 的 `assistant`/`status`/`tool`/`error`/`done` 等映射为 jsonl 行（至少含 `ts, runId, sessionId, kind, payload`）；`kind` 含 `llm_turn`（assistant 内容或模型调用摘要）、`tool_call`（name + detail 截断）、`status`、`error`、`run_start`/`run_end`。
- **理由**：L2 = turn + tool；截断防爆文件。
- **已考虑 alternative**：L3 全量 prompt → 隐私与体积，拒绝本期默认。

### D8：设置内日志 UI
- **选择**：`SettingsPanel` 新增「运行日志」section：列出 `logs/agent` 下文件（mtime 倒序）、点选加载尾部/全文（大文件限前 N KB + 「加载更多」）、展示解析后的行；按钮「打开日志目录」走已有 reveal/openPath 类 IPC。
- **理由**：用户指定放设置弹窗/页，不占主导航。
- **已考虑 alternative**：独立导航「日志」→ 用户已否决。

### D9：AppPaths 扩展
- **选择**：`AppPaths` 增加 `shyHome`、`configDir`、`dbPath`、`skillsDir`、`logsAgentDir`、`artifactsDir` 等，供设置页展示与打开。
- **理由**：renderer 不拼路径。

## Risks / Trade-offs

- [Risk] setPath 时机过晚，db 已打开旧路径 → Mitigation: 在任何 getDb/settings 之前、`app.whenReady` 后立刻 ensure + setPath。
- [Risk] IPC 重命名漏改 renderer → Mitigation: typecheck + 全局搜 `my-agent:` / `myAgent`。
- [Risk] 日志写入拖慢主路径 → Mitigation: 异步 appendFile 队列，失败只打 app log 不阻断 agent。
- [Trade-off] copy 迁移占双倍磁盘 → 接受；个人数据量通常可承受。
- [Trade-off] `window.shy` 迁移期双名 → 任务清单要求最终去掉 `myAgent` 别名。

## Migration Plan

1. 实现 paths + ensure 目录 + migration（单测用 `SHY_HOME`）。
2. 切换所有存储写入点；sqlite 打开新路径。
3. Rebrand IPC/UI/package；更新 preload。
4. 接入 L2 writer + 设置 UI。
5. 文档更新。
6. Rollback：删除 `~/.shy` 且恢复旧包可继续用旧 userData（迁移为 copy 时旧数据仍在）；不提供自动反向迁移。

## Open Questions

- （无阻塞）日志单行 detail 默认截断长度建议 8–32 KiB，实现时取 16 KiB 常量即可。
