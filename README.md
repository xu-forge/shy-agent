# shy

个人 Electron Agent 客户端（Windows + macOS）：LangGraph 编排、OpenAI-compatible 模型、分层记忆、Skills、本机工具、交互式/目标双模式。

## 数据目录

本机数据统一落在 **`~/.shy`**（可用环境变量 `SHY_HOME` 覆盖）：

```
~/.shy/
  config/settings.json
  db/shy.sqlite
  skills/
  logs/agent/          # L2 运行日志（jsonl）
  artifacts/reports/
  artifacts/screenshots/
```

首次启动若检测到旧 Electron `userData`（原 my-agent）中的数据，会自动迁移到 `~/.shy`。

## 前置

- Node.js 20+
- npm
- （可选）`npx playwright install chromium` — 启用 `browser_fetch`

## 安装与启动

```bash
npm install
npx electron-builder install-app-deps   # better-sqlite3 原生模块
npm run dev
```

打开后：**设置** → 填写 OpenAI-compatible 的 `baseURL` / `apiKey` / `model`（如 Minimax）。运行日志可在设置页「运行日志」分区浏览。

## 功能概览

| 模块 | 说明 |
|------|------|
| 聊天 | 交互式 / 目标模式；目标模式自动续跑；可取消 |
| 记忆 | 长期记忆 SQLite，用户可查看/编辑/删除；Agent 可写并通知 |
| 短期记忆 | 会话上下文保关键压缩 |
| 技能 | 本地 `~/.shy/skills/*/SKILL.md`，CRUD；Agent 可创建 |
| 本机工具 | shell / 读写删文件 / 浏览器打开与抓取 / 截屏 / 点击 |
| 高危确认 | 删除、敏感覆盖写、安装类命令、GUI 点击等需确认 |
| 运行日志 | L2 jsonl，设置页可浏览 |

## 脚本

```bash
npm run lint
npm test
npm run typecheck
npm run build
npm run build:win
npm run build:mac   # 需在 macOS 上执行
```
