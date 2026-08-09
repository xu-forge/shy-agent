# bootstrap-electron-shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> OpenSpec redirect: this plan lives at `openspec/changes/bootstrap-electron-shell/plan.md` (NOT `docs/superpowers/plans/`).
>
> Specs: `specs/app-shell/spec.md`, `specs/renderer-shell-ui/spec.md`  
> Design: `design.md` · Tasks: `tasks.md` · Brainstorm: `brainstorm.md`

**Goal:** 落地可在 Win/Mac 开发启动的 Electron + React + Vite 空壳，含安全 IPC、ESLint/Prettier，以及 Codex 风格对话优先 UI 占位。

**Architecture:** electron-vite 统一构建 main/preload/renderer；preload 经 contextBridge 暴露 `window.myAgent`；React 左窄栏 + 主对话区；业务能力全部延后。

**Tech Stack:** Electron, electron-vite, React 18+, TypeScript (strict), electron-builder, vitest, ESLint, Prettier, npm

## Global Constraints

- Platforms: Windows + macOS
- Security: `contextIsolation: true`, `nodeIntegration: false`
- UI language: 简体中文（专有名词可英文）
- UI style: Codex-inspired — 对话优先、克制、少卡片/徽章
- Preserve existing: `docs/`, `openspec/`, `AGENTS.md`, `.cursor/`
- Do NOT implement: LangGraph, model client, memory DB, Skills, computer-use
- Package manager: npm
- App id placeholder: `com.local.my-agent` / productName `my-agent`

## File Structure (target)

```text
package.json
electron.vite.config.ts
electron-builder.yml
tsconfig.json / tsconfig.node.json / tsconfig.web.json
eslint.config.js
.prettierrc
vitest.config.ts
README.md
src/shared/ipc.ts
src/shared/paths.ts
src/main/index.ts
src/main/ipc.ts
src/preload/index.ts
src/preload/index.d.ts
src/renderer/index.html
src/renderer/src/main.tsx
src/renderer/src/App.tsx
src/renderer/src/styles/tokens.css
src/renderer/src/styles/app.css
src/renderer/src/components/Sidebar.tsx
src/renderer/src/components/ChatWorkspace.tsx
src/renderer/src/components/PlaceholderView.tsx
src/renderer/src/components/ModeToggle.tsx
src/renderer/src/env.d.ts
src/shared/paths.test.ts
```

---

### Task 1: Scaffold electron-vite React-TS (保留现有文档)

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig*.json`, `src/main/**`, `src/preload/**`, `src/renderer/**` (via template, then trim)
- Modify: none of `docs/`, `openspec/`, `AGENTS.md`
- Test: `npm run dev` smoke later in Task 4

**Interfaces:**
- Consumes: none
- Produces: runnable electron-vite project root with `npm run dev` script

- [ ] **Step 1: Scaffold into a temp folder then merge**

```bash
cd "demo/my-agent"
npm create @quick-start/electron@latest _scaffold -- --template react-ts
```

Expected: `_scaffold/` contains electron-vite React-TS template.

- [ ] **Step 2: Copy scaffold files into repo root without deleting protected dirs**

Copy from `_scaffold` into `.` : `package.json`, configs, `src/`, and other template files.  
Do NOT overwrite `docs/`, `openspec/`, `AGENTS.md`, `.cursor/`.  
Remove `_scaffold` after merge.  
If template uses different folder names, rename to match File Structure above (`src/main`, `src/preload`, `src/renderer`).

- [ ] **Step 3: Set package identity**

In `package.json`:
- `"name": "my-agent"`
- `"main"` points to electron-vite out dir (template default, usually `./out/main/index.js`)
- Ensure scripts include at least: `"dev": "electron-vite dev"`, `"build": "electron-vite build"`

- [ ] **Step 4: Install dependencies**

```bash
npm install
```

Expected: lockfile created, no install errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json electron.vite.config.ts tsconfig*.json src
git commit -m "chore: scaffold electron-vite react-ts shell"
```

---

### Task 2: Tooling — ESLint, Prettier, Vitest, builder

**Files:**
- Create/Modify: `eslint.config.js`, `.prettierrc`, `.prettierignore`, `vitest.config.ts`, `electron-builder.yml`, `package.json` scripts, `README.md`
- Test: `npm run lint`, `npm test` (may be empty/pass)

**Interfaces:**
- Consumes: Task 1 package.json
- Produces: scripts `lint`, `format`, `test`, `build:win`, `build:mac`

- [ ] **Step 1: Add devDependencies**

```bash
npm install -D vitest eslint prettier eslint-config-prettier eslint-plugin-react-hooks typescript-eslint electron-builder
```

- [ ] **Step 2: Add scripts to package.json**

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "test": "vitest run",
    "lint": "eslint .",
    "format": "prettier --write .",
    "build:win": "npm run build && electron-builder --win",
    "build:mac": "npm run build && electron-builder --mac"
  }
}
```

- [ ] **Step 3: Write `electron-builder.yml`**

```yaml
appId: com.local.my-agent
productName: my-agent
directories:
  buildResources: build
  output: release
files:
  - out/**/*
  - package.json
