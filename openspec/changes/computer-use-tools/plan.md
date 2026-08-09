# computer-use-tools Implementation Plan

**Goal:** 本机 shell/文件/浏览器/GUI 工具集，高危经 confirmHighRisk。

**Architecture:** registry + builtin.ts + computer.ts；AgentService 注入 ToolContext。

**Tech Stack:** child_process, fs, electron shell/desktopCapturer, optional playwright

---

按 `tasks.md` 实现；确认 UI 由 shell-integration 提供。
