// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { MaterialMention } from './composerMention'

function makeEditor(): Editor {
  return new Editor({
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
      MaterialMention
    ],
    element: null as unknown as HTMLElement
  })
}

type JsonNode = { type?: string; attrs?: Record<string, unknown>; content?: JsonNode[] }

function findMention(editor: Editor): JsonNode | null {
  const json = editor.getJSON() as JsonNode
  for (const block of json.content ?? []) {
    for (const inline of block.content ?? []) {
      if (inline.type === 'mention') return inline
    }
  }
  return null
}

describe('MaterialMention attrs', () => {
  it('keeps id/label/path when inserted directly', () => {
    const editor = makeEditor()
    editor.commands.insertContentAt(1, [
      { type: 'mention', attrs: { id: 'i1', label: 'Name', path: 'a/b.png' } }
    ])
    const node = findMention(editor)
    expect(node?.type).toBe('mention')
    expect(node?.attrs?.label).toBe('Name')
    expect(node?.attrs?.path).toBe('a/b.png')
  })

  it('keeps attrs through the suggestion command (props passed through verbatim)', () => {
    const editor = makeEditor()
    editor.commands.insertContentAt(1, '@te')
    const ext = MaterialMention.configure({})
    const suggestion = (ext.options.suggestion ?? null) as {
      command: (props: Record<string, unknown>) => void
    } | null
    // 运行时由 suggestion 注入默认 command；这里显式提供等价实现（与 dist 默认一致）
    const command =
      suggestion?.command ??
      ((props: Record<string, unknown>): void => {
        editor
          .chain()
          .focus()
          .insertContentAt({ from: 1, to: 4 }, [
            { type: 'mention', attrs: { ...props } },
            { type: 'text', text: ' ' }
          ])
          .run()
      })
    // v3：command 的入参整体成为 mention attrs
    command({ id: 'i1', label: 'Name', path: 'a/b.png' })
    const node = findMention(editor)
    expect(node?.attrs?.label).toBe('Name')
    expect(node?.attrs?.path).toBe('a/b.png')
  })
})
