# 项目工作区 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地图一主题、图标轨分组导航、项目实体（代码/素材绑本机目录）、首条消息绑定、Monaco 代码工作区与素材网格。

**Architecture:** 项目与绑定逻辑放在 `src/main/projects/`；Agent 工作区经 `resolveAgentWorkspace` 单点解析，避免 `paths.ts` 依赖 SQLite。渲染层拆 IconRail + SecondarySidebar，按 `session.projectId` + `project.type` 在对话 / 代码 / 素材三套布局间切换。素材只暴露 `MaterialItem` + 空的 `MaterialEditor` 注册表。

**Tech Stack:** Electron + React + Vite；better-sqlite3；新增 `monaco-editor` 与 `@monaco-editor/react`。

## Global Constraints

- 规格与任务以简体中文为主；代码标识符用英文。
- 高危删除必须走现有确认闸门；删项目不得删用户磁盘文件。
- 不把设计写到 `docs/superpowers/`。
- 测试：`npm test`（vitest）；类型：`npm run typecheck`。
- 默认忽略目录：`node_modules` `.git` `dist` `out` `.next` `coverage` `.shy`。
- 文件树默认上限 5000 节点。
- 绑定只发生在首条用户消息发出时；空会话不切 IDE。

---

## File map

- Create: `src/main/projects/store.ts` — 项目表与 CRUD
- Create: `src/main/projects/store.test.ts`
- Create: `src/main/projects/workspace.ts` — `resolveAgentWorkspace`
- Create: `src/main/projects/workspace.test.ts`
- Create: `src/main/projects/fs-guard.ts` — 路径约束、忽略名单、树/素材扫描
- Create: `src/main/projects/fs-guard.test.ts`
- Modify: `src/main/sessions/store.ts` — `project_id` 列与 bind
- Modify: `src/main/paths.ts` — 导出 `getDefaultSessionWorkspace`（原 `getSessionWorkspace` 改名，保留 re-export 别名给旧测试直到迁完）
- Modify: `src/main/agent/service.ts`、`src/main/agent/goal-driver.ts` — 改用 `resolveAgentWorkspace`
- Modify: `src/shared/ipc.ts`、`src/preload/index.ts`、`src/preload/index.d.ts`、`src/main/ipc.ts`
- Modify: `src/renderer/src/styles/tokens.css`、`app.css`
- Create: `src/renderer/src/components/IconRail.tsx`、`SecondarySidebar.tsx`、`ProjectPicker.tsx`、`CodeWorkspace.tsx`、`FileTree.tsx`、`MaterialLibrary.tsx`、`MaterialViewer.tsx`、`material/registry.ts`
- Modify: `App.tsx`、`Sidebar.tsx`、`ChatWorkspace.tsx`、`Composer.tsx`、`InspectorPanel.tsx`

---

### Task 1: 项目表 CRUD

**Files:**
- Create: `src/main/projects/store.ts`
- Test: `src/main/projects/store.test.ts`
- Modify: `src/shared/ipc.ts`（先加类型，通道名可下个任务再挂 IPC）

**Interfaces:**
- Consumes: `getDb()` from `src/main/memory/db.ts`；`SHY_HOME` 测试夹具同 `sessions/store.test.ts`
- Produces:

```ts
export type ProjectType = 'code' | 'material'
export type Project = {
  id: string
  name: string
  type: ProjectType
  rootPath: string
  createdAt: string
  updatedAt: string
}
export function ensureProjectTables(): void
export function createProject(input: {
  type: ProjectType
  rootPath: string
  name?: string
}): Project
export function listProjects(): Project[]
export function getProject(id: string): Project | null
export function deleteProject(id: string): { ok: boolean }
```

`createProject` 在 `rootPath` 已存在时 throw `Error('root_path_taken')`。`type` 无 update API。

- [ ] **Step 1: Write the failing test**

```ts
// src/main/projects/store.test.ts
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => process.env.SHY_HOME ?? tmpdir() }
}))

let tmpDir = ''
let rootA = ''

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'shy-proj-'))
  process.env.SHY_HOME = tmpDir
  rootA = join(tmpDir, 'repo-a')
  mkdirSync(rootA)
  vi.resetModules()
})

afterEach(() => {
  delete process.env.SHY_HOME
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('projects store', () => {
  it('创建代码项目，name 默认 basename', async () => {
    const { createProject, getProject } = await import('./store')
    const p = createProject({ type: 'code', rootPath: rootA })
    expect(p.type).toBe('code')
    expect(p.name).toBe('repo-a')
    expect(getProject(p.id)?.rootPath).toBe(rootA)
  })

  it('重复 rootPath 拒绝', async () => {
    const { createProject } = await import('./store')
    createProject({ type: 'code', rootPath: rootA })
    expect(() => createProject({ type: 'material', rootPath: rootA })).toThrow(/root_path_taken/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/projects/store.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: Write minimal implementation**

在 `store.ts`：`CREATE TABLE IF NOT EXISTS projects (...)`；`root_path TEXT UNIQUE`；`createProject` 用 `path.basename`；捕获 sqlite UNIQUE 转成 `root_path_taken`。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/projects/store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/projects/store.ts src/main/projects/store.test.ts src/shared/ipc.ts
git commit -m "$(cat <<'EOF'
feat(projects): add SQLite project records with unique root path

EOF
)"
```

