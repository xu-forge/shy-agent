/**
 * SlashMenu — 输入框键首键入 `/` 弹出的命令菜单。
 * 含「模式（交互式 / 目标）」与「相关技能」两类；技能项显示 name + description，
 * 键入 `/` 后的文本实时过滤两个区块。
 */
export type SlashItem = {
  key: string
  label: string
  description?: string
  type: 'mode' | 'skill'
}

type Props = {
  open: boolean
  items: SlashItem[]
  activeIndex: number
  onSelect: (item: SlashItem) => void
  onHover: (index: number) => void
}

export function SlashMenu({
  open,
  items,
  activeIndex,
  onSelect,
  onHover
}: Props): React.JSX.Element | null {
  if (!open) return null
  return (
    <div className="slash-menu" role="listbox" aria-label="命令菜单">
      {items.length === 0 ? (
        <div className="slash-empty">无匹配</div>
      ) : (
        items.map((item, i) => (
          <button
            key={item.key}
            type="button"
            role="option"
            aria-selected={i === activeIndex}
            className={`slash-item${i === activeIndex ? ' active' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(item)
            }}
            onMouseEnter={() => onHover(i)}
          >
            <span className={`slash-badge${item.type === 'mode' ? ' mode' : ''}`}>
              {item.type === 'mode' ? '模式' : '技能'}
            </span>
            <span className="slash-label">{item.label}</span>
            {item.description ? <span className="slash-desc">{item.description}</span> : null}
          </button>
        ))
      )}
    </div>
  )
}
