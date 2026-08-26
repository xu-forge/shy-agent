/**
 * 工具人话标签。未知名 fallback 为 raw 工具名。
 */
function asRecord(input: unknown): Record<string, unknown> | null {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>
  }
  if (typeof input === 'string') {
    try {
      const v = JSON.parse(input)
      return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  return null
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url.slice(0, 40)
  }
}

export function getToolLabel(name: string, input?: unknown): string {
  const args = asRecord(input)
  switch (name) {
    case 'web_search':
      return args?.query ? `搜索网页 · ${str(args.query)}` : '搜索网页'
    case 'web_fetch':
    case 'browser_fetch': {
      const url = str(args?.url)
      return url ? `抓取网页 · ${hostOf(url)}` : '抓取网页'
    }
    case 'browser_open':
      return '打开浏览器'
    case 'browser':
      return args?.action ? `browser · ${str(args.action)}` : 'browser'
    case 'grep':
      return args?.pattern ? `搜索代码 · ${str(args.pattern)}` : '搜索代码'
    case 'glob':
      return args?.pattern ? `查找文件 · ${str(args.pattern)}` : '查找文件'
    case 'fs_list':
      return args?.path ? `列出目录 · ${str(args.path)}` : '列出目录'
    case 'fs_read':
      return args?.path ? `读取文件 · ${str(args.path)}` : '读取文件'
    case 'fs_write':
      return args?.path ? `写入文件 · ${str(args.path)}` : '写入文件'
    case 'fs_edit':
      return args?.path ? `编辑文件 · ${str(args.path)}` : '编辑文件'
    case 'fs_delete':
      return args?.path ? `删除文件 · ${str(args.path)}` : '删除文件'
    case 'shell_exec':
      return args?.command ? `执行命令 · ${str(args.command).slice(0, 48)}` : '执行命令'
    case 'read_me':
      return args?.module ? `读取指南 · ${str(args.module)}` : '读取指南'
    case 'show_widget':
      return args?.widgetType ? `可视化 · ${str(args.widgetType)}` : '可视化'
    case 'present_artifact': {
      const paths = args?.paths
      const n = Array.isArray(paths) ? paths.length : args?.url ? 1 : 0
      return n ? `呈现产物 · ${n} 项` : '呈现产物'
    }
    case 'ask_user':
      return args?.question ? `询问用户 · ${str(args.question).slice(0, 32)}` : '询问用户'
    case 'read_lints':
      return '读取诊断'
    case 'task':
    case 'task_query':
    case 'task_output':
    case 'task_stop':
      return '任务'
    case 'dispatch_subagent':
      return args?.type ? `dispatch_subagent · ${str(args.type)}` : 'dispatch_subagent'
    case 'image_gen':
      return '生成图像'
    default:
      return name
  }
}
