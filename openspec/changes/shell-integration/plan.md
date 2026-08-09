# shell-integration Implementation Plan

**Goal:** 接通聊天、设置、高危确认与记忆/技能 pane。

**Architecture:** App 编排；ChatWorkspace + SettingsPanel + ConfirmDialog；preload 桥接 IPC events。

**Tech Stack:** React, Electron preload contextBridge

---

按 `tasks.md` 实现；依赖各 main 侧 change 已注册 IPC。