win:
  target: nsis
mac:
  target: dmg
```

- [ ] **Step 4: Minimal ESLint + Prettier + vitest configs**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts']
  }
})
```

Enable TypeScript `strict: true` in relevant tsconfig.

- [ ] **Step 5: Write README.md**

Must state: supports Windows + macOS; how to `npm install`, `npm run dev`, `npm run lint`, `npm test`; note Mac packaging needs macOS host.

- [ ] **Step 6: Verify tooling commands**

```bash
npm run lint
npm test
```

Expected: lint exits 0 (or only fixable issues you then fix); test passes (0 tests OK for now).

- [ ] **Step 7: Commit**

```bash
git add eslint.config.js .prettierrc vitest.config.ts electron-builder.yml README.md package.json package-lock.json
git commit -m "chore: add eslint prettier vitest and electron-builder"
```

---

### Task 3: Shared IPC types + path helpers (TDD)

**Files:**
- Create: `src/shared/ipc.ts`, `src/shared/paths.ts`, `src/shared/paths.test.ts`
- Test: `src/shared/paths.test.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `export type AppPaths = { userData: string; platform: NodeJS.Platform }`
  - `export const IPC = { ping: 'my-agent:ping', getPaths: 'my-agent:get-paths' } as const`
  - `export function assertAppPaths(value: unknown): asserts value is AppPaths`

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/paths.test.ts
import { describe, expect, it } from 'vitest'
import { assertAppPaths } from './paths'

describe('assertAppPaths', () => {
  it('accepts valid paths object', () => {
    expect(() =>
      assertAppPaths({ userData: 'C:/Users/x/AppData/Roaming/my-agent', platform: 'win32' })
    ).not.toThrow()
  })

  it('rejects missing userData', () => {
    expect(() => assertAppPaths({ platform: 'win32' })).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: FAIL — cannot find module `./paths` or `assertAppPaths`.

- [ ] **Step 3: Minimal implementation**

```ts
// src/shared/ipc.ts
export const IPC = {
  ping: 'my-agent:ping',
  getPaths: 'my-agent:get-paths'
} as const

export type AppPaths = {
  userData: string
  platform: NodeJS.Platform
}

// src/shared/paths.ts
import type { AppPaths } from './ipc'

export function assertAppPaths(value: unknown): asserts value is AppPaths {
  if (!value || typeof value !== 'object') throw new Error('paths must be object')
  const v = value as Record<string, unknown>
  if (typeof v.userData !== 'string' || v.userData.length === 0) {
    throw new Error('userData must be non-empty string')
  }
  if (typeof v.platform !== 'string' || v.platform.length === 0) {
    throw new Error('platform must be non-empty string')
  }
}
```

Re-export `assertAppPaths` consumers from `paths.ts`; keep `AppPaths` in `ipc.ts`.

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add src/shared
git commit -m "feat: add shared ipc channels and path assertions"
```

---

### Task 4: Main + preload secure bridge

**Files:**
- Modify: `src/main/index.ts` (or template main entry)
- Create/Modify: `src/main/ipc.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`
- Test: reuse Task 3 unit tests; manual ping in Task 5

**Interfaces:**
- Consumes: `IPC`, `AppPaths` from `src/shared/ipc.ts`
- Produces:
  - `window.myAgent.ping(): Promise<'pong'>`
  - `window.myAgent.getPaths(): Promise<AppPaths>`

- [ ] **Step 1: Implement main IPC handlers**

```ts
// src/main/ipc.ts
import { app, ipcMain } from 'electron'
import { IPC, type AppPaths } from '../shared/ipc'

export function registerIpc(): void {
  ipcMain.handle(IPC.ping, async () => 'pong' as const)
  ipcMain.handle(IPC.getPaths, async (): Promise<AppPaths> => ({
    userData: app.getPath('userData'),
    platform: process.platform
  }))
}
```

Call `registerIpc()` from main before/at app ready.

- [ ] **Step 2: Secure BrowserWindow**

Ensure webPreferences:

```ts
{
  preload: path.join(__dirname, '../preload/index.js'), // adjust to template out paths
  contextIsolation: true,
  nodeIntegration: false
}
```

- [ ] **Step 3: Preload bridge**

