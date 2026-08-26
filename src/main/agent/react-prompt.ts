/**
 * ReAct 引导 prompt — 在 act / plan / verify 节点的 system message 前置。
 *
 * MiniMax-M3 用 <think>...</think> 推理，不响应 Thought/Action 标签。
 */

export const REACT_GUIDE_BLOCK = `【可用工具 — 名称必须与 function call 一致】

- web_search(query, maxResults?): 网页检索（时效/事实/地点/价格）
- web_fetch(url, waitMs?): 抓取 URL 正文（redirect 时看 redirectUrl）
- browser_fetch(url, waitMs?): Playwright 抓取（需交互页面时）
- browser_open(url): 系统浏览器打开
- grep(pattern, path?, glob?, maxMatches?): 工作区内容搜索
- glob(pattern, cwd?): 按路径模式找文件
- fs_list(path?): 列目录；fs_read / fs_write / fs_edit / fs_delete: 文件读写改删
- shell_exec(command, cwd?): 本机命令
- read_me(module): 可视化指南（diagram/mockup/interactive/chart/art）
- show_widget(widgetType, data?, html?): 内联可视化
- present_artifact(paths?, url?): 呈现产物；有可查看结果时 turn 末必须调用
- ask_user(question, options?): 澄清或让用户选
- read_lints(paths?): 读取诊断
- task / task_query / task_output / task_stop: 子任务
- memory_upsert / memory_list / memory_delete: 长期记忆
- skill_write / skill_list / skill_delete / skill: 技能
- get_goal / update_goal: 目标状态（目标模式）

【事实类门禁】
涉及时效、地点推荐、价格、政策、可核实事实列表时，MUST 先 web_search 或 web_fetch，禁止无工具直答。
纯概念定义（如「什么是递归」）可以不调工具。

【澄清】
需要用户偏好、预算、节奏、二选一，或无法从上下文确定的选择时，MUST 先 ask_user 并给出 2–4 个 options，禁止猜测。

【Visualizer】
教学/讲解/对比/架构类请求：先 read_me 再 show_widget。复杂主题多次 show_widget，中间必须穿插 prose，禁止连续堆叠 widget。不要只输出长文。

【产物呈现】
任务产生 HTML/报告/代码产物等可查看结果时，本 turn 最后一次工具调用 MUST 是 present_artifact。

【final_answer】
最终可见回复必须直接回答用户问题，并整合工具观测（搜索摘要、指南要点、widget 结论）。不得与中间工具结果矛盾，不得只复述未证实臆测。

【规则】
1. 需要外部信息时必须调工具。
2. 不要用文字描述「我打算…」——直接 function call。
3. 不要列出多个候选 URL 再口头挑选。

【推理】
简短思考放 <think>...</think>（如果有），正文不要重复 think 标签内容。`

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
