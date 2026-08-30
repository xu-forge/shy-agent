# Plan: session-render-performance

1. 定义 `SessionMessagesPage`、游标和 preload IPC；补 main store 的复合排序、分页与边界测试。
2. 选定并引入支持动态高度的虚拟列表，实现 block key、overscan、测量刷新和 prepend 锚点恢复。
3. 将 `ChatWorkspace` 的历史消息加载改为最近一页 + 顶部按需加载，处理会话切换、重复请求和滚动状态。
4. 抽出 memo 化的消息 block 和 timeline，缓存历史 segments，保证工具详情展开与文件卡片行为不变。
5. 将 streaming turn 从历史列表拆出，实现 delta 批处理、完成事件 flush 和自动跟随底部规则。
6. 优化 `MarkdownBody` 的流式策略，并为消息块增加 `content-visibility` 兜底样式。
7. 补充单测、组件测试和性能验收脚本，执行 `npm run typecheck && npm run lint && npm test`。
