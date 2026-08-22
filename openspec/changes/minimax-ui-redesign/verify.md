# Verify — minimax-ui-redesign

## Automated verification (已通过)

- `npm run typecheck` → 通过（node + web）
- `npm test` → 49 files / 330 tests 通过（含新增 `src/main/confirm.test.ts` 覆盖始终授权放行/逐条确认/缺省回退）
- `npx electron-vite build` → 通过（out/main/index.js、out/preload/index.js、out/renderer 均成功构建）
- `openspec validate minimax-ui-redesign` → valid

## Coverage of requirements

- `minimax-layout`
  - 左栏（新建任务 / 搜索 / 导航 / 会话列表 / 账户卡）✅
  - 空态主页（居中 logo + 标语 + 大输入框 + 选项行 + 功能 pills）✅
  - 对话线程 / 工具卡片 / 产出「已编辑文件」卡 ✅
  - `/` 命令菜单（模式 + 技能，技能项含 name+description，实时过滤）✅
  - 展示型模型选择器 ✅
  - 右侧环境面板（三 tab + 进度条）✅
- `always-authorize`
  - `autoApproveTools` 配置 + 缺省兼容 ✅
  - `confirm.ts` 闸门放行 / 逐条确认 ✅
  - 本地持久化（复用 settingsGet/settingsSet）✅

## Manual walkthrough — 待人工/截图确认

由于 Electron 界面无法在本会话内直接截图，以下需在 `npm run dev` 下人工点验：

1. **左栏**：是否呈图一布局（`新建任务`主按钮 / 搜索框 / 导航 / `会话`分组 / 底部 `shy` 账户卡）；点击各导航可切换视图。
2. **空态主页**：无消息会话时是否呈图二（居中 logo + `让工作更简单。` + 大输入框 + `始终授权` toggle + 模型徽标 + 功能 pills）；输入可发送。
3. **`/` 命令菜单**：在输入框键首键入 `/` 是否弹出菜单（模式 + 技能，技能含名称+描述）；继续输入是否实时过滤；↑/↓/Enter/Esc 是否可用；选「目标」是否不再出现验证命令输入框。
4. **始终授权**：切换后重开 app 是否保持；开启后工具是否不再逐条确认。
5. **对话区**：是否有消息时线程/工具卡片/「已编辑 N 个文件」卡正常；右侧环境面板三 tab 正常。
6. **回归**：记忆 / 技能 / 日历 / 设置四视图是否无样式回归。

## Known limitations

- 产出文件卡仅汇总 `listSessionFiles` 的 `write` 数，无文件 diff / 行数（后续 change 接真实文件变更事件）。
- 模型选择器为展示型，不做多模型切换。
- 不提供分支 / 本地模式 / 打开终端 / 项目分组。
