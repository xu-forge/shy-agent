# Proposal: material-canvas-controls

## Why

素材画板目前支持滚轮缩放、触控板缩放和平移，但缺少明确的可发现控件。用户无法快速恢复 100%、适应画布或切换到框选操作。

## What Changes

- From: 主要依赖鼠标/触控板手势操作画布。
- To: 在画板底部增加悬浮工具栏，提供缩放、比例恢复、适应画布、选择工具和移动画布入口。
- Reason: 提高画板操作的可发现性，并为框选素材提供明确模式。
- Impact: `MaterialCanvas`、素材画板状态和样式；不改变素材文件数据。

## Capabilities

### New Capabilities

- `material-canvas-controls`：画板底部操作栏、缩放快捷操作、视图恢复和框选模式。

## Impact

- **renderer**：画板交互状态、底部工具栏、框选绘制和选中高亮。
- **不改**：素材导入、删除、重命名、文件预览和分组持久化协议。
- **测试**：缩放边界、适应画布、框选命中、Shift 追加选择、空白取消和移动模式切换。
