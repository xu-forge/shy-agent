# Retrospective: project-workspaces-ui

## 结果

实现了项目一等公民（代码/素材绑本机目录）、图一绿主题、图标轨分组、首条消息绑定、Monaco 代码区、素材网格与空编辑器注册表。Apply 在 worktree `feat/project-workspaces-ui` 完成。7.3 真机走查未做。

## 做对了

- 绑定锁与 `resolveAgentWorkspace` 先落地再接线，Agent 第一轮就能写到项目根。
- `ChatWorkspace` 单实例 + CSS 换位，避免绑定瞬间拆掉流式会话。
- 终审补上工具描述 cwd、删除项目 UI、素材扫描上限，与规格对齐。

## 痛点

- SDD 11 个任务 + 多轮 fix，墙钟很长。
- `tasks.md` 在主工作区与 worktree 曾分叉（主仓仍可能留着 propose 时的未跟踪副本）。
- Monaco 0.56 worker 路径到验收才爆。

## Misses / follow-up

- [ ] 7.3 真机：色板、绑定切布局、Monaco 高亮、素材预览、删项目
- [ ] 清理未使用的 `Composer.tsx` 选择器副本与 `sessionFilesFingerprint`
- [ ] archive 时把四份 capability spec sync 进 `openspec/specs/`
- [ ] 文件树在 Agent 新建文件后刷新

## 下一步

人工 `npm run dev`（worktree 或 checkout `feat/project-workspaces-ui`）走查后 archive / 合入 `dev`。
