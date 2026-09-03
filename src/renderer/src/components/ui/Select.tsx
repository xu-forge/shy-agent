import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export type SelectOption = { value: string; label: string; disabled?: boolean }

type Props = {
  value: string
  options: ReadonlyArray<SelectOption>
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel?: string
  disabled?: boolean
  className?: string
  /** 弹层最大可见行数，默认 8 */
  maxVisible?: number
}

/**
 * 自绘 Select — 替代原生 <select>。
 *
 * - 弹层 position:fixed，按触发器 rect 定位，下方放不下时向上翻
 * - 键盘：↑/↓ 移动高亮，Enter/Space 选中，Esc/Tab 关闭，Home/End 跳首尾
 * - 外点 / 窗口缩放 / 外部滚动时关闭（菜单自身滚动不关）
 */
export function Select({
  value,
  options,
  onChange,
  placeholder = '请选择…',
  ariaLabel,
  disabled,
  className,
  maxVisible = 8
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [menuRect, setMenuRect] = useState<{ left: number; top: number; width: number } | null>(null)
  const [highlight, setHighlight] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const enabled = options.filter((o) => !o.disabled)
  const selected = options.find((o) => o.value === value)

  const positionMenu = (): void => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const estHeight = Math.min(options.length, maxVisible) * 34 + 8
    const flip = r.bottom + estHeight > window.innerHeight && r.top - estHeight > 8
    setMenuRect({
      left: r.left,
      width: r.width,
      top: flip ? r.top - estHeight - 6 : r.bottom + 6
    })
  }

  useLayoutEffect(() => {
    if (open) positionMenu()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const idx = Math.max(
      0,
      enabled.findIndex((o) => o.value === value)
    )
    setHighlight(idx)

    const onDocMouseDown = (e: MouseEvent): void => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !listRef.current?.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    // capture 能收到任意元素的 scroll；菜单自身滚动 / 打开时 scrollIntoView 不能关
    const onScroll = (e: Event): void => {
      const t = e.target
      if (t instanceof Node && listRef.current?.contains(t)) return
      setOpen(false)
    }
    const onResize = (): void => setOpen(false)
    document.addEventListener('mousedown', onDocMouseDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value])

  // 高亮项滚动进可视区
  useEffect(() => {
    if (!open) return
    const item = listRef.current?.querySelector<HTMLElement>(`[data-idx="${highlight}"]`)
    item?.scrollIntoView({ block: 'nearest' })
  }, [highlight, open])

  const commit = (v: string): void => {
    onChange(v)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (disabled) return
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlight((h) => Math.min(enabled.length - 1, h + 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlight((h) => Math.max(0, h - 1))
        break
      case 'Home':
        e.preventDefault()
        setHighlight(0)
        break
      case 'End':
        e.preventDefault()
        setHighlight(enabled.length - 1)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (enabled[highlight]) commit(enabled[highlight]!.value)
        break
      case 'Escape':
        // 只关下拉，不冒泡到 Modal/抽屉的 Esc 处理
        e.stopPropagation()
        setOpen(false)
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  return (
    <div className={`ui-select${className ? ` ${className}` : ''}${open ? ' open' : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className="ui-select-trigger"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen((o) => !o)
        }}
        onKeyDown={onKeyDown}
      >
        <span className={`ui-select-value${selected ? '' : ' placeholder'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <svg className="ui-select-caret" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 6.5 8 10.5 12 6.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && menuRect ? (
        <div
          ref={listRef}
          className="ui-select-menu"
          style={{ left: menuRect.left, top: menuRect.top, minWidth: menuRect.width }}
          role="listbox"
        >
          {options.map((o) => {
            const idx = enabled.indexOf(o)
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                data-idx={idx >= 0 ? idx : undefined}
                className={`ui-select-option${o.value === value ? ' selected' : ''}${idx === highlight ? ' highlight' : ''}`}
                disabled={o.disabled}
                onMouseEnter={() => idx >= 0 && setHighlight(idx)}
                onClick={() => !o.disabled && commit(o.value)}
              >
                <span className="ui-select-option-label">{o.label}</span>
                <svg
                  className="ui-select-check"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                  style={{ opacity: o.value === value ? 1 : 0 }}
                >
                  <path d="M3.5 8.5 6.5 11.5 12.5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