---

### Task 2: 会话 project_id 与绑定锁定

**Files:**
- Modify: `src/main/sessions/store.ts`、`src/main/sessions/store.test.ts`
- Modify: `src/shared/ipc.ts` — `SessionSummary.projectId?: string | null`
- Modify: `src/main/projects/store.ts` — `bindSessionProject`、`deleteProject` 解绑
- Test: `src/main/projects/store.test.ts` 追加用例

**Interfaces:**
- Consumes: Task 1 `createProject`
- Produces:

```ts
export function bindSessionProject(
  sessionId: string,
  projectId: string | null
): { ok: true } | { ok: false; error: 'already_bound' | 'has_messages' | 'not_found' }

export function countUserMessages(sessionId: string): number
```

规则：`project_id` 已非空 → `already_bound`；`countUserMessages > 0` → `has_messages`；允许 `projectId=null` 仅当尚未绑定且无消息（空操作成功）。`deleteProject`：`UPDATE sessions SET project_id=NULL WHERE project_id=?` 再删项目行。

- [ ] **Step 1: Write the failing test**

```ts
it('首条消息前可绑定，绑定后拒绝再绑', async () => {
  const sessions = await import('../sessions/store')
  const { createProject, bindSessionProject } = await import('./store')
  const s = sessions.createSession('interactive', 't')
  const p = createProject({ type: 'code', rootPath: rootA })
  expect(bindSessionProject(s.id, p.id).ok).toBe(true)
  expect(bindSessionProject(s.id, p.id).ok).toBe(false)
})

it('已有用户消息则拒绝绑定', async () => {
  const sessions = await import('../sessions/store')
  const { createProject, bindSessionProject } = await import('./store')
  const s = sessions.createSession('interactive', 't')
  sessions.appendMessage(s.id, 'user', 'hi')
  const p = createProject({ type: 'code', rootPath: rootA })
  expect(bindSessionProject(s.id, p.id)).toEqual({ ok: false, error: 'has_messages' })
})

it('删项目后会话 projectId 为空且消息仍在', async () => {
  const sessions = await import('../sessions/store')
  const { createProject, bindSessionProject, deleteProject } = await import('./store')
  const s = sessions.createSession('interactive', 't')
  const p = createProject({ type: 'code', rootPath: rootA })
  bindSessionProject(s.id, p.id)
  sessions.appendMessage(s.id, 'user', 'hi')
  deleteProject(p.id)
  const d = sessions.getSession(s.id)
  expect(d?.projectId ?? null).toBeNull()
  expect(d?.messages.some((m) => m.role === 'user')).toBe(true)
})
```

对照 `appendMessage` 真实签名：读 `sessions/store.ts` 后按现有参数调用，不要杜撰。若签名是 `(sessionId, role, content)` 则改测试与之匹配。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/projects/store.test.ts src/main/sessions/store.test.ts`

- [ ] **Step 3: Write minimal implementation**

`ensureSessionTables` 里 `PRAGMA table_info` 后若无 `project_id` 则 `ALTER TABLE sessions ADD COLUMN project_id TEXT`。`rowToSummary` 读出该列。`bindSessionProject` 按上面规则。`deleteProject` 先解绑。

- [ ] **Step 4: Run tests PASS**

- [ ] **Step 5: Commit**

```bash
git add src/main/projects src/main/sessions src/shared/ipc.ts
git commit -m "$(cat <<'EOF'
feat(projects): bind sessions on empty history only

