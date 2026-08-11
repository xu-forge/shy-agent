# Brainstorm: goal-mode-runtime-budget

目标模式「结果导向」体验的三个短板（对应上一次 review 结论）：

1. 无成本预算 → 付费模型长任务可能烧 token。
2. 停滞只看 done 数 → 误判/误暂停。
3. 验收自证 → 无法保证「可验收完成」。

已决：本 change 落地 token 预算 + 工具级停滞 + 可执行 check 字段（数据先行）；可执行 check 的 rules engine 后续单独 change。
