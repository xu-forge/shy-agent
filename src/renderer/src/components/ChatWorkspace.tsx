import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ModeKey } from './ModeToggle'
import type { SessionFileRecord, SessionSummary, SkillSummary } from '../../../shared/ipc'
import { MarkdownBody } from './MarkdownBody'
import { AgentTimeline } from './chat/AgentTimeline'
import { messagesToSegments } from './chat/turnSegments'
import { SlashMenu, type SlashItem } from './chat/SlashMenu'
import { ProjectPicker } from './ProjectPicker'
import {
  BIND_ERROR_LABEL,
  chatStatusTone,
  isProjectPickerLocked,
  resolveBoundProjectId,
  shouldBindOnSend,
  shouldShowProjectPicker
} from '../lib/projectBind'
import type { CodeLayout } from '../lib/shellLayout'
import { isNearBottom } from '../lib/scrollStick'

type Props = {
  notice?: string
  sessionId: string
  sessions?: SessionSummary[]
  onSessionsChanged?: () => void
  onConversationState?: (has: boolean) => void
  showCodeLayoutToggle?: boolean
  codeLayout?: CodeLayout
  onCodeLayoutChange?: (next: CodeLayout) => void
}

type Msg = {
  role: 'user' | 'assistant' | 'system' | 'tool' | 'reasoning'
  content: string
  createdAt?: string
  kind?: 'result'
  streaming?: boolean
  toolStatus?: 'running' | 'done' | 'failed'
  toolId?: string
  toolName?: string
  toolInput?: unknown
  toolResult?: unknown
  toolError?: string
  durationMs?: number
  reasoningStartedAt?: number
}

// zcode-home-replica：3 条列表式示例（替换原 pills 建议）
const SUGGESTIONS: { label: string; text: string }[] = [
  {
    label: '帮我梳理一个周末计划，含行程、餐饮和大致预算',
    text: '帮我安排一个上海周末两日计划，含行程、餐饮和大致预算。'
  },
  {
    label: '解释一段代码做了什么，并给出优化建议',
    text: '帮我解释下面这段代码做了什么，并给出优化建议：'
  },
  {
    label: '设定目标：根据本周工作要点产出周报草稿',
    text: '目标：根据本周的工作要点，产出一份周报草稿，保存为 Markdown 文件。'
  }
]

/** 时段问候语（zcode-home-replica） */
function greetingForHour(hour: number): string {
  if (hour >= 23 || hour < 6) return '夜深啦，别忘了照顾好自己哦'
  if (hour < 12) return '早上好，今天也从一句提问开始吧'
  if (hour < 18) return '下午好，需要我帮你做点什么？'
  return '晚上好，今天辛苦啦'
}

const MODE_ITEMS: SlashItem[] = [
  { key: 'interactive', label: '交互式', description: '逐步协作', type: 'mode' },
  { key: 'goal', label: '目标', description: '自动续跑并验收', type: 'mode' }
]

