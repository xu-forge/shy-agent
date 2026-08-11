# Proposal: rebrand-shy-home

## Why

产品仍以临时名 my-agent 示人，数据落在 Electron 默认 userData，路径不透明、难备份；Agent 运行过程也缺少可审计的本机日志。现在把品牌统一为 **shy**、数据根迁到 **`~/.shy`**，并补上 L2 运行日志与设置内浏览，是用户明确要求「一次做全」的基础工程，晚做迁移成本更高。

## What Changes

**品牌全面改为 shy**
- From: 界面 / 窗口 / 助手自称 / IPC `my-agent:*` / package 与 appId 使用 my-agent
- To: 全部改为 shy（IPC `shy:*`、productName、appId、系统提示词、文档可见名等）
- Reason: 产品定名
- Impact: breaking（IPC 通道名变更，需同版本同步）

**数据根迁至 ~/.shy**
- From: 分散写入 `app.getPath('userData')`（settings、sqlite、skills、reports、screenshots）
- To: 统一 `getShyPaths()` → `~/.shy/{config,db,skills,sessions,logs,artifacts,cache}`；sqlite 为 `db/shy.sqlite`
- Reason: 用户可发现、可备份、跨平台一致
- Impact: 路径行为变更；需自动迁移旧数据

**Agent L2 运行日志 + 设置内浏览**
- From: 运行轨迹主要在 UI 消息与 DB 字段
- To: 每次 LLM turn / tool call 写入 `logs/agent/<run-id>.jsonl`；设置页「运行日志」分区可列表、看详情、打开目录
- Reason: 排障与审计
- Impact: non-breaking 能力新增

## Capabilities

### New Capabilities

- `shy-data-home`: `~/.shy` 布局、路径模块、Electron userData 对齐、旧数据自动迁移
- `shy-product-brand`: 产品名 / IPC / 包与 app 标识 / 助手自称等全面 rebrand 为 shy
- `agent-run-logging`: Agent L2 jsonl 落盘与设置页运行日志浏览

### Modified Capabilities

（`openspec/specs/` 尚无已归档主规格；行为变更以本 change 的新 capability specs 为契约，不另列 delta。）

## Impact

- **main**：新增 `paths` / `migration` / `agent/run-log` 模块；改 settings、memory db、skills、workflows reports、computer screenshots、ipc、index 启动顺序
- **shared / preload**：IPC 前缀与 `AppPaths` 扩展（shyHome 及子路径）
- **renderer**：Sidebar / Header / ChatWorkspace 品牌文案；SettingsPanel 增加运行日志分区
- **构建**：`package.json` name、electron-builder productName / appId
- **文档**：`docs/product-brief.md`、README 产品名与数据路径
- **测试**：路径解析、迁移可重入、L2 日志写入；`SHY_HOME` 测试夹具
