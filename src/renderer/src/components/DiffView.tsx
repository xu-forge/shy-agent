/**
 * DiffView — 会话文件改动 diff 列表 + 展开着色渲染（inspector-func-panel）。
 *
 * - 列表：文件名 + +/- 徽标 + 时间，点按展开
 * - 展开行：highlight.js 按扩展名高亮代码，+ 绿 / - 红 / hunk 头灰
 * - diff 计算由 main 侧 jsdiff 完成，这里只解析 unified 文本渲染
 */
import { useEffect, useMemo, useState } from 'react'
import type { SessionDiffRecord } from '../../../shared/ipc'
import { parseUnifiedDiffLines } from '../lib/unified-diff'
// common 子集（~35 种常用语言），静态 import 走 Vite 打包
import hljs from 'highlight.js/lib/common'
import 'highlight.js/styles/github.css'

const EXT_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  css: 'css',
  scss: 'scss',
  html: 'xml',
  xml: 'xml',
  svg: 'xml',
  md: 'markdown',
  py: 'python',
  sh: 'bash',
  zsh: 'bash',
  go: 'go',
  rs: 'rust',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cs: 'csharp',
  rb: 'ruby',
  php: 'php',
  sql: 'sql',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini'
}

function langOf(path: string): string | undefined {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return EXT_LANG[ext]
}

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

export function DiffView({ sessionId }: { sessionId: string }): React.JSX.Element {
  const [diffs, setDiffs] = useState<SessionDiffRecord[]>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    const load = (): void => {
      window.shy
        .listSessionDiffs(sessionId)
        .then((rows) => {
          if (alive) setDiffs(rows)
        })
        .catch(() => {})
    }
    load()
    const t = setInterval(load, 5000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [sessionId])

  if (diffs.length === 0) {
    return (
      <div className="inspector-empty">
        <div className="inspector-empty-title">还没有文件改动</div>
        <div className="inspector-empty-hint">Agent 修改文件后会在这里显示 diff</div>
      </div>
    )
  }

  return (
    <ul className="diff-list">
      {diffs.map((d) => (
        <li key={d.id} className="diff-item">
          <button
            type="button"
            className="diff-item-head"
            onClick={() => setExpandedId((cur) => (cur === d.id ? null : d.id))}
            aria-expanded={expandedId === d.id}
            title={d.path}
          >
            <span className="file-op">{d.op === 'delete' ? '删' : '改'}</span>
            <span className="diff-item-name">{basename(d.path)}</span>
            <span className="diff-item-counts">
              <span className="diff-add">+{d.added}</span>
              <span className="diff-del">−{d.removed}</span>
            </span>
          </button>
          {expandedId === d.id ? (
            <DiffBody record={d} />
          ) : null}
        </li>
      ))}
    </ul>
  )
}

function DiffBody({ record }: { record: SessionDiffRecord }): React.JSX.Element {
  const lang = langOf(record.path)
  const hunks = useMemo(() => parseUnifiedDiffLines(record.diffText), [record.diffText])
  return (
    <div className="diff-body">
      <div className="diff-path" title={record.path}>
        {record.path}
      </div>
      <pre className="diff-pre">
        {hunks.map((h, hi) => (
          <div key={hi}>
            <div className="diff-hunk">
              @@ -{h.oldStart},{h.oldLines} +{h.newStart},{h.newLines} @@
            </div>
            {h.lines.map((l, li) => (
              <div key={li} className={`diff-line diff-line-${l.mark === '+' ? 'add' : l.mark === '-' ? 'del' : 'ctx'}`}>
                <span className="diff-mark">{l.mark}</span>
                <code
                  className="diff-code"
                  dangerouslySetInnerHTML={{
                    __html: hljsSafe(l.text, lang)
                  }}
                />
              </div>
            ))}
          </div>
        ))}
      </pre>
    </div>
  )
}

/** highlight.js 高亮单行；失败回退纯文本转义 */
function hljsSafe(text: string, lang?: string): string {
  const escape = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  if (!text.trim()) return escape(text)
  try {
    const res = lang
      ? hljs.highlight(text, { language: lang, ignoreIllegals: true })
      : hljs.highlightAuto(text)
    return res.value
  } catch {
    return escape(text)
  }
}
