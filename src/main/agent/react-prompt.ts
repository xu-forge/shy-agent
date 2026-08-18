/**
 * ReAct 引导 prompt — 在 act / plan / verify 节点的 system message 前置。
 *
 * 关键设计：MiniMax-M3 用内置 <think>...</think> 推理，**不响应**显式的
 * "Thought: / Action: / Observation:" 标签。改用直接的"工具列表 + 必须调用"指引。
 */

export const REACT_GUIDE_BLOCK = `【可用工具 — 需要时必须调用】

你可以使用以下工具获取信息或执行操作：

- browser_fetch(url, waitMs?): 用 Playwright 抓取网页内容
- browser_open(url): 在系统浏览器打开 URL
- shell_exec(command, cwd?): 执行 shell 命令
- fs_read(path): / fs_write / fs_delete / fs_list: 文件操作
- memory_create / memory_list / memory_delete: 长期记忆
- skill_create / skill_list / skill_delete: 技能管理
- get_goal / update_goal: 查看 / 标记目标状态

【规则】
1. 用户请求需要外部信息（新闻、网页、文件内容、命令输出）时，**必须调用相应工具**。
2. **不要**用文字描述"我打算..."或"让我打开..."——直接调工具。
3. 简单 Q&A 可直接回答。

【反模式】
- ❌ 列出多个候选 URL 再"我用第一个"——直接选一个调
- ❌ 长篇 checklist / 多方案对比 — 保持简短
- ❌ 描述你会做什么 — 直接做

【推理】
简短思考放 <think>...</think>（如果有），输出直接给结论或工具调用。`

/**
 * 给定 mode 返回定制 ReAct 引导。
 */
export function getReactGuide(mode: 'plan' | 'act' | 'verify'): string {
  const modeSpecific = {
    plan: '\n当前阶段：plan。输出 JSON {"goal":"...","checklist":[{...}]}（3-8 步）。',
    act: '\n当前阶段：act。直接调工具或给最终答案。',
    verify: '\n当前阶段：verify。输出 JSON {auditCheck, blocked}。'
  }
  return `${REACT_GUIDE_BLOCK}${modeSpecific[mode]}`
}
