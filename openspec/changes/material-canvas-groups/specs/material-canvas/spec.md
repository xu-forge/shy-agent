## MODIFIED Requirements

### Requirement: 自动布局

画布 MUST 将素材组织为目录分组框（见「目录分组框」）与根目录散文件两类：散文件排在画布顶部无框区域；每个分组框内的文件按 `mtimeMs` 倒序（并列按 `relativePath` 稳定）以**固定 5 列**的网格布局。列数 MUST NOT 随缩放级别或视口宽度变化，缩放时组框与卡片 MUST 整体等比缩放。布局 MUST 为纯函数。新素材（导入或会话写入）MUST 依排序出现在其所属分组的头部；根文件出现在散文件区头部；已有卡片相对位置 MUST 保持不变。

#### Scenario: 缩放不变列数
- **WHEN** 用户在画布上以任意级别缩放
- **THEN** 各分组框内每行的卡片数 MUST 恒为 5，组框与卡片 MUST 整体等比缩放

#### Scenario: 修改时间倒序
- **WHEN** 同一分组内有 mtime 为 t1 < t2 < t3 的三个素材
- **THEN** 该分组内布局序列 MUST 为 t3、t2、t1 对应的卡片

#### Scenario: 新素材不扰动已有位置
- **WHEN** 轮询刷新发现某目录新增一个文件
- **THEN** 该分组内已有卡片相对位置 MUST 不变，新卡片 MUST 出现在分组头部

### Requirement: 画布状态持久化

系统 MUST 按项目持久化画布视口（x/y/scale）、排序偏好与分组折叠状态至 `~/.shy`（如 `state/material-canvas/<projectId>.json`，新增 `collapsed: string[]` 记录折叠目录的相对路径），写入 MUST 防抖；重新打开同一项目时 MUST 还原上次视口、排序偏好与折叠状态；无持久化状态或旧格式文件（无 `collapsed` 字段）MUST 按「全部分组展开」兼容处理。排序偏好字段 MUST 预留扩展（v1 仅修改时间倒序）。

#### Scenario: 重开还原视口与折叠
- **WHEN** 用户折叠某分组并平移缩放后关闭应用，再次打开该项目
- **THEN** 画布 MUST 还原视口位置、缩放级别，且该分组 MUST 保持折叠

#### Scenario: 旧状态文件兼容
- **WHEN** 项目的状态文件由旧版本写入（无 `collapsed` 字段）
- **THEN** 系统 MUST 正常读入视口并按全部分组展开处理，MUST NOT 报错

#### Scenario: 首次打开
- **WHEN** 项目无持久化画布状态
- **THEN** 画布 MUST 以默认缩放定位到画布顶部（散文件区与第一个分组）

## ADDED Requirements

### Requirement: 目录分组框

系统 MUST 依据 `relativePath` 将素材组织为目录分组树：每个目录渲染为一个可折叠分组框（浅灰圆角容器 +「∨ 目录名」标题胶囊），子目录在父分组框内嵌套，嵌套深度 MUST 最多三级（第三级以深的文件归入第三级分组展示）；根目录散文件 MUST 无框排在画布顶部；不含文件的空目录 MUST NOT 渲染。点击标题胶囊 MUST 折叠/展开该分组，折叠后 MUST 仅显示标题胶囊。标题胶囊 MUST 显示目录名与组内素材数量。

#### Scenario: 三级嵌套
- **WHEN** 项目存在 `a/b/c/x.png`（a、b、c 均为目录）与 `a/y.png`
- **THEN** 画布 MUST 渲染 a 分组框，其内嵌套 b 分组框，b 内嵌套 c 分组框，x.png 位于 c 内；y.png 位于 a 内；三者折叠互不影响

#### Scenario: 根文件散放
- **WHEN** 项目根目录存在 `r.png`
- **THEN** r.png MUST 无分组框排在画布顶部散文件区

#### Scenario: 折叠分组
- **WHEN** 用户点击某分组的标题胶囊
- **THEN** 该分组 MUST 折叠为仅剩标题胶囊，再点展开恢复内容；状态 MUST 持久化

### Requirement: 素材右键菜单

在画布中右键素材卡片 MUST 弹出菜单：重命名 / 在目录中显示 / 用系统打开 / 删除；右键分组标题 MUST 弹出菜单：重命名 / 删除。删除 MUST 先弹出确认对话框（明示目标路径；目录删除须明示递归语义），确认后才执行。重命名 MUST 校验新名称非空且不含路径分隔符，目标重名 MUST 报错提示。重命名与删除 MUST 通过具备路径防穿越校验的 IPC 执行，成功后画布 MUST 即时刷新反映变化。Esc、点击菜单外 MUST 关闭菜单。

#### Scenario: 重命名文件
- **WHEN** 用户对 `a/old.png` 执行重命名为 `new.png`
- **THEN** 文件 MUST 被重命名为 `a/new.png`，画布刷新后 MUST 出现新卡片且旧卡片消失

#### Scenario: 删除文件需确认
- **WHEN** 用户对某文件执行删除
- **THEN** 系统 MUST 先弹确认对话框；确认后文件 MUST 从磁盘移除且画布刷新；拒绝则 MUST 无任何变更

#### Scenario: 重命名目录带动子树
- **WHEN** 用户将目录 `a` 重命名为 `b`
- **THEN** `a` 下所有文件路径 MUST 变为 `b/...`，对应分组标题与卡片 MUST 刷新

#### Scenario: 重名报错
- **WHEN** 重命名目标名与同目录已有文件/目录重名
- **THEN** 系统 MUST 提示重名错误且 MUST NOT 执行变更

### Requirement: lightbox 文档快速切换

打开 `kind=doc` 且扩展名为 md/txt/pdf 的素材时，lightbox MUST 提供：←/→ 键与上/下按钮在当前项目全部可读文档（md/txt/pdf）之间循环切换；顶栏显示当前序号（n/N）；右侧固定文档列表（按目录分组、显示文件名、当前文档高亮）点击可直达。非可读文档或其他 kind 的 lightbox MUST NOT 显示切换控件与列表。切换后 lightbox 内容 MUST 更新为新文档对应类型的渲染，关闭行为不变。

#### Scenario: 键盘切换
- **WHEN** 用户在 lightbox 中按 → 键
- **THEN** lightbox MUST 切换到文档序列中的下一个（末尾则回到第一个），序号 MUST 更新

#### Scenario: 侧边列表直达
- **WHEN** 用户在右侧列表点击另一目录下的文档
- **THEN** lightbox MUST 渲染该文档且列表高亮 MUST 随之移动

#### Scenario: 非文档不显示切换
- **WHEN** 用户打开一张图片的 lightbox
- **THEN** 界面 MUST NOT 出现文档切换控件与文档列表
