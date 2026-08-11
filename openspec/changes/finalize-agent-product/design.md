# Design: finalize-agent-product

## Runtime

- `src/main/agent/graph.ts`：StateGraph，节点 plan / act / tools / verify
- goal 模式：START → plan（若无清单）→ act ↔ tools → verify →（未完成则）act
- interactive：START → act ↔ tools → END
- `beforeStep` 钩子实现暂停门闩

## Persistence

- sessions / session_messages 表（SQLite，与 memory 同库）
- short_memory、checklist、goal、paused、checkpoint 挂在 session 行

## Memory

- long_memory.revision 自增；memory_audit 记录 create/update/delete
- `compressWithLlm` 在 run 结束后写回 session.short_memory

## Skills

- `matchSkills` 按 token 打分，取 Top-N 注入 act 的 system preamble