```ts
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'

contextBridge.exposeInMainWorld('myAgent', {
  ping: (): Promise<'pong'> => ipcRenderer.invoke(IPC.ping),
  getPaths: () => ipcRenderer.invoke(IPC.getPaths)
})
```

```ts
// src/preload/index.d.ts
import type { AppPaths } from '../shared/ipc'

export interface MyAgentApi {
  ping: () => Promise<'pong'>
  getPaths: () => Promise<AppPaths>
}

declare global {
  interface Window {
    myAgent: MyAgentApi
  }
}

export {}
```

- [ ] **Step 4: Typecheck / lint**

```bash
npm run lint
```

Expected: pass (fix any issues introduced).

- [ ] **Step 5: Commit**

```bash
git add src/main src/preload
git commit -m "feat: secure window and myAgent ipc bridge"
```

---

### Task 5: Codex-style renderer shell UI

**Files:**
- Create/Modify: `src/renderer/src/App.tsx`, `Sidebar.tsx`, `ChatWorkspace.tsx`, `PlaceholderView.tsx`, `ModeToggle.tsx`, `styles/tokens.css`, `styles/app.css`, `main.tsx`
- Test: manual + ping status in UI

**Interfaces:**
- Consumes: `window.myAgent.ping`, `window.myAgent.getPaths`
- Produces: nav state `'chat' | 'memory' | 'skills'`; mode UI state `'interactive' | 'goal'` (visual only)

- [ ] **Step 1: Add design tokens (avoid purple-on-white AI cliché; Codex-like restrained)**

```css
/* src/renderer/src/styles/tokens.css */
:root {
  --bg: #0f1115;
  --bg-elevated: #161a22;
  --border: #2a3140;
  --text: #e8eaed;
  --text-muted: #9aa3b2;
  --accent: #c4c7ce;
  --sidebar-width: 220px;
  --font: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}
```

- [ ] **Step 2: Sidebar + App shell**

`Sidebar` renders three buttons: 聊天 / 记忆 / 技能.  
`App` holds `activeNav`; chat → `ChatWorkspace`; others → `PlaceholderView` with「后续版本提供」.

- [ ] **Step 3: ChatWorkspace**

Must include:
- Ready copy: 简体中文，含 `my-agent` 标识
- Empty conversation outline
- Input textarea/contenteditable **visible**
- Send control disabled OR click shows「尚未接通模型」and MUST NOT call any model API
- `ModeToggle`: 交互式 | 目标 — visual only
- On mount: `const pong = await window.myAgent.ping()`; show discreet status「IPC 正常」when `pong === 'pong'`

- [ ] **Step 4: Wire CSS layout**

Left narrow sidebar + main pane; no card grids; no floating badges.

- [ ] **Step 5: Manual smoke**

```bash
npm run dev
```

Expected: window opens; sidebar 3 items; chat shows ready + input disabled behavior; memory/skills placeholder; IPC status ok.

- [ ] **Step 6: Commit**

```bash
git add src/renderer
git commit -m "feat: add Codex-style shell UI placeholders"
```

---

### Task 6: Acceptance + OpenSpec config touch-up

**Files:**
- Modify: `openspec/config.yaml`, `openspec/changes/bootstrap-electron-shell/tasks.md` (checkboxes)
- Verify against specs

**Interfaces:**
- Consumes: running app from Tasks 1–5
- Produces: all `tasks.md` items `[x]`

- [ ] **Step 1: Run full gates**

```bash
npm test
npm run lint
npm run build
```

Expected: all succeed on Windows.

- [ ] **Step 2: Spec checklist**

Confirm manually:
- [app-shell] dev window, win+mac declared, isolation, ping, userData
- [renderer-shell-ui] nav, ready+empty chat, input not live, mode placeholder, Chinese copy

- [ ] **Step 3: Update openspec config**

```yaml
project:
  test_commands:
    - "npm test"
    - "npm run lint"
  dev_stack_command: "npm run dev"
```

- [ ] **Step 4: Mark all tasks in `tasks.md` complete (`[x]`)**

- [ ] **Step 5: Commit**

```bash
git add openspec/config.yaml openspec/changes/bootstrap-electron-shell/tasks.md
git commit -m "docs: accept electron shell bootstrap"
```

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| 跨平台桌面壳可启动 | 1, 2, 6 |
| 安全进程隔离 | 4 |
| 最小 IPC 骨架 | 3, 4, 5 |
| userData 路径约定 | 3, 4 |
| Codex 导航骨架 | 5 |
| 就绪态与空对话轮廓 | 5 |
| 模式切换占位 | 5 |
| 中文文案 | 5 |
| ESLint/Prettier | 2 |

## Placeholder scan

No TBD/TODO steps remaining in this plan.
