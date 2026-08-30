import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { EditorContent } from '@tiptap/react'
import type { ModeKey } from './ModeToggle'
import type {
  ActiveView,
  MaterialItem,
  SessionFileRecord,
  SessionSummary,
  SkillSummary
} from '../../../shared/ipc'
import { MarkdownBody } from './MarkdownBody'
import { AgentTimeline } from './chat/AgentTimeline'
import { messagesToSegments } from './chat/turnSegments'
import { SlashMenu, type SlashItem } from './chat/SlashMenu'
import { serializeComposerText } from './chat/composerMention'
import { useComposerEditor } from './chat/ComposerEditor'
import type { MentionMenuState, MentionSuggestionItem } from './chat/composerMention'
import type { Editor } from '@tiptap/react'
import type { SuggestionProps } from '@tiptap/suggestion'

type SuggestionBridgeProps = SuggestionProps<MentionSuggestionItem>
import { ProjectPicker } from './ProjectPicker'
import {
  BIND_ERROR_LABEL,
  chatStatusTone,
  isProjectPickerLocked,
  resolveBoundProjectId,
  shouldBindOnSend,
  shouldShowProjectPicker
} from '../lib/projectBind'
import { artifactDisplayPath } from '../lib/artifactTree'
import { artifactFilesForTurns, isTurnEndBlock } from '../lib/turnArtifacts'
import type { CodeLayout } from '../lib/shellLayout'
import { isNearBottom } from '../lib/scrollStick'
import { useDynamicVirtualList } from '../lib/dynamicVirtualList'
import { toggleDockMode, type DockMode } from '../lib/dockMode'
import { chatPayload } from '../lib/activeView'
import { RightDockIcon } from './RightDockIcon'
import { OpenWithMenu } from './dock/OpenWithMenu'
import { FolderIcon, GlobeIcon } from './dock/DockIcons'

type Props = {
  notice?: string
  sessionId: string
  sessions?: SessionSummary[]
  onSessionsChanged?: () => void
  onConversationState?: (has: boolean) => void
  showCodeLayoutToggle?: boolean
  codeLayout?: CodeLayout
  onCodeLayoutChange?: (next: CodeLayout) => void
  showDockToggle?: boolean
  dockMode?: DockMode
  onDockModeChange?: (mode: DockMode) => void
  activeView?: ActiveView
}

