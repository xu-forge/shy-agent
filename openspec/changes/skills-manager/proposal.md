## Why

用户与 Agent 需在本机创建、编辑、删除 SKILL.md 技能包以扩展 Agent 能力。产品要求包结构含说明与可选脚本，全部存 userData，无远程仓库。

## What Changes

- `userData/skills/<id>/` 目录约定，含 SKILL.md 与可选 scripts/
- skillsList/Read/Write/Delete IPC + preload
- SkillsView：列表、编辑、新建模板、删除
- Agent 工具 skill_write/list/delete

## Capabilities

### New Capabilities

- `local-skills`: 本地 SKILL.md 包 CRUD 与 Agent 写入

### Modified Capabilities

（无）

## Impact

- main/skills/store.ts、SkillsView、builtin 技能工具
- 可选 scripts 子目录写入
