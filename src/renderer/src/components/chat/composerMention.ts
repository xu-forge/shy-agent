import { Mention } from '@tiptap/extension-mention'
import type { Editor } from '@tiptap/react'
import type { MutableRefObject } from 'react'
import type { MaterialItem } from '../../../../shared/ipc'

export type MentionSuggestionItem = {
  id: string
  label: string
  path: string
}

export type MentionMenuState = {
  open: boolean
  items: MentionSuggestionItem[]
}

export type ComposerHandlers = {
  /** 每次渲染更新；返回 true 表示已消费 */
  keydownRef: MutableRefObject<(event: KeyboardEvent) => boolean>
  materialsRef: MutableRefObject<MaterialItem[]>
  placeholderRef: MutableRefObject<string>
  onUpdateRef: MutableRefObject<(editor: Editor) => void>
  /** suggestion 当前活动 props（含 command/range），供菜单选中执行 */
  menuPropsRef: MutableRefObject<import('@tiptap/suggestion').SuggestionProps<MentionSuggestionItem> | null>
  mentionMenuRef: MutableRefObject<{
    setMenu: (state: { open: boolean; items: MentionSuggestionItem[] }) => void
    keyHandler: (event: KeyboardEvent) => boolean
  } | null>
}

/** 扩展 Mention：补 path attr（序列化为 @相对路径），chip 为带 × 的原子节点 */
export const MaterialMention = Mention.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      path: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-path') ?? '',
        renderHTML: (attributes) => ({ 'data-path': String(attributes.path ?? '') })
      }
    }
  },
  addNodeView() {
    return ({ node, getPos }) => {
      const dom = document.createElement('span')
      dom.className = 'mention-chip'
      dom.setAttribute('data-type', 'mention')
      dom.setAttribute('data-path', String(node.attrs.path ?? ''))
      const label = document.createElement('span')
      label.className = 'mention-chip-name'
      label.textContent = `@${String(node.attrs.label ?? node.attrs.path ?? '')}`
      dom.appendChild(label)
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'mention-chip-x'
      remove.textContent = '×'
      remove.setAttribute('contenteditable', 'false')
      remove.setAttribute('aria-label', '移除引用')
      remove.addEventListener('mousedown', (e) => e.preventDefault())
      remove.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const pos = getPos()
        if (typeof pos !== 'number') return
        this.editor.view.dispatch(this.editor.state.tr.delete(pos, pos + node.nodeSize))
        this.editor.commands.focus()
      })
      dom.appendChild(remove)
      return { dom }
    }
  }
})

/** 序列化为发送文本：mention 原位展开为 @相对路径，段落间换行 */
export function serializeComposerText(editor: Editor): string {
  type JsonNode = {
    type?: string
    text?: string
    attrs?: Record<string, unknown>
    content?: JsonNode[]
  }
  const renderNode = (node: JsonNode): string => {
    if (node.type === 'text') return node.text ?? ''
    if (node.type === 'mention') return `@${String(node.attrs?.path ?? node.attrs?.label ?? '')}`
    return (node.content ?? []).map(renderNode).join('')
  }
  const json = editor.getJSON() as JsonNode
  return (json.content ?? []).map(renderNode).join('\n')
}
