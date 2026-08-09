## 1. Settings + IPC

- [x] 1.1 settings.json 读写服务
- [x] 1.2 IPC settingsGet/settingsSet + preload 暴露
- [x] 1.3 UI 设置入口（聊天顶栏或简易面板）

## 2. LangGraph runtime

- [x] 2.1 安装 langchain 依赖
- [x] 2.2 实现 AgentService（interactive/goal、cancel、事件）
- [x] 2.3 工具注册表 + 内置 ping 工具
- [x] 2.4 IPC agentChat/agentCancel + 事件推送

## 3. Renderer 接通

- [x] 3.1 发送消息走 agentChat
- [x] 3.2 展示流式/增量消息与状态