EOF
)"
```

---

### Task 3: resolveAgentWorkspace

**Files:**
- Create: `src/main/projects/workspace.ts`、`src/main/projects/workspace.test.ts`
- Modify: `src/main/paths.ts` — 将现函数改名为 `getDefaultSessionWorkspace`，并保留 `getSessionWorkspace` 作为指向 `getDefaultSessionWorkspace` 的别名（避免一次改爆所有测试）
- Modify: `src/main/agent/service.ts:193`、`src/main/agent/goal-driver.ts:602` — `workspaceDir: resolveAgentWorkspace(sessionId)`

**Interfaces:**
- Consumes: `getProject`、`getSession`（需能读 `projectId`）、`getDefaultSessionWorkspace`
- Produces:

```ts
export function resolveAgentWorkspace(sessionId: string): string
```

逻辑：session.projectId → getProject → 若 `rootPath` 存在则返回；任何缺失回退 `getDefaultSessionWorkspace(sessionId)`。

- [ ] **Step 1: Write the failing test**

```ts
it('绑定项目后工作区是 rootPath', async () => {
  const sessions = await import('../sessions/store')
  const { createProject, bindSessionProject } = await import('./store')
  const { resolveAgentWorkspace } = await import('./workspace')
  const s = sessions.createSession()
  const p = createProject({ type: 'code', rootPath: rootA })
  bindSessionProject(s.id, p.id)
  expect(resolveAgentWorkspace(s.id)).toBe(rootA)
})

it('未绑定回退会话目录', async () => {
  const sessions = await import('../sessions/store')
  const { getDefaultSessionWorkspace } = await import('../paths')
  const { resolveAgentWorkspace } = await import('./workspace')
  const s = sessions.createSession()
  expect(resolveAgentWorkspace(s.id)).toBe(getDefaultSessionWorkspace(s.id))
})
```

- [ ] **Step 2–4:** 实现并让测试通过；改 service / goal-driver 两处调用。

- [ ] **Step 5: Commit**

```bash
git add src/main/projects/workspace.ts src/main/projects/workspace.test.ts src/main/paths.ts src/main/agent/service.ts src/main/agent/goal-driver.ts
git commit -m "$(cat <<'EOF'
feat(projects): resolve agent workspace from project root

EOF
)"
```

---

### Task 4: 路径守卫、文件树、素材扫描

**Files:**
- Create: `src/main/projects/fs-guard.ts`、`src/main/projects/fs-guard.test.ts`

**Interfaces:**

```ts
export const TREE_IGNORE = ['node_modules', '.git', 'dist', 'out', '.next', 'coverage', '.shy']
export const TREE_NODE_LIMIT = 5000

export function assertInsideRoot(rootPath: string, target: string): string
// 返回 resolved 绝对路径；逃逸则 throw 'path_escape'

export type TreeNode = { name: string; path: string; type: 'file' | 'dir'; children?: TreeNode[] }
export function listProjectTree(rootPath: string): { tree: TreeNode[]; truncated: boolean }

export type MaterialKind = 'image' | 'video' | 'audio' | 'doc' | 'other'
export type MaterialItem = {
  id: string
  relativePath: string
  absPath: string
  kind: MaterialKind
  mime: string
  mtimeMs: number
  size: number
  sourceSessionId?: string
  derivedFrom?: string
}
export function kindFromName(name: string): MaterialKind
export function listMaterials(
  rootPath: string,
  writes?: Array<{ path: string; sessionId: string }>
): MaterialItem[]
export function importMaterial(rootPath: string, sourceAbsPath: string): MaterialItem
```

`id` = posix 相对路径。`listMaterials` 若 `writes` 中某绝对路径匹配，填 `sourceSessionId`。

- [ ] **Step 1: Write the failing test**（忽略 `node_modules`、`..` 逃逸、png→image、import 复制）

- [ ] **Step 2–4:** 实现；`importMaterial` 用 `copyFileSync` 到 `join(rootPath, basename(source))`，重名则追加数字。

- [ ] **Step 5: Commit** `feat(projects): scan trees and materials inside root only`

---

### Task 5: IPC + preload + 选文件夹

**Files:**
- Modify: `src/shared/ipc.ts`、`src/main/ipc.ts`、`src/preload/index.ts`、`src/preload/index.d.ts`

**通道（加到 `IPC` 常量）：**

```
projectsList, projectsCreate, projectsDelete,
sessionsBindProject, projectPickFolder,
projectTreeList, projectFileRead, projectFileWrite,
projectMaterialsList, projectMaterialsImport
```

`projectPickFolder`：`dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })`，取消返回 `{ ok: false }`。

`projectsCreate` 入参 `{ type, rootPath, name? }`，内部 `createProject`。

`projectFileRead/Write` 必须先 `getProject` 再 `assertInsideRoot`。

`projectMaterialsList(projectId)` 内部 `listSessionFiles` 聚合同项目各会话 write，传入 `listMaterials`。

preload 同步暴露 `window.shy.*`，`index.d.ts` 同步类型。

- [ ] **Step 1:** 无独立测试则扩 `fs-guard` 已覆盖的纯函数；IPC 用手工 + typecheck。

- [ ] **Step 2:** 实现 handlers。`projectPickFolder` 需要 `mainWindow`（已有 `setMainWindow`）。

- [ ] **Step 3:** `npm run typecheck`

- [ ] **Step 4: Commit** `feat(projects): expose project IPC and folder picker`

---

### Task 6: 主题 token

**Files:**
- Modify: `src/renderer/src/styles/tokens.css`

浅色：

```css
--accent: #4ade80;
--accent-strong: #22c55e;
--accent-contrast: #052e16;
--bg: #f8fafc;
--canvas: #f8fafc;
--text: #1e293b;
--text-secondary: #64748b;
--border: #cbd5e1;
--radius: 8px;
--radius-lg: 16px;
--rail-width: 64px;
```

深色：绿色相（例如 `--accent: #4ade80` 提高对比的背景 `#0f172a`），**不要**回到 `#0094fc`。

