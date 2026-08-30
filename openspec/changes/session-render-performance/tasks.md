## 1. 分页 IPC 与存储

- [x] 1.1 定义消息游标、分页结果和 preload 类型
- [x] 1.2 实现 SQLite 游标分页、稳定排序、去重边界和 `hasMore`
- [x] 1.3 补充旧会话、空会话、同毫秒时间戳和页边界测试

## 2. 虚拟消息列表

- [x] 2.1 验证并引入支持动态高度的虚拟列表实现
- [x] 2.2 抽出 memo 化消息 block、timeline 和测量刷新逻辑
- [x] 2.3 实现最近一页初始加载及向上分页
- [x] 2.4 实现 prepend 后视觉锚点恢复、重复请求保护和会话切换清理
- [x] 2.5 保持工具详情展开、文件卡片和底部自动跟随行为

## 3. 流式渲染

- [x] 3.1 将流式 turn 与历史消息状态分离
- [x] 3.2 实现约 50ms delta 批处理和完成事件立即 flush
- [ ] 3.3 缓存历史 `messagesToSegments` 结果，避免历史 block 重算
- [x] 3.4 实现流式 Markdown 延迟/纯文本策略及最终 Markdown 切换

## 4. 样式与验证

- [x] 4.1 添加 `content-visibility` 和 intrinsic size 兜底
- [ ] 4.2 补虚拟窗口、滚动锚点、流式隔离和 Markdown 策略测试
- [ ] 4.3 用长消息 fixture 验证 DOM 数量、滚动、输入和流式输出性能
- [x] 4.4 执行 `npm run typecheck && npm run lint && npm test`