export function ChatWorkspace({
  notice,
  sessionId,
  sessions = [],
  onSessionsChanged,
  onConversationState,
  showCodeLayoutToggle = false,
  codeLayout = 'ide',
  onCodeLayoutChange
}: Props): React.JSX.Element {
  const [mode, setMode] = useState<ModeKey>('interactive')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [paused, setPaused] = useState(false)
  const [status, setStatus] = useState('')
  const [messages, setMessages] = useState<Msg[]>([])
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null)
  const [boundProjectId, setBoundProjectId] = useState<string | null>(null)
  const [skills, setSkills] = useState<SkillSummary[]>([])
  const [model, setModel] = useState('')
  const [alwaysAuthorize, setAlwaysAuthorize] = useState(false)
  const [sessionFiles, setSessionFiles] = useState<SessionFileRecord[]>([])
  const [slashIndex, setSlashIndex] = useState(0)
  const [lastResult, setLastResult] = useState<{
    tokenUsed: number
    rounds: number
    durationMs: number
    reportPath?: string
  } | null>(null)

  const threadRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const currentSessionIdRef = useRef(sessionId)
  useEffect(() => {
    currentSessionIdRef.current = sessionId
  }, [sessionId])

  // 加载：设置(始终授权/模型)、技能、会话文件
  useEffect(() => {
    let alive = true
    window.shy
      .getSettings()
      .then((s) => {
        if (!alive) return
        setAlwaysAuthorize(Boolean(s.autoApproveTools))
        setModel(s.model || '')
      })
      .catch(() => {})
    window.shy
      .listSkills()
      .then((list) => {
        if (alive) setSkills(list)
      })
      .catch(() => {})
    // minimax-feature-port：技能热重载 → 自动刷新（含 "/" 菜单数据源）
    const offSkillsChanged = window.shy.onEvent((payload) => {
      if ((payload as { type?: string }).type === 'skills_changed') {
        window.shy
          .listSkills()
          .then((list) => {
            if (alive) setSkills(list)
          })
          .catch(() => {})
      }
    })
    return () => {
      alive = false
      offSkillsChanged()
    }
  }, [])

  useEffect(() => {
    let alive = true
    window.shy
      .listSessionFiles(sessionId)
      .then((list) => {
        if (alive) setSessionFiles(list)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [sessionId])

  const hasConversation = messages.some((m) => m.role === 'user' || m.role === 'assistant')

  // 通知 App 是否已有对话，用于隐藏空态时的右侧环境面板
  useEffect(() => {
    onConversationState?.(hasConversation)
  }, [hasConversation, onConversationState])

  // 命令菜单：键入 `/` 触发，后续文本作为过滤查询
  const slashQuery = draft.startsWith('/') ? draft.slice(1).trim() : null
  const slashItems: SlashItem[] = useMemo(() => {
    if (slashQuery === null) return []
    const q = slashQuery.toLowerCase()
    const modeItems = MODE_ITEMS.filter(
      (m) =>
        !q || m.label.toLowerCase().includes(q) || (m.description ?? '').toLowerCase().includes(q)
    )
    const skillItems = skills
      .filter((s) => s.enabled !== false)
      .filter((s) => !q || `${s.name} ${s.description} ${s.id}`.toLowerCase().includes(q))
      .map((s) => ({
        key: s.id,
        label: s.name,
        description: s.rootKind && s.rootKind !== 'user' ? `[${s.rootKind}] ${s.description}` : s.description,
        type: 'skill' as const
      }))
    return [...modeItems, ...skillItems]
  }, [slashQuery, skills])

  // slash 打开时的高亮索引(列表变化时钳制到范围内,避免越界)
  const activeSlashIndex = slashItems.length ? Math.min(slashIndex, slashItems.length - 1) : 0

  const selectSlash = (item: SlashItem): void => {
    if (item.type === 'mode') {
      setMode(item.key as ModeKey)
      setDraft('')
    } else {
      setDraft(`使用技能 ${item.label}：`)
    }
    setSlashIndex(0)
  }

  const onToggleAlwaysAuthorize = async (): Promise<void> => {
    const next = !alwaysAuthorize
    try {
      const s = await window.shy.getSettings()
      await window.shy.setSettings({ ...s, autoApproveTools: next })
      setAlwaysAuthorize(next)
    } catch {
      /* ignore */
    }
  }

  const editFiles = useMemo(() => sessionFiles.filter((f) => f.op === 'write'), [sessionFiles])

  // 把连续的工具消息聚成一个时间轴块，其余消息独立渲染
  const renderBlocks = useMemo(() => {
    const blocks: Array<{ kind: 'msg'; msg: Msg } | { kind: 'timeline'; items: Msg[] }> = []
    let timeline: Msg[] = []
    const flush = (): void => {
      if (timeline.length) {
        blocks.push({ kind: 'timeline', items: timeline })
        timeline = []
      }
    }
    for (const m of messages) {
      if (m.role === 'user' || m.role === 'system') {
        flush()
        blocks.push({ kind: 'msg', msg: m })
      } else {
        timeline.push(m)
      }
    }
    flush()
    return blocks
  }, [messages])

  const composerInner = (): React.JSX.Element => (
    <div className="composer-shell">
      <textarea
        ref={composerRef}
        value={draft}
        onChange={(e) => {
          const v = e.target.value
          setDraft(v)
          if (v === '/') setSlashIndex(0)
        }}
        placeholder={
          mode === 'goal' ? '描述你的目标…' : '向 shy 提问，使用 / 选择命令或能力'
        }
        aria-label="消息输入"
        rows={1}
        onKeyDown={(e) => {
          if (slashQuery !== null) {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              if (slashItems.length) setSlashIndex((activeSlashIndex + 1) % slashItems.length)
              return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              if (slashItems.length)
                setSlashIndex((activeSlashIndex - 1 + slashItems.length) % slashItems.length)
              return
            }
            if (e.key === 'Enter') {
              e.preventDefault()
              const item = slashItems[activeSlashIndex]
              if (item) selectSlash(item)
              return
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              setDraft('')
              return
            }
            return
          }
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            void onSend()
          }
        }}
      />
      {slashQuery !== null ? (
        <SlashMenu
          open
          items={slashItems}
          activeIndex={activeSlashIndex}
          onSelect={selectSlash}
          onHover={setSlashIndex}
        />
      ) : null}
      <div className="composer-bar">
        <div className="composer-options">
          {shouldShowProjectPicker(boundProjectId) ? (
            <ProjectPicker
              value={boundProjectId ?? pendingProjectId}
              disabled={isProjectPickerLocked({
                hasUserMessages: messages.some((m) => m.role === 'user'),
                projectId: boundProjectId
              })}
              onChange={setPendingProjectId}
              onProjectsChanged={onSessionsChanged}
            />
          ) : null}
          <button
            type="button"
            className={`full-access${alwaysAuthorize ? ' on' : ''}`}
            onClick={() => void onToggleAlwaysAuthorize()}
            aria-pressed={alwaysAuthorize}
            title="完全访问：开启后工具不再逐条确认"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            完全访问
          </button>
          {model ? <span className="model-pill">{model}</span> : null}
        </div>
        <div className="composer-actions">
          {busy && !paused ? (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => void onPause()}>
                暂停
              </button>
              <button type="button" className="btn btn-danger" onClick={() => void onCancel()}>
                停止
              </button>
            </>
          ) : null}
          {paused ? (
            <button type="button" className="btn btn-primary" onClick={() => void onResume()}>
              继续
            </button>
          ) : null}
          {!busy && !paused ? (
            <button
              type="button"
              className="composer-send"
              onClick={() => void onSend()}
              disabled={!draft.trim()}
              aria-label="发送"
              title="发送（回车）"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 19V5M6 11l6-6 6 6" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )

  useLayoutEffect(() => {
    currentSessionIdRef.current = sessionId
    setPendingProjectId(null)
    setBoundProjectId(null)
    let alive = true
    window.shy.getSession(sessionId).then((detail) => {
      if (!alive || currentSessionIdRef.current !== sessionId || !detail) return
      setMode(detail.mode)
      setPaused(detail.paused)
      setBusy(detail.runStatus === 'running')
      setBoundProjectId(resolveBoundProjectId(detail.projectId))
      setStatus('')
      setLastResult(null)
      setMessages(
        detail.messages.length
          ? detail.messages.map((m) => ({
              role: m.role,
              content: m.content,
              createdAt: m.createdAt,
              kind: m.kind,
              streaming: false,
              toolStatus: m.role === 'tool' ? ('done' as const) : undefined
            }))
          : []
      )
    })
    return () => {
      alive = false
    }
  }, [sessionId])

  useLayoutEffect(() => {
    stickToBottomRef.current = true
  }, [sessionId])

  useLayoutEffect(() => {
    const el = threadRef.current
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  const onThreadScroll = (): void => {
    const el = threadRef.current
    if (!el) return
    stickToBottomRef.current = isNearBottom(el)
  }

  useEffect(() => {
    return window.shy.onEvent((payload) => {
      const ev = payload as {
        sessionId?: string
        type?: string
        content?: string
        message?: string
        name?: string
        detail?: unknown
        reason?: string
        reportPath?: string
        rounds?: number
        tokenUsed?: number
        durationMs?: number
        id?: string
        input?: unknown
        output?: unknown
        error?: string
        requestId?: string
        question?: string
        options?: string[]
      }
      if (ev.sessionId && ev.sessionId !== sessionId) return
      if (ev.type === 'result' && ev.content) {
        setMessages((prev) => [
          ...prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
          {
            role: 'assistant',
            content: ev.content!,
            createdAt: new Date().toISOString(),
            kind: 'result'
          }
        ])
      } else if (ev.type === 'reasoning_delta' && ev.content) {
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last && last.role === 'reasoning' && last.streaming) {
            return [
              ...prev.slice(0, -1),
              { ...last, content: last.content + ev.content!, streaming: true }
            ]
          }
          return [
            ...prev,
            {
              role: 'reasoning',
              content: ev.content!,
              createdAt: new Date().toISOString(),
              streaming: true,
              reasoningStartedAt: Date.now()
            }
          ]
        })
      } else if (ev.type === 'reasoning_done') {
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last && last.role === 'reasoning') {
            const started = last.reasoningStartedAt ?? Date.now()
            return [
              ...prev.slice(0, -1),
              {
                ...last,
                streaming: false,
                durationMs: Math.max(0, Date.now() - started)
              }
            ]
          }
          return prev
        })
      } else if (ev.type === 'assistant_delta' && ev.content) {
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last && last.role === 'assistant' && !last.kind) {
            return [
              ...prev.slice(0, -1),
              { ...last, content: last.content + ev.content!, streaming: true }
            ]
          }
          return [
            ...prev,
            {
              role: 'assistant',
              content: ev.content!,
              createdAt: new Date().toISOString(),
              streaming: true
            }
          ]
        })
      } else if (ev.type === 'assistant' && ev.content) {
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last && last.role === 'assistant' && !last.kind) {
            return [...prev.slice(0, -1), { ...last, content: ev.content!, streaming: false }]
          }
          return [
            ...prev,
            {
              role: 'assistant',
              content: ev.content!,
              createdAt: new Date().toISOString(),
              streaming: false
            }
          ]
        })
      } else if (ev.type === 'assistant_done') {
        // 流式渲染完毕：停掉打字光标
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last && last.streaming) return [...prev.slice(0, -1), { ...last, streaming: false }]
          return prev
        })
      } else if (ev.type === 'tool_call' && ev.id) {
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.role === 'tool' && m.toolId === ev.id)
          if (idx >= 0) {
            const next = [...prev]
            next[idx] = {
              ...next[idx],
              toolName: ev.name ?? next[idx].toolName,
              toolInput: ev.input,
              toolStatus: 'running' as const
            }
            return next
          }
          return [
            ...prev,
            {
              role: 'tool',
              content: '',
              createdAt: new Date().toISOString(),
              toolId: ev.id,
              toolName: ev.name ?? 'tool',
              toolInput: ev.input,
              toolStatus: 'running' as const
            }
          ]
        })
      } else if (ev.type === 'tool_result' && ev.id) {
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.role === 'tool' && m.toolId === ev.id)
          if (idx >= 0) {
            const next = [...prev]
            next[idx] = {
              ...next[idx],
              toolResult: ev.output,
              toolError: ev.error,
              toolStatus: ev.error ? ('failed' as const) : ('done' as const)
            }
            return next
          }
          return [
            ...prev,
            {
              role: 'tool',
              content: '',
              createdAt: new Date().toISOString(),
              toolId: ev.id,
              toolName: String(ev.id),
              toolResult: ev.output,
              toolError: ev.error,
              toolStatus: ev.error ? ('failed' as const) : ('done' as const)
            }
          ]
        })
      } else if (ev.type === 'ask_user' && ev.requestId) {
        setMessages((prev) => {
          const next = [...prev]
          for (let i = next.length - 1; i >= 0; i--) {
            const m = next[i]
            if (m.role === 'tool' && m.toolName === 'ask_user' && m.toolStatus === 'running') {
              const prevInput =
                m.toolInput && typeof m.toolInput === 'object' && !Array.isArray(m.toolInput)
                  ? (m.toolInput as Record<string, unknown>)
                  : {}
              next[i] = {
                ...m,
                toolInput: {
                  ...prevInput,
                  question: ev.question ?? prevInput.question,
                  options: ev.options ?? prevInput.options,
                  requestId: ev.requestId
                }
              }
              return next
            }
          }
          return prev
        })
      } else if (ev.type === 'tool') {
        setMessages((prev) => [
          ...prev,
          {
            role: 'tool',
            content:
              typeof ev.detail === 'string' ? ev.detail : JSON.stringify(ev.detail ?? {}, null, 2),
            toolName: ev.name,
            toolInput: (ev as { input?: unknown }).input,
            createdAt: new Date().toISOString(),
            toolStatus: 'running' as const
          }
        ])
      } else if (ev.type === 'status' && ev.message) {
        setStatus(ev.message)
        if (ev.message.includes('暂停')) setPaused(true)
      } else if (ev.type === 'error' && ev.message) {
        setMessages((prev) => [
          ...prev,
          { role: 'system', content: `错误：${ev.message}`, createdAt: new Date().toISOString() }
        ])
      } else if (ev.type === 'done') {
        setBusy(false)
        setMessages((prev) =>
          prev.map((m) => (m.role === 'assistant' ? { ...m, streaming: false } : m))
        )
        if (ev.reason === 'paused') {
          setPaused(true)
          setStatus('已暂停')
        } else {
          setPaused(false)
          setStatus(ev.reason === 'cancelled' ? '已取消' : '')
        }
        onSessionsChanged?.()
      } else if (ev.type === 'notify' && ev.message) {
        setMessages((prev) => [
          ...prev,
          { role: 'system', content: ev.message!, createdAt: new Date().toISOString() }
        ])
      } else if (ev.type === 'blocked') {
        const rounds = Number(ev.rounds ?? 0)
        setMessages((prev) => [
          ...prev,
          {
            role: 'system',
            content: `目标已阻塞：连续 ${rounds} 轮相同阻塞条件（${ev.reason ?? '未指定原因'}）。请检查或调整目标后继续。`,
            createdAt: new Date().toISOString()
          }
        ])
        setBusy(false)
        setPaused(true)
        setStatus('已阻塞')
      } else if (ev.type === 'goal_complete') {
        const tokenUsed = Number(ev.tokenUsed ?? 0)
        const rounds = Number(ev.rounds ?? 0)
        const durationMs = Number(ev.durationMs ?? 0)
        const durationMin = (durationMs / 60_000).toFixed(1)
        setLastResult({ tokenUsed, rounds, durationMs, reportPath: ev.reportPath })
        setMessages((prev) => [
          ...prev,
          {
            role: 'system',
            content: `✓ 目标完成 · ${tokenUsed.toLocaleString()} tokens · ${rounds} 轮 · ${durationMin} 分钟`,
            createdAt: new Date().toISOString()
          }
        ])
      }
    })
  }, [sessionId, onSessionsChanged])

  const focusComposer = useCallback(() => {
    composerRef.current?.focus()
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
      if (e.key === '/' && !typing) {
        e.preventDefault()
        focusComposer()
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !typing) {
        e.preventDefault()
        focusComposer()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focusComposer])

  useEffect(() => {
    const el = composerRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [draft])

  const onSend = async (): Promise<void> => {
    const text = draft.trim()
    if (!text || busy || !sessionId) return
    const detail = await window.shy.getSession(sessionId)
    const hasUser = detail?.messages.some((m) => m.role === 'user') ?? false
    const boundId = resolveBoundProjectId(detail?.projectId)
    if (
      shouldBindOnSend({
        hasUserMessages: hasUser,
        boundProjectId: boundId,
        pendingProjectId
      })
    ) {
      const r = await window.shy.bindSessionProject({
        sessionId,
        projectId: pendingProjectId as string
      })
      if (!r.ok) {
        setStatus(BIND_ERROR_LABEL[r.error])
        return
      }
      setBoundProjectId(pendingProjectId)
      onSessionsChanged?.()
    }
    setDraft('')
    stickToBottomRef.current = true
    setBusy(true)
    setPaused(false)
    setStatus(mode === 'goal' ? '目标推进中' : '思考中')
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text, createdAt: new Date().toISOString() }
    ])
    await window.shy.chat({
      sessionId,
      message: text,
      mode
    })
    onSessionsChanged?.()
  }

  const onCancel = async (): Promise<void> => {
    await window.shy.cancel(sessionId)
    setBusy(false)
    setPaused(false)
    setStatus('正在取消…')
  }

  const onPause = async (): Promise<void> => {
    await window.shy.pause(sessionId)
    setPaused(true)
    setStatus('已请求暂停…')
  }

  const onResume = async (): Promise<void> => {
    setBusy(true)
    setPaused(false)
    setStatus('恢复中…')
    await window.shy.resume(sessionId)
  }

  const runningCls = chatStatusTone({ busy, paused, status })
  let runningText = ''
  if (busy) {
    runningText = status || '思考中…'
  } else if (paused) {
    runningText = status || '已暂停'
  } else {
    runningText = status
  }

  const sessionTitle =
    sessions.find((s) => s.id === sessionId)?.title?.trim() || '未命名会话'

  return (
    <div className="main chat-column">
      <div className="topbar">
        <div className="topbar-title" title={sessionTitle}>
          {sessionTitle}
        </div>
        <div className="top-actions">
          {showCodeLayoutToggle ? (
            <button
              type="button"
              className="layout-switch-btn"
              title={codeLayout === 'ide' ? '切换为普通布局' : '切换为代码布局'}
              onClick={() => onCodeLayoutChange?.(codeLayout === 'ide' ? 'chat' : 'ide')}
            >
              {codeLayout === 'ide' ? '普通布局' : '代码布局'}
            </button>
          ) : null}
          {runningCls ? (
            <div className={`status ${runningCls}`}>
              <span className="status-dot" aria-hidden="true" />
              {runningText}
            </div>
          ) : null}
        </div>
      </div>

      <div className="chat-body">
        <div className="workspace">
          <div className="workspace-inner">
            {notice ? <div className="banner">{notice}</div> : null}

            <div className="thread" ref={threadRef} onScroll={onThreadScroll}>
              {!hasConversation ? (
                <div className="empty-state">
                  <h1 className="empty-title">{greetingForHour(new Date().getHours())}</h1>
                  <div className="empty-composer">{composerInner()}</div>
                  <div className="example-list">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        className="example-item"
                        onClick={() => {
                          setDraft(s.text)
                          focusComposer()
                        }}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M4 12h10M9 7l5 5-5 5M15 5v14" />
                        </svg>
                        <span>{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {renderBlocks.map((block, bi) => {
                    if (block.kind === 'timeline') {
                      const streaming = block.items.some((t) => t.streaming)
                      return (
                        <div key={bi} className="msg msg-assistant">
                          <div className="msg-head">
                            <span className="msg-avatar" aria-hidden="true">
                              s
                            </span>
                            <span className="msg-name">shy</span>
                          </div>
                          <AgentTimeline
                            segments={messagesToSegments(block.items)}
                            streaming={streaming}
                          />
                          {streaming ? (
                            <span className="stream-cursor" aria-hidden="true" />
                          ) : null}
                        </div>
                      )
                    }
                    const m = block.msg
                    return (
                      <div key={bi} className={`msg msg-${m.role}`}>
                        {m.role === 'user' ? (
                          <div className="msg-bubble">
                            <MarkdownBody content={m.content} />
                          </div>
                        ) : null}
                        {m.role === 'system' ? <div className="msg-pill">{m.content}</div> : null}
                      </div>
                    )
                  })}
                  {editFiles.length > 0 || lastResult ? (
                    <div className="product-files">
                      <div className="product-files-head">
                        <span className="product-files-icon" aria-hidden="true">
                          <svg viewBox="0 0 24 24">
                            <path d="M4 7h5l1.5 2H20v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
                          </svg>
                        </span>
                        <span>
                          {lastResult ? '✓ 任务完成' : '已编辑'} {editFiles.length} 个文件
                        </span>
                      </div>
                      {lastResult ? (
                        <div className="product-files-meta">
                          {lastResult.rounds} 轮 · {(lastResult.durationMs / 60000).toFixed(1)} 分钟
                          · {lastResult.tokenUsed.toLocaleString()} tokens
                        </div>
                      ) : null}
                      {editFiles.length > 0 ? (
                        <ul className="product-files-list">
                          {editFiles.map((f) => (
                            <li key={`${f.id}-${f.path}`} className="product-file">
                              {f.path}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </>
              )}
            </div>

            {hasConversation ? (
              <>
                <div className="composer-dock">{composerInner()}</div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
