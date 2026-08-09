# Verify — bootstrap-electron-shell

## Evidence

- `npm test` — 2/2 passed (`assertAppPaths`)
- `npm run typecheck` — pass
- `npm run lint` — pass
- Code: `contextIsolation: true`, `nodeIntegration: false`, `window.myAgent.ping/getPaths`
- UI: Codex-style sidebar + ready/chat outline + mode toggle placeholder + Chinese copy

## Spec coverage

| Spec | Status |
|------|--------|
| app-shell 可启动/安全/IPC/userData | ✅ implemented |
| renderer-shell-ui Codex 导航/就绪/模式占位/中文 | ✅ implemented |

## Residual

- Manual `npm run dev` window smoke left to human on wake
- macOS packaging not run on Windows host
