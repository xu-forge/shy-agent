## 1. Dock 状态与壳

- [x] 1.1 `dockMode` 类型与 localStorage（替代/迁移 `shy.inspectorOpen`），缺省 `null` 收起；单测 parse
- [x] 1.2 将 `InspectorPanel` 抽为 `SessionDock` 壳：滑动宽度、`tasks|browser|files`、展开时头栏右上收起
- [x] 1.3 任务详情两块（进度/产物相对路径树）作为 `tasks` 页迁入，行为保持

## 2. 会话顶栏工具条

- [x] 2.1 顶栏四控件：打开方式下拉、地球、文件夹、任务详情图标（图一顺序）
- [x] 2.2 互斥：点模式展开；再点当前模式收起；展开后顶栏隐藏三模式开关，仅留打开方式
- [x] 2.3 `resolveShellLayout`：仅会话主列展示 Dock；代码 IDE / 素材主区不展示；补 layout 单测
- [x] 2.4 滑动动画保留；收起无占位白边

## 3. 打开方式

- [x] 3.1 IPC：打开绑定 `rootPath` 或会话 workspace（无则创建）
- [x] 3.2 下拉「在访达中显示」接到该 IPC；失败有可见提示

## 4. 浏览器模式

- [x] 4.1 Dock `browser` 嵌入 `BrowserPanel embedded`
- [x] 4.2 切走或收起时卸载面板以 `browserHide`

## 5. 文件目录与预览

- [x] 5.1 会话 workspace 列树 IPC（path guard，忽略常见大目录）；已绑定复用项目树
- [x] 5.2 树 UI：相对路径 + 文件名，筛选可选
- [x] 5.3 只读预览：图片、Markdown、HTML（沙箱）、纯文本；其它 reveal/系统打开
- [x] 5.4 预览分流单测（扩展名 → kind）

## 6. 验收

- [x] 6.1 `npm run typecheck && npm test` 通过
- [ ] 6.2 手测：四控件、互斥滑动、Finder 打开、浏览器、md/图片预览、任务详情产物相对路径
