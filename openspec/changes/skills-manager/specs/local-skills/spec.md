## ADDED Requirements

### Requirement: 本地技能包存储
系统 MUST 在 `userData/skills/<id>/` 存储技能包，每包 MUST 含 `SKILL.md`；MAY 含 `scripts/` 下脚本文件。

#### Scenario: 创建技能
- **WHEN** 用户或 Agent 写入 markdown（及可选 scripts）
- **THEN** 系统 MUST 创建或更新目录与文件，并返回 id、name、description、path

#### Scenario: 列出技能
- **WHEN** 调用 skillsList 或 skill_list
- **THEN** 系统 MUST 扫描子目录、解析 SKILL.md frontmatter，按 name 排序返回摘要

### Requirement: 技能 UI 管理
系统 MUST 提供 SkillsView，支持列表、打开编辑、新建模板、保存、删除（简体中文）。

#### Scenario: 编辑已有技能
- **WHEN** 用户选择某技能并保存
- **THEN** 系统 MUST 调用 writeSkill 覆盖 SKILL.md 并刷新列表

### Requirement: Agent 技能工具
Agent MUST 可通过 `skill_write`、`skill_list`、`skill_delete` 管理本地技能；`skill_delete` MUST 经高危确认。

#### Scenario: Agent 删除技能
- **WHEN** Agent 调用 skill_delete 且用户拒绝确认
- **THEN** 系统 MUST 不删除目录并返回错误
