## 1. 路径与迁移基础

- [x] 1.1 新增 `src/main/paths.ts`：`resolveShyHome` / `getShyPaths` / `ensureShyHomeDirs`；支持 `SHY_HOME`
- [x] 1.2 启动最早缓存旧 userData，再 `app.setPath('userData', shyHome)` 并 ensure 目录树
- [x] 1.3 实现 `src/main/migration.ts`：探测旧数据、copy 到新布局、写 `migration.json`；可重入跳过
- [x] 1.4 为 paths + migration 编写单元测试（临时 `SHY_HOME`）

## 2. 存储写入点切换

- [x] 2.1 settings 读写改为 `config/settings.json`
- [x] 2.2 memory/sessions/workflows DB 改为打开 `db/shy.sqlite`
- [x] 2.3 skills 根目录改为 `skills/`
- [x] 2.4 reports / screenshots 改为 `artifacts/...`
- [x] 2.5 扩展 `AppPaths` + IPC `getPaths` 返回 shy 子路径；更新 preload 类型

## 3. 品牌与 IPC

- [x] 3.1 `shared/ipc.ts` 通道前缀全部改为 `shy:`
- [x] 3.2 preload 暴露 `window.shy`；renderer 全量改用 `window.shy`；移除 `myAgent` 别名
- [x] 3.3 UI 文案与窗口标题、助手署名、系统提示词改为 shy
- [x] 3.4 `package.json` name、electron-builder / appId / User-Agent 等改为 shy
- [x] 3.5 全局检索清除权威路径上的 `my-agent` / `myAgent` 残留（测试夹具变量改为 `SHY_HOME`）

## 4. Agent L2 运行日志

- [x] 4.1 实现 `AgentRunLogWriter`（runId、jsonl append、字段截断、失败不抛到主流程）
- [x] 4.2 在 `runAgent` / graph emit 路径接入：run_start/end、llm_turn、tool_call、error
- [x] 4.3 单测：写入临时目录后断言行 kind 与截断行为

## 5. 设置页运行日志浏览

- [x] 5.1 IPC：列出 agent 日志、读取日志内容（支持 offset/limit）、打开日志目录
- [x] 5.2 SettingsPanel 增加「运行日志」分区（列表 + 详情 + 打开目录）
- [x] 5.3 样式与空态（无日志时的说明）

## 6. 文档与验收

- [x] 6.1 更新 `docs/product-brief.md` 与 README：产品名 shy、数据根 `~/.shy`
- [x] 6.2 更新 `openspec/config.yaml` 项目 context 中的产品名
- [x] 6.3 `npm run typecheck && npm test` 通过；手动冒烟：新装路径、迁移、跑一轮出日志、设置内可浏览