`--focus-ring` 改为绿色半透明。

- [ ] **Step 1–2:** 改 token；`npm run typecheck`
- [ ] **Step 3: Commit** `style: switch accent tokens to design-system green`

---

### Task 7: IconRail、分组侧栏、三套布局骨架

**Files:**
- Create: `src/renderer/src/components/IconRail.tsx`
- Create: `src/renderer/src/components/SecondarySidebar.tsx`（从 `Sidebar.tsx` 迁出会话列表并按项目分组）
- Modify: `src/renderer/src/App.tsx`、`src/renderer/src/styles/app.css`
- Modify or slim: `Sidebar.tsx`（可改为组合 IconRail+SecondarySidebar，避免双份状态）

**布局：**

```tsx
<div className="app-shell">
  <IconRail active={nav} onChange={...} />
  {showSecondary ? <SecondarySidebar ... groupedSessions /> : null}
  <div className="main-column">{/* chat | code | material | skills | calendar */}</div>
  {ungroupedChat && hasConversation ? <InspectorPanel /> : null}
</div>
```

分组：`listProjects()` + `sessions.filter(s => !s.projectId)` 标题「未选择项目」；其余按 `projectId`。代码布局时 `showSecondary` 仍为 true，但内容换成 `FileTree`（Task 9）；用 `secondaryMode: 'sessions' | 'files'`，点轨上项目设回 `'sessions'`。

- [ ] **Step 1:** 实现分组渲染；无会话的项目仍列出空组（若尚未绑定任何会话，列表里仍应能看到已创建项目——创建发生在 picker，项目已入库）。
- [ ] **Step 2:** CSS：`.icon-rail { width: 64px }`。
- [ ] **Step 3: Commit** `feat(ui): add icon rail and project-grouped session list`

---

### Task 8: Inspector 两 tab + Composer 选择器 + bind-on-send

**Files:**
- Modify: `InspectorPanel.tsx` — tabs 仅 `details` | `browser`；详情用 `getSession` + `listSessionFiles`；删除任务/diff UI（`DiffView` 文件可留着不被引用）
- Modify: `Composer.tsx` — 左下角 `ProjectPicker`
- Create: `src/renderer/src/components/ProjectPicker.tsx`
- Modify: `ChatWorkspace.tsx` `onSend`

**bind 时序：**

```ts
const onSend = async () => {
  const text = draft.trim()
  if (!text || busy || !sessionId) return
  const detail = await window.shy.getSession(sessionId)
  const hasUser = detail?.messages.some((m) => m.role === 'user')
  if (!hasUser && !(detail as { projectId?: string }).projectId && pendingProjectId) {
    const r = await window.shy.bindSessionProject(sessionId, pendingProjectId)
    if (!r.ok) { /* 提示 r.error */ return }
  }
  // 现有 chat() ...
}
```

空会话 `pendingProjectId` 默认 `null`。选择器在 `hasUser || projectId` 时 disabled。添加项目：选类型 → `pickFolder` → `createProject` → 设 `pendingProjectId`，**不**改 layout。

`App.tsx` 根据 **已绑定** 的 `session.projectId` + project.type 切 Code/Material，不要用 pending。

- [ ] **Step 1–3:** 实现上述；确认空会话选中代码项目时仍渲染 `ChatWorkspace` 而非 `CodeWorkspace`。
- [ ] **Step 4: Commit** `feat(ui): bind project on first send and slim inspector tabs`

---

### Task 9: 代码工作区 Monaco

