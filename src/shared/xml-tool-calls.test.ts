import { describe, expect, it } from 'vitest'
import { extractXmlToolCalls, stripXmlToolMarkup } from './xml-tool-calls'

describe('extractXmlToolCalls', () => {
  it('把正文里的 MiniMax XML 转成 tool_calls，并从 content 剔除', () => {
    const raw = `先看这组：
<show_widget>
<parameter name="widgetType">cards</parameter>
<parameter name="data">[{"title":"A"}]</parameter>
</show_widget>
结束`
    const out = extractXmlToolCalls(raw, new Set(['show_widget']))
    expect(out.content.trim()).toBe('先看这组：\n\n结束')
    expect(out.toolCalls).toHaveLength(1)
    expect(out.toolCalls[0]?.name).toBe('show_widget')
    expect(JSON.parse(out.toolCalls[0]!.args)).toEqual({
      widgetType: 'cards',
      data: [{ title: 'A' }]
    })
  })

  it('未闭合的 XML 不执行，但从可见正文剥掉残缺标签', () => {
    const raw = `我帮你出了 10 个：\n\n<show_widget>\n<parameter name="widgetType">cards`
    const out = extractXmlToolCalls(raw, new Set(['show_widget']))
    expect(out.toolCalls).toEqual([])
    expect(out.content).toBe('我帮你出了 10 个：')
    expect(out.content).not.toContain('show_widget')
  })

  it('不在允许列表里的标签不当工具', () => {
    const raw = `<think>x</think>\n<body>hi</body>`
    const out = extractXmlToolCalls(raw, new Set(['show_widget']))
    expect(out.toolCalls).toEqual([])
    expect(out.content).toContain('<think>x</think>')
  })
})

describe('stripXmlToolMarkup', () => {
  it('去掉完整与残缺的工具 XML', () => {
    expect(stripXmlToolMarkup('a <show_widget>\n<parameter name="widgetType">cards')).toBe('a')
    expect(
      stripXmlToolMarkup(
        'a <show_widget><parameter name="widgetType">cards</parameter></show_widget> b'
      )
    ).toBe('a  b')
  })
})
