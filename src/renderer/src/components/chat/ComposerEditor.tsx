import { Placeholder } from '@tiptap/extensions'
import { PluginKey } from '@tiptap/pm/state'
import { StarterKit } from '@tiptap/starter-kit'
import { useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import type { SuggestionProps } from '@tiptap/suggestion'
import { useRef } from 'react'
import { fileNameOf } from '../../lib/materialLibrary'
import {
  MaterialMention,
  type ComposerHandlers,
  type MentionSuggestionItem
} from './composerMention'

const mentionPluginKey = new PluginKey('material-mention')

export function useComposerEditor(h: ComposerHandlers): Editor {
  const placeholderFnRef = useRef<(props: { editor: Editor }) => string>(() => '')
  placeholderFnRef.current = () => h.placeholderRef.current

  return useEditor({
    immediatelyRender: true,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        codeBlock: false,
        horizontalRule: false,
        bold: false,
        italic: false,
        strike: false,
        code: false,
        link: false
      }),
      Placeholder.configure({
        placeholder: (props) => placeholderFnRef.current(props)
      }),
      MaterialMention.configure({
        HTMLAttributes: { class: 'mention-chip' },
        renderText: ({ node }) =>
          `@${String(node.attrs.path ?? node.attrs.label ?? '')}`,
        renderHTML: ({ node, options }) => [
          'span',
          {
            ...options.HTMLAttributes,
            'data-type': 'mention',
            'data-path': String(node.attrs.path ?? '')
          },
          `@${String(node.attrs.label ?? node.attrs.path ?? '')}`
        ],
        deleteTriggerWithBackspace: true,
        suggestion: {
          char: '@',
          pluginKey: mentionPluginKey,
          // @ 触发期间不套任何样式（默认类会撞上全局 .suggestion pill）
          decorationTag: 'span',
          decorationClass: 'mention-suggestion-query',
          decorationEmptyClass: 'mention-suggestion-query',
          items: ({ query }) => {
            const q = query.trim().toLowerCase()
            return h.materialsRef.current
              .filter(
                (m) =>
                  !q ||
                  m.relativePath.toLowerCase().includes(q) ||
                  fileNameOf(m).toLowerCase().includes(q)
              )
              .slice(0, 50)
              .map((m) => ({ id: m.id, label: fileNameOf(m), path: m.relativePath }))
          },
          render: () => ({
            onStart: (props: SuggestionProps<MentionSuggestionItem>) => {
              h.menuPropsRef.current = props
              h.mentionMenuRef.current?.setMenu({ open: true, items: props.items })
            },
            onUpdate: (props: SuggestionProps<MentionSuggestionItem>) => {
              h.menuPropsRef.current = props
              h.mentionMenuRef.current?.setMenu({ open: true, items: props.items })
            },
            onExit: () => {
              h.menuPropsRef.current = null
              h.mentionMenuRef.current?.setMenu({ open: false, items: [] })
            },
            onKeyDown: ({ event }) => h.mentionMenuRef.current?.keyHandler(event) ?? false
          })
        }
      })
    ],
    editorProps: {
      attributes: {
        class: 'composer-editor-area',
        'aria-label': '消息输入'
      },
      handleKeyDown: (_view, event) => h.keydownRef.current(event)
    },
    onUpdate: ({ editor }) => h.onUpdateRef.current?.(editor)
  })
}
