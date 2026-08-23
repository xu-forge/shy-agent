## ADDED Requirements

### Requirement: 右侧功能面板 tabs
右侧面板 MUST 提供三个 tab：任务（进度+交付物）、文件（diff）、浏览器；tab 选择持久化；切走浏览器 tab 时内嵌浏览器视图 MUST 隐藏且状态保留。

#### Scenario: 切换 tab
- **WHEN** 用户点击「文件」tab
- **THEN** 面板 MUST 展示该会话文件改动 diff 列表，其他 tab 内容不渲染

#### Scenario: 浏览器 tab 隐藏
- **WHEN** 用户从浏览器 tab 切到任务 tab
- **THEN** 原生浏览器区域 MUST 移出主窗口，再次切回时恢复原页面

### Requirement: 文件改动 diff 捕获
`fs_write` 覆盖已存在文件前 MUST 快照旧内容并记录 unified diff；`fs_delete` MUST 记录删除 diff；新文件记录为全量新增；超过 2MB 的文件 MUST 跳过内容快照仅记计数。

#### Scenario: 覆盖写
- **WHEN** Agent 覆盖写某已有文件
- **THEN** 文件 tab 该条记录 MUST 展示旧→新 unified diff，含增删行数

#### Scenario: 新建文件
- **WHEN** Agent 写入新文件
- **THEN** diff MUST 全部为新增行

### Requirement: diff 展示
diff 视图 MUST 以等宽字体渲染 unified diff，新增行绿色标记、删除行红色标记、hunk 头灰色；单条 diff 文本超 200KB MUST 截断并标注。

#### Scenario: 展开记录
- **WHEN** 用户点按文件 tab 中某条改动记录
- **THEN** 该条 MUST 展开显示着色 diff
