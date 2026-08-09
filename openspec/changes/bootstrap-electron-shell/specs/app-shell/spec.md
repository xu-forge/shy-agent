## ADDED Requirements

### Requirement: 跨平台桌面壳可启动
应用 MUST 以 Electron 桌面壳形式在 Windows 与 macOS 上通过项目提供的开发脚本启动，并显示主窗口。

#### Scenario: 开发模式启动
- **WHEN** 开发者在已安装依赖的仓库根目录执行 `npm run dev`
- **THEN** 应用主窗口 MUST 成功打开且进程无立即崩溃退出

#### Scenario: 平台目标声明
- **WHEN** 查阅项目 README 或构建配置
- **THEN** 文档或配置 MUST 明确支持 Windows 与 macOS 作为目标平台

---

### Requirement: 安全进程隔离
应用 MUST 启用 context isolation，且渲染进程 MUST NOT 直接启用 Node.js integration；受控能力 MUST 仅通过 preload 的 contextBridge 暴露。

#### Scenario: 默认安全配置
- **WHEN** 主进程创建 BrowserWindow
- **THEN** webPreferences MUST 设置 `contextIsolation: true` 且 `nodeIntegration: false`

#### Scenario: Preload 桥接
- **WHEN** 渲染进程需要调用主进程能力
- **THEN** 调用 MUST 经由 preload 暴露的 API，而非直接访问 `require`/`process` 等 Node 能力

---

### Requirement: 最小 IPC 骨架
应用 MUST 提供至少一条可验证的 IPC 通路（例如 ping 或读取平台标识），供后续能力扩展。

#### Scenario: Ping 往返
- **WHEN** 渲染进程调用 preload 暴露的 ping（或等价）API
- **THEN** 主进程 MUST 返回成功响应，证明 IPC 通路可用

---

### Requirement: 用户数据路径约定
应用 MUST 使用 Electron 标准 userData 路径作为未来持久化根目录的约定，并在壳阶段可查询该路径（只读）。

#### Scenario: 查询 userData
- **WHEN** 通过 IPC 或主进程日志请求 userData 路径
- **THEN** 系统 MUST 返回非空的绝对路径字符串
