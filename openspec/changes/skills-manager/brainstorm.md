# Brainstorm — skills-manager

背景：Agent 需可加载用户自定义技能包，格式对齐 Cursor SKILL.md（frontmatter + 正文，可选 scripts/）。

决议链：
- Q1 存放位置？→ `userData/skills/<id>/SKILL.md`
- Q2 id 规则？→ 目录名；新建时从 frontmatter name  slug 或显式 id
- Q3 UI？→ SkillsView 列表 + 编辑器 + 模板
- Q4 Agent？→ skill_write/list/delete（delete 需确认）
- Q5 远程市场？→ 不做，纯本地 CRUD
