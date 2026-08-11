## ADDED Requirements

### Requirement: Shy Home Path Resolution
系统 MUST 将产品数据根解析为 `SHY_HOME` 环境变量（若设置）或 `path.join(os.homedir(), '.shy')`，并 MUST 通过单一路径模块（如 `getShyPaths()`）向业务暴露子路径，业务代码 MUST NOT 再以 Electron 默认 userData 作为权威写入根。

#### Scenario: Default home on user machine
- **WHEN** 未设置 `SHY_HOME` 且应用启动
- **THEN** 数据根 MUST 为用户家目录下的 `.shy`

#### Scenario: Test override
- **WHEN** 设置了 `SHY_HOME` 指向临时目录
- **THEN** 所有通过路径模块解析的读写 MUST 落在该目录下

---

### Requirement: Shy Home Directory Layout
系统 MUST 在数据根下确保存在并使用以下布局：`config/`（含 settings）、`db/shy.sqlite`、`skills/`、`sessions/`、`logs/agent/`、`logs/app/`、`artifacts/reports/`、`artifacts/screenshots/`、`cache/`。

#### Scenario: First launch creates tree
- **WHEN** 数据根不存在或缺少子目录时应用启动
- **THEN** 系统 MUST 创建上述目录（及空库/配置所需父路径），且后续 settings、sqlite、skills、产物写入 MUST 使用对应子路径

---

### Requirement: Automatic Legacy Migration
系统 MUST 在首次成功初始化 shy home 时，检测迁移前缓存的旧 Electron userData（或等价 my-agent 数据目录）；若存在关键数据且尚未有成功迁移标记，MUST 将 settings、sqlite、skills、reports、screenshots 等迁入新布局，并 MUST 写入 `migration.json` 标记成功；已成功迁移时 MUST 跳过，避免覆盖较新的 shy home 数据。

#### Scenario: Fresh install no legacy
- **WHEN** 无旧 userData 关键数据
- **THEN** 系统 MUST 正常使用空的 shy home，且 MUST NOT 因迁移失败而阻止启动

#### Scenario: Legacy data migrated once
- **WHEN** 旧目录含 `memory.sqlite` 或 `settings.json` 或 `skills/`，且无成功 `migration.json`
- **THEN** 系统 MUST 将库迁移为 `db/shy.sqlite`、设置迁入 `config/settings.json`、skills 与产物迁入对应目录，并 MUST 标记迁移成功

#### Scenario: Re-entrant skip
- **WHEN** `migration.json` 已标记成功
- **THEN** 再次启动 MUST NOT 用旧目录覆盖现有 shy home 内容
