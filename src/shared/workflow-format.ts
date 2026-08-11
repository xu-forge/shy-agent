import type { WorkflowSchedule } from './ipc'

/** 人类可读描述（用于 UI 展示） */
export function describeSchedule(s: WorkflowSchedule): string {
  const t = s.time ?? '09:00'
  switch (s.frequency) {
    case 'hourly':
      return `每小时 ${s.minute ?? 0} 分`
    case 'daily':
      return `每天 ${t}`
    case 'weekdays': {
      const days = s.weekdays?.length
        ? s.weekdays
            .map((d) => ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d])
            .join('、')
        : '工作日'
      return `每周 ${days} ${t}`
    }
    case 'weekly': {
      const days = s.weekdays?.length
        ? s.weekdays
            .map((d) => ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d])
            .join('、')
        : '周一'
      return `每周 ${days} ${t}`
    }
    case 'monthly':
      return `每月 ${s.dayOfMonth ?? 1} 日 ${t}`
    default:
      return `每天 ${t}`
  }
}

export const NODE_TYPE_LABELS: Record<string, string> = {
  trigger: '触发',
  fetch: '抓取',
  summarize: '总结',
  recommend: '推荐',
  write_doc: '写文档',
  output: '输出'
}