type Msg = {
  id?: string
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

function toMsg(m: {
  id: string
  role: Msg['role']
  content: string
  createdAt: string
  kind?: 'result'
}): Msg {
  return { id: m.id, role: m.role, content: m.content, createdAt: m.createdAt, kind: m.kind, streaming: false, toolStatus: m.role === 'tool' ? 'done' : undefined }
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

function ProductFilesCard({
  files,
  lastResult
}: {
  files: SessionFileRecord[]
  lastResult: { tokenUsed: number; rounds: number; durationMs: number } | null
}): React.JSX.Element | null {
  if (files.length === 0 && !lastResult) return null
  return (
    <div className="product-files">
      <div className="product-files-head">
        <span className="product-files-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M4 7h5l1.5 2H20v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
          </svg>
        </span>
        <span>
          {lastResult ? '✓ 任务完成' : '已编辑'} {files.length} 个文件
        </span>
      </div>
      {lastResult ? (
        <div className="product-files-meta">
          {lastResult.rounds} 轮 · {(lastResult.durationMs / 60000).toFixed(1)} 分钟 ·{' '}
          {lastResult.tokenUsed.toLocaleString()} tokens
        </div>
      ) : null}
      {files.length > 0 ? (
        <ul className="product-files-list">
          {files.map((f) => (
            <li key={f.path} className="product-file" title={f.path}>
              {artifactDisplayPath('', f.path)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function ChatWorkspace({
  notice,
  sessionId,
  sessions = [],
  onSessionsChanged,
  onConversationState,
  showCodeLayoutToggle = false,
  codeLayout = 'ide',
  onCodeLayoutChange,
  showDockToggle = false,
  dockMode = null,
  onDockModeChange,
  activeView
}: Props): React.JSX.Element {
  const [mode, setMode] = useState<ModeKey>('interactive')
  const [busy, setBusy] = useState(false)
  const [paused, setPaused] = useState(false)
  const [status, setStatus] = useState('')
  const [messages, setMessages] = useState<Msg[]>([])
  const [streamingTurn, setStreamingTurn] = useState<Msg[]>([])
  const [hasMoreHistory, setHasMoreHistory] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null)
  const [boundProjectId, setBoundProjectId] = useState<string | null>(null)
  const [skills, setSkills] = useState<SkillSummary[]>([])
  const [model, setModel] = useState('')
  const [alwaysAuthorize, setAlwaysAuthorize] = useState(false)
  const [sessionFiles, setSessionFiles] = useState<SessionFileRecord[]>([])
  const [slashIndex, setSlashIndex] = useState(0)
  const [slashQuery, setSlashQuery] = useState<string | null>(null)
  const [canSend, setCanSend] = useState(false)
  const [mentionMaterials, setMentionMaterials] = useState<MaterialItem[]>([])
  const [mentionIndex, setMentionIndex] = useState(0)
  const [mentionMenu, setMentionMenu] = useState<MentionMenuState>({ open: false, items: [] })
  const [lastResult, setLastResult] = useState<{
    tokenUsed: number
    rounds: number
    durationMs: number
    reportPath?: string
    at: number
  } | null>(null)

  const threadRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const currentSessionIdRef = useRef(sessionId)
  const historyCursorRef = useRef<{ beforeCreatedAt: string; beforeId: string } | null>(null)
  const streamingTurnRef = useRef<Msg[]>([])
  const pendingDeltaRef = useRef<{ role: 'assistant' | 'reasoning'; content: string } | null>(null)
  const deltaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    currentSessionIdRef.current = sessionId
  }, [sessionId])

  // tiptap 输入区：以 ref 桥接最新闭包，editor 只创建一次
  const materialsRef = useRef<MaterialItem[]>([])
  materialsRef.current = mentionMaterials
  const placeholderRef = useRef('')
  placeholderRef.current =
    mode === 'goal' ? '描述你的目标…' : '向 shy 提问，使用 / 选择命令，@ 引用素材'
  const keydownRef = useRef<(event: KeyboardEvent) => boolean>(() => false)
  const onUpdateRef = useRef<(editor: Editor) => void>(() => {})
  const menuPropsRef = useRef<SuggestionBridgeProps | null>(null)
  const slashOpenRef = useRef(false)
  slashOpenRef.current = slashQuery !== null
  const mentionOpenRef = useRef(false)
  mentionOpenRef.current = mentionMenu.open && mentionMenu.items.length > 0
  const mentionMenuBridgeRef = useRef<{
    setMenu: (state: { open: boolean; items: MentionSuggestionItem[] }) => void
    keyHandler: (event: KeyboardEvent) => boolean
  } | null>(null)

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

  const refreshSessionFiles = useCallback((): void => {
    const sid = sessionId
    void window.shy
      .listSessionFiles(sid)
      .then((list) => {
        if (currentSessionIdRef.current === sid) setSessionFiles(list)
      })
      .catch(() => {})
  }, [sessionId])

  const allMessages = useMemo(() => [...messages, ...streamingTurn], [messages, streamingTurn])
  const hasConversation = allMessages.some((m) => m.role === 'user' || m.role === 'assistant')

  // 通知 App 是否已有对话，用于隐藏空态时的右侧环境面板
  useEffect(() => {
    onConversationState?.(hasConversation)
  }, [hasConversation, onConversationState])

  // 命令菜单：编辑器文本以 `/` 开头时触发（slashQuery 由 onUpdate 派生为 state）
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
        description:
          s.rootKind && s.rootKind !== 'user' ? `[${s.rootKind}] ${s.description}` : s.description,
        type: 'skill' as const
      }))
    return [...modeItems, ...skillItems]
  }, [slashQuery, skills])

  // slash 打开时的高亮索引(列表变化时钳制到范围内,避免越界)
  const activeSlashIndex = slashItems.length ? Math.min(slashIndex, slashItems.length - 1) : 0

  // @ 素材引用：tiptap Mention suggestion 弹出菜单；仅绑定了素材项目时提供数据
  const mentionProjectId = boundProjectId ?? pendingProjectId
  const mentionOpen = mentionMenu.open && mentionMenu.items.length > 0

  useEffect(() => {
    // 菜单打开时拉取，避免导入新素材后列表过期；未绑定素材项目则清空数据源
    if (!mentionProjectId) {
      setMentionMaterials([])
      return
    }
    let alive = true
    void window.shy
      .listProjects()
      .then((projects) => {
        const p = projects.find((x) => x.id === mentionProjectId)
        if (p?.type !== 'material') return []
        return window.shy.projectMaterialsList(mentionProjectId).then((r) => (r.ok ? r.items : []))
      })
      .then((items) => {
        if (alive) setMentionMaterials(items ?? [])
      })
      .catch(() => {
        if (alive) setMentionMaterials([])
      })
    return () => {
      alive = false
    }
  }, [mentionOpen, mentionProjectId])

  const mentionItems: SlashItem[] = mentionMenu.items.map((i) => ({
    key: i.id,
    label: i.label,
    description: i.path,
    type: 'material' as const
  }))

  const activeMentionIndex = mentionItems.length
    ? Math.min(mentionIndex, mentionItems.length - 1)
    : 0

  const selectMention = (item: SlashItem): void => {
    const suggestion = mentionMenu.items.find((i) => i.id === item.key)
    const bridge = menuPropsRef.current
    if (!suggestion || !bridge) return
    // v3 的 props.command(props) 会把入参整体作为 mention attrs（editor/range 由内部提供）
    bridge.command(suggestion)
    bridge.editor.commands.focus()
    setMentionIndex(0)
  }

  const selectSlash = (item: SlashItem): void => {
    if (item.type === 'mode') {
      setMode(item.key as ModeKey)
      editor?.commands.clearContent()
      editor?.commands.focus()
    } else {
      editor?.commands.setContent(`<p>使用技能 ${item.label}：</p>`)
      editor?.commands.focus('end')
    }
    setSlashIndex(0)
  }

  const editor = useComposerEditor({
    keydownRef,
    materialsRef,
    placeholderRef,
    onUpdateRef,
    menuPropsRef,
    mentionMenuRef: mentionMenuBridgeRef
  })

  // 键盘桥：@ 菜单打开时全部交给 suggestion 键控（Enter=选中素材）；
  // slash 菜单键控 + Enter 发送
  keydownRef.current = (event: KeyboardEvent): boolean => {
    if (mentionOpenRef.current) return false
    if (slashOpenRef.current) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        if (slashItems.length) setSlashIndex((activeSlashIndex + 1) % slashItems.length)
        return true
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        if (slashItems.length)
          setSlashIndex((activeSlashIndex - 1 + slashItems.length) % slashItems.length)
        return true
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        const item = slashItems[activeSlashIndex]
        if (item) selectSlash(item)
        return true
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        editor?.commands.clearContent()
        return true
      }
      return false
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      void onSend()
      return true
    }
    return false
  }

  // suggestion 的 onKeyDown 桥：mention 菜单 ↑/↓/Enter/Esc
  mentionMenuBridgeRef.current = {
    setMenu: (state) => {
      setMentionMenu((prev) =>
        prev.open === state.open && prev.items.length === state.items.length
          ? prev
          : { open: state.open, items: state.items }
      )
      if (state.open) setMentionIndex(0)
    },
    keyHandler: (event: KeyboardEvent): boolean => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        if (mentionItems.length) setMentionIndex((activeMentionIndex + 1) % mentionItems.length)
        return true
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        if (mentionItems.length)
          setMentionIndex((activeMentionIndex - 1 + mentionItems.length) % mentionItems.length)
        return true
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        const item = mentionItems[activeMentionIndex]
        if (item) selectMention(item)
        return true
      }
      if (event.key === 'Escape') {
        // 仅关闭菜单，保留已输入的 @token 文本
        menuPropsRef.current = null
        setMentionMenu({ open: false, items: [] })
        return true
      }
      return false
    }
  }

  // 内容更新：派生 slash 查询与可发送状态
  onUpdateRef.current = (ed: Editor): void => {
    const plain = serializeComposerText(ed)
    const q = plain.startsWith('/') ? plain.slice(1).trim() : null
    setSlashQuery((prev) => (prev === q ? prev : q))
    setCanSend(!ed.isEmpty)
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

  const filesByTurn = useMemo(
    () => artifactFilesForTurns([...messages, ...streamingTurn], sessionFiles),
    [messages, sessionFiles, streamingTurn]
  )

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
    for (const m of allMessages) {
      if (m.role === 'user' || m.role === 'system') {
        flush()
        blocks.push({ kind: 'msg', msg: m })
      } else {
        timeline.push(m)
      }
    }
    flush()
    return blocks
  }, [allMessages])

  const turnShape = useMemo(
    () =>
      renderBlocks.map((b) =>
        b.kind === 'timeline'
          ? ({ kind: 'timeline' } as const)
          : ({ kind: 'msg', role: b.msg.role } as const)
      ),
    [renderBlocks]
  )

  const virtual = useDynamicVirtualList(renderBlocks.length, scrollTop, viewportHeight)
  const segmentsCacheRef = useRef(new Map<string, ReturnType<typeof messagesToSegments>>())
  const segmentsFor = (items: Msg[]): ReturnType<typeof messagesToSegments> => {
    const key = items
      .map(
        (item) =>
          `${item.id ?? ''}:${item.content.length}:${item.content.slice(-24)}:${item.streaming ? '1' : '0'}`
      )
      .join('|')
    const cached = segmentsCacheRef.current.get(key)
    if (cached) return cached
    const next = messagesToSegments(items)
    segmentsCacheRef.current.set(key, next)
    if (segmentsCacheRef.current.size > 100) {
      const oldest = segmentsCacheRef.current.keys().next().value
      if (oldest) segmentsCacheRef.current.delete(oldest)
    }
    return next
  }
  useEffect(() => {
    const el = threadRef.current
    if (!el) return
    const update = (): void => setViewportHeight(el.clientHeight)
    update()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    observer?.observe(el)
    return () => observer?.disconnect()
  }, [])

  const composerInner = (): React.JSX.Element => (
    <div className="composer-shell">
      <div className="composer-inputline">
        <EditorContent editor={editor} />
      </div>
      {mentionOpen ? (
        <SlashMenu
          open
          items={mentionItems}
          activeIndex={activeMentionIndex}
          onSelect={selectMention}
          onHover={setMentionIndex}
        />
      ) : null}
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
              disabled={!canSend}
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
    historyCursorRef.current = null
    setMessages([])
    setStreamingTurn([])
    window.shy.getSessionSummary(sessionId).then((detail) => {
      if (!alive || currentSessionIdRef.current !== sessionId || !detail) return
      setMode(detail.mode)
      setPaused(detail.paused)
      setBusy(detail.runStatus === 'running')
      setBoundProjectId(resolveBoundProjectId(detail.projectId))
      setStatus('')
      setLastResult(null)
       void window.shy
         .getSessionMessagesPage({ sessionId, limit: 50 })
         .then((page) => {
           if (!alive || currentSessionIdRef.current !== sessionId) return
           historyCursorRef.current = page.nextCursor
           setHasMoreHistory(page.hasMore)
           setMessages(page.messages.map(toMsg))
         })
         .catch(() => setMessages([]))
    })
    return () => {
      alive = false
    }
  }, [sessionId])

  const loadOlderMessages = useCallback(async (): Promise<void> => {
    if (loadingHistory || !hasMoreHistory || !historyCursorRef.current) return
    const el = threadRef.current
    if (!el) return
    setLoadingHistory(true)
    const anchor = el.querySelector<HTMLElement>('[data-message-block]')
    const anchorId = anchor?.dataset.messageId
    const beforeTop = anchor?.getBoundingClientRect().top ?? 0
    const beforeHeight = el.scrollHeight
    try {
      const page = await window.shy.getSessionMessagesPage({
        sessionId,
        limit: 50,
        cursor: historyCursorRef.current
      })
      if (currentSessionIdRef.current !== sessionId) return
      historyCursorRef.current = page.nextCursor
      setHasMoreHistory(page.hasMore)
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id))
        return [...page.messages.map(toMsg).filter((m) => !m.id || !known.has(m.id)), ...prev]
      })
      requestAnimationFrame(() => {
        const nextAnchor = anchorId
          ? el.querySelector<HTMLElement>(`[data-message-id="${anchorId}"]`)
          : null
        if (nextAnchor) el.scrollTop += nextAnchor.getBoundingClientRect().top - beforeTop
        else el.scrollTop += el.scrollHeight - beforeHeight
      })
    } finally {
      if (currentSessionIdRef.current === sessionId) setLoadingHistory(false)
    }
  }, [hasMoreHistory, loadingHistory, sessionId])

  const flushStreaming = useCallback((): void => {
    const pending = pendingDeltaRef.current
    if (pending) {
      const current = streamingTurnRef.current
      const last = current.at(-1)
      const next = last?.role === pending.role
        ? [...current.slice(0, -1), { ...last, content: last.content + pending.content, streaming: true }]
        : [...current, { role: pending.role, content: pending.content, createdAt: new Date().toISOString(), streaming: true, ...(pending.role === 'reasoning' ? { reasoningStartedAt: Date.now() } : {}) }]
      streamingTurnRef.current = next
      setStreamingTurn(next)
      pendingDeltaRef.current = null
    }
    if (deltaTimerRef.current) clearTimeout(deltaTimerRef.current)
    deltaTimerRef.current = null
  }, [])

  const queueStreamingDelta = useCallback((role: 'assistant' | 'reasoning', content: string): void => {
    const pending = pendingDeltaRef.current
    pendingDeltaRef.current = { role, content: pending?.role === role ? pending.content + content : content }
    if (!deltaTimerRef.current) deltaTimerRef.current = setTimeout(flushStreaming, 50)
  }, [flushStreaming])

  const commitStreaming = useCallback((): void => {
    flushStreaming()
    const turn = streamingTurnRef.current
    if (turn.length) setMessages((prev) => [...prev, ...turn.map((m) => ({ ...m, streaming: false }))])
    streamingTurnRef.current = []
    setStreamingTurn([])
  }, [flushStreaming])

  useLayoutEffect(() => {
    stickToBottomRef.current = true
  }, [sessionId])

  useLayoutEffect(() => {
    const el = threadRef.current
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight
  }, [messages, busy, sessionFiles, lastResult])

  const onThreadScroll = (): void => {
    const el = threadRef.current
    if (!el) return
    stickToBottomRef.current = isNearBottom(el)
    setScrollTop(el.scrollTop)
    if (el.scrollTop < 120) void loadOlderMessages()
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
        flushStreaming()
        const streamed = streamingTurnRef.current
        streamingTurnRef.current = []
        setStreamingTurn([])
        setMessages((prev) => [
          ...prev,
          ...streamed.map((m) => ({ ...m, streaming: false })),
          {
            role: 'assistant',
            content: ev.content!,
            createdAt: new Date().toISOString(),
            kind: 'result'
          }
        ])
      } else if (ev.type === 'reasoning_delta' && ev.content) {
        queueStreamingDelta('reasoning', ev.content)
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
        queueStreamingDelta('assistant', ev.content)
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
        commitStreaming()
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
        commitStreaming()
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
        refreshSessionFiles()
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
        setLastResult({ tokenUsed, rounds, durationMs, reportPath: ev.reportPath, at: Date.now() })
        refreshSessionFiles()
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
  }, [sessionId, onSessionsChanged, refreshSessionFiles])

  // 全局快捷键：/ 或 Cmd/Ctrl+K 聚焦输入区
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (e.key === '/' && !typing) {
        e.preventDefault()
        editor?.commands.focus('end')
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !typing) {
        e.preventDefault()
        editor?.commands.focus('end')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editor])

  const onSend = async (): Promise<void> => {
    const text = serializeComposerText(editor).trim()
    if (!text || busy || !sessionId) return
    const detail = await window.shy.getSessionSummary(sessionId)
    const hasUser = messages.some((m) => m.role === 'user')
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
    editor.commands.clearContent()
    editor.commands.focus()
    stickToBottomRef.current = true
    setBusy(true)
    setPaused(false)
    setStatus(mode === 'goal' ? '目标推进中' : '思考中')
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text, createdAt: new Date().toISOString() }
    ])
    await window.shy.chat(chatPayload({ sessionId, message: text, mode }, activeView))
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

  const sessionTitle = sessions.find((s) => s.id === sessionId)?.title?.trim() || '未命名会话'

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
          {showDockToggle ? <OpenWithMenu sessionId={sessionId} /> : null}
          {showDockToggle && dockMode === null ? (
            <>
              <button
                type="button"
                className="inspector-dock-btn"
                title="内置浏览器"
                aria-label="内置浏览器"
                onClick={() => onDockModeChange?.(toggleDockMode(dockMode, 'browser'))}
              >
                <GlobeIcon />
              </button>
              <button
                type="button"
                className="inspector-dock-btn"
                title="文件目录"
                aria-label="文件目录"
                onClick={() => onDockModeChange?.(toggleDockMode(dockMode, 'files'))}
              >
                <FolderIcon />
              </button>
              <button
                type="button"
                className="inspector-dock-btn"
                title="任务详情"
                aria-label="任务详情"
                onClick={() => onDockModeChange?.(toggleDockMode(dockMode, 'tasks'))}
              >
                <RightDockIcon />
              </button>
            </>
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
                          editor?.commands.setContent(`<p>${s.text}</p>`)
                          editor?.commands.focus('end')
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
                  <div className="virtual-thread" style={{ height: virtual.totalHeight, position: 'relative' }}>
                    {(() => {
                    let userTurn = -1
                    return renderBlocks.slice(virtual.startIndex, virtual.endIndex).map((block, localIndex) => {
                      const bi = localIndex + virtual.startIndex
                      if (block.kind === 'msg' && block.msg.role === 'user') userTurn += 1
                      const turnEnd = isTurnEndBlock(turnShape, bi)
                      const group = turnEnd && userTurn >= 0 ? filesByTurn[userTurn] : undefined
                      const showResult = Boolean(
                        lastResult &&
                          group &&
                          lastResult.at >= group.startMs &&
                          lastResult.at < group.endMs
                      )
                      const filesCard = (
                        <ProductFilesCard
                          files={group?.files ?? []}
                          lastResult={showResult ? lastResult : null}
                        />
                      )
                      if (block.kind === 'timeline') {
                        const streaming = block.items.some((t) => t.streaming)
                        return (
                          <div
                            key={bi}
                            {...virtual.itemProps(bi)}
                            data-message-id={block.items[0]?.id ?? `block-${bi}`}
                          >
                            <div className="msg msg-assistant">
                              <div className="msg-head">
                                <span className="msg-avatar" aria-hidden="true">
                                  s
                                </span>
                                <span className="msg-name">shy</span>
                              </div>
                              <AgentTimeline
                                segments={segmentsFor(block.items)}
                                streaming={streaming}
                              />
                              {streaming ? (
                                <span className="stream-cursor" aria-hidden="true" />
                              ) : null}
                            </div>
                            {turnEnd ? filesCard : null}
                          </div>
                        )
                      }
                      const m = block.msg
                      return (
                        <div key={bi} {...virtual.itemProps(bi)} data-message-id={m.id ?? `block-${bi}`}>
                          <div className={`msg msg-${m.role}`}>
                            {m.role === 'user' ? (
                              <div className="msg-bubble">
                                <MarkdownBody content={m.content} />
                              </div>
                            ) : null}
                            {m.role === 'system' ? <div className="msg-pill">{m.content}</div> : null}
                          </div>
                          {turnEnd ? filesCard : null}
                        </div>
                      )
                    })
                    })()}
                  </div>
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