**Files:**
- Create: `src/renderer/src/components/code/FileTree.tsx`
- Create: `src/renderer/src/components/code/CodeWorkspace.tsx`
- Create: `src/renderer/src/lib/monaco-env.ts`（worker 配置）
- Modify: `electron.vite.config.ts` 如需 worker 别名
- Modify: `package.json` — 依赖 `monaco-editor` `@monaco-editor/react`
- Modify: `App.tsx` — `type===code` 时主区 `CodeWorkspace`，右侧窄 `ChatWorkspace`

安装：

```bash
npm install monaco-editor @monaco-editor/react
```

`monaco-env.ts` 按 `@monaco-editor/react` + Vite worker 官方方式配置 `MonacoEnvironment.getWorker`。主题：`document.documentElement.dataset.theme === 'dark' ? 'vs-dark' : 'vs'`。

保存：`window.shy.projectFileWrite({ projectId, relativePath, content })`。

刷新：沿用会话 5s 轮询 `listSessionFiles`；若 write 命中当前 tab 且 `!dirty` 则 `projectFileRead` 替换；`dirty` 则设 `conflict: true` 显示条「Agent 已修改此文件，放弃本地更改以加载磁盘版本」。

- [ ] **Step 1:** 安装依赖并确认 `npm run dev` 能打开编辑器高亮。
- [ ] **Step 2:** FileTree 调 `projectTreeList`；忽略名单在 main 已处理。
- [ ] **Step 3:** 多 tab + 保存 + 冲突条。
- [ ] **Step 4:** 同项目会话下拉：`sessions.filter(s => s.projectId === current)`。
- [ ] **Step 5: Commit** `feat(code): add file tree and Monaco workspace`

---

### Task 10: 素材库

**Files:**
- Create: `src/renderer/src/components/material/registry.ts`
- Create: `src/renderer/src/components/material/MaterialLibrary.tsx`
- Create: `src/renderer/src/components/material/MaterialViewer.tsx`
- Modify: `App.tsx`

```ts
// registry.ts
export type MaterialEditor = {
  id: string
  kinds: Array<MaterialItem['kind']>
  mime?: string[]
  label: string
}
export const materialEditors: MaterialEditor[] = []
export function registerMaterialEditor(e: MaterialEditor): void {
  materialEditors.push(e)
}
```

v1 **不要**调用 `registerMaterialEditor`。UI：`materialEditors.length === 0` 时不渲染「编辑」按钮。

网格：`projectMaterialsList` + 过滤 chips。点击 → `MaterialViewer`：image 用 `file://` 或 read 为 data URL（Electron 需在 session 允许该协议，或 `projectFileRead` 转 blob）。其它 kind：按钮调已有 `revealSessionFile` 或 `shell.openPath`（可新增 `projectReveal(absPath)` IPC，仍走 `assertInsideRoot`）。

导入：`dialog` 选文件（非目录）→ `projectMaterialsImport`。

5s 轮询或绑定会话 `session_files` 变化时刷新列表。

- [ ] **Step 1–3:** 实现网格、查看器、导入、空注册表。
- [ ] **Step 4: Commit** `feat(material): add library grid and viewer shell`

---

### Task 11: 验收

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test`
- [ ] **Step 2:** `npm run build`
- [ ] **Step 3:** `npx openspec validate --strict --change project-workspaces-ui`
- [ ] **Step 4:** 手工走查 brainstorm 八条验收锚点。
- [ ] **Step 5: Commit** 若有修复：`fix: project workspace review follow-ups`

---

## Spec coverage

| Spec requirement | Task |
|---|---|
| 项目持久化 / 重复路径 | 1 |
| 会话归属 / 旧会话 null | 2 |
| 首条消息绑定 / 锁定 | 2, 8 |
| 工作区解析 / 删除回退 | 3 |
| 删项目只解绑 | 2 |
| 文件树忽略与逃逸 | 4, 9 |
| Monaco 保存与主题 | 9 |
| Agent 改写刷新 / 脏不覆盖 | 9 |
| MaterialItem / 网格 / 产物 | 4, 10 |
| 查看器壳 / 空注册表 | 10 |
| 导入 | 4, 10 |
| 主题 token | 6 |
| 图标轨 / 分组 / 切回列表 | 7 |
| Composer 选择器 / 不提前切 | 8 |
| 右侧两 tab | 8 |
| 绑定后三栏布局 | 7, 9, 10 |

## Self-review

- 无 TBD 占位实现步骤。
- `appendMessage` 签名以仓库为准，Task 2 必须先读再写测试。
- `resolveAgentWorkspace` 与 `paths.getDefaultSessionWorkspace` 名称在 Task 3 固定，后续任务不得再用旧的「恒为会话目录」语义调用 Agent。
