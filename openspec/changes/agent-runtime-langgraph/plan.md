# agent-runtime-langgraph Implementation Plan

> **For agentic workers:** implement task-by-task; overnight inline execution authorized.

**Goal:** LangGraph + OpenAI-compatible 双模式运行时并接通 UI。

**Architecture:** main AgentService + settings store + tool registry; preload bridge; renderer chat wiring.

**Tech Stack:** @langchain/langgraph, @langchain/openai, @langchain/core

## Global Constraints

- OpenAI-compatible via settings
- LangGraph in Electron main
- Modes: interactive | goal
- Chinese UI

---

### Task 1–3

按 `tasks.md` 实现并提交。
