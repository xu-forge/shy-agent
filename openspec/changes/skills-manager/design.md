## Context

bootstrap 壳已有「技能」导航占位。本 change 实现真实本地技能包存储与 UI。

## Goals / Non-Goals

**Goals:** userData/skills 下 SKILL.md CRUD；frontmatter 解析 name/description；UI 与 Agent 同源 API；删除经 UI confirm 或 Agent 高危确认。  
**Non-Goals:** 技能市场、运行时自动注入 prompt、版本控制。

## Decisions

### D1：目录即包
- **选择**：`<id>/SKILL.md` + 可选 `scripts/`
- **理由**：与 Cursor skill 布局一致

### D2：frontmatter 解析
- **选择**：YAML 块或首行 `# title` 回退
- **理由**：兼容无 frontmatter 草稿

### D3：Agent skill_write 可选 scripts map
- **选择**：一次性写入多个脚本文件
- **理由**：Agent 可打包小工具

## Risks / Trade-offs

- [Risk] 恶意脚本 → Mitigation: 仅本地路径；执行留给后续 runner
- [Trade-off] 未自动加载到 system prompt → 接受；后续 change

## Migration Plan

N/A

## Open Questions

无。
