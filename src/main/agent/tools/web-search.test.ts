import { describe, expect, it } from 'vitest'
import { parseBingHtml, parseDdgInstant, runWebSearch, stripHtml } from './web-search'

const BING_FIXTURE = `
<ol id="b_results">
<li class="b_algo"><h2><a href="https://www.example.com/gz">广州周末两日游攻略</a></h2>
<p class="b_lineclamp2">陈家祠、沙面、珠江夜游，人均预算约 800 元。</p></li>
<li class="b_algo"><h2><a href="https://food.example.com/tea">广州早茶必吃</a></h2>
<p>点都德、陶陶居，虾饺肠粉。</p></li>
<li class="b_algo"><h2><a href="/relative">相对链接应跳过</a></h2><p>x</p></li>
</ol>
`

describe('parseBingHtml', () => {
  it('抽出 title/url/snippet，跳过非 http 链接', () => {
    const hits = parseBingHtml(BING_FIXTURE)
    expect(hits).toHaveLength(2)
    expect(hits[0]).toMatchObject({
      title: '广州周末两日游攻略',
      url: 'https://www.example.com/gz'
    })
    expect(hits[0].snippet).toMatch(/陈家祠/)
    expect(hits[1].url).toBe('https://food.example.com/tea')
  })
})

describe('stripHtml', () => {
  it('去标签与实体', () => {
    expect(stripHtml('A&nbsp;B&#0183;C')).toMatch(/A B.*C/)
  })
})

describe('parseDdgInstant', () => {
  it('Abstract + RelatedTopics', () => {
    const hits = parseDdgInstant({
      Heading: 'Guangzhou',
      AbstractText: 'city',
      AbstractURL: 'https://ddg.example/gz',
      RelatedTopics: [{ Text: 'Canton Tower', FirstURL: 'https://ddg.example/tower' }]
    })
    expect(hits).toHaveLength(2)
    expect(hits[0].title).toBe('Guangzhou')
    expect(hits[1].url).toBe('https://ddg.example/tower')
  })
})

describe('runWebSearch', () => {
  it('优先用 Bing 命中', async () => {
    const out = await runWebSearch('广州', 8, async (url) => {
      if (url.includes('bing.com')) return BING_FIXTURE
      throw new Error('should not call ddg')
    })
    expect(out.results).toHaveLength(2)
    expect(out.error).toBeUndefined()
  })

  it('Bing 失败则回退 DDG', async () => {
    const out = await runWebSearch('gz', 8, async (url) => {
      if (url.includes('bing.com')) throw new Error('fetch failed')
      return JSON.stringify({
        Heading: 'GZ',
        AbstractText: 'ok',
        AbstractURL: 'https://ddg.example'
      })
    })
    expect(out.results[0].title).toBe('GZ')
  })

  it('全部失败返回 error + 空 results', async () => {
    const out = await runWebSearch('x', 8, async () => {
      throw new Error('fetch failed')
    })
    expect(out.results).toEqual([])
    expect(out.error).toMatch(/fetch failed/)
  })
})
