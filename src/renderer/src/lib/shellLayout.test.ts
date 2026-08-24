import { describe, expect, it } from 'vitest'
import type { Project, SessionSummary } from '../../../shared/ipc'
import {
  UNSELECTED_GROUP_KEY,
  UNSELECTED_PROJECT_GROUP,
  groupSessionsByProject,
  groupStorageKey,
  parseCollapsedGroups,
  parseNavExpanded,
  resolveChatHostClass,
  resolveShellLayout,
  resolveWorkspaceKind,
  toggleCollapsedGroup
} from './shellLayout'

function session(partial: Partial<SessionSummary> & { id: string; title: string }): SessionSummary {
  return {
    mode: 'interactive',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    paused: false,
    projectId: null,
    ...partial
  }
}

function project(partial: Partial<Project> & { id: string; name: string }): Project {
  return {
    type: 'code',
    rootPath: `/tmp/${partial.id}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial
  }
}

describe('groupSessionsByProject', () => {
  it('未绑定会话归「未选择项目」，已绑定会话归具名项目', () => {
    const unbound = session({ id: 's-free', title: '闲聊', projectId: null })
    const bound = session({ id: 's-be', title: '修 API', projectId: 'p-be' })
    const groups = groupSessionsByProject(
      [unbound, bound],
      [project({ id: 'p-be', name: '后端' })]
    )

    expect(groups.map((g) => g.title)).toEqual(['未选择项目', '后端'])
    expect(groups[0]?.id).toBeNull()
    expect(groups[0]?.title).toBe(UNSELECTED_PROJECT_GROUP)
    expect(groups[0]?.sessions.map((s) => s.id)).toEqual(['s-free'])
    expect(groups[1]?.sessions.map((s) => s.id)).toEqual(['s-be'])
  })

  it('尚无会话的项目仍列出空组', () => {
    const groups = groupSessionsByProject([], [project({ id: 'p-empty', name: '空仓库' })])

    expect(groups).toHaveLength(2)
    expect(groups[1]).toEqual({ id: 'p-empty', title: '空仓库', sessions: [] })
  })

  it('projectId 指向已删除项目的会话回到「未选择项目」', () => {
    const orphan = session({ id: 's-orphan', title: '孤儿', projectId: 'gone' })
    const groups = groupSessionsByProject([orphan], [])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.title).toBe('未选择项目')
    expect(groups[0]?.sessions.map((s) => s.id)).toEqual(['s-orphan'])
  })

  it('具名项目顺序与 listProjects 一致', () => {
    const groups = groupSessionsByProject(
      [],
      [
        project({ id: 'p2', name: '素材库' }),
        project({ id: 'p1', name: '后端' })
      ]
    )
    expect(groups.slice(1).map((g) => g.title)).toEqual(['素材库', '后端'])
  })
})

describe('resolveWorkspaceKind', () => {
  const code = project({ id: 'p-code', name: '后端', type: 'code' })
  const material = project({ id: 'p-mat', name: '图库', type: 'material' })

  it('无会话或 projectId 为空则为 unbound', () => {
    expect(resolveWorkspaceKind(undefined, [code])).toBe('unbound')
    expect(resolveWorkspaceKind(session({ id: 's1', title: 'a', projectId: null }), [code])).toBe(
      'unbound'
    )
  })

  it('按已绑定项目 type 返回 code 或 material', () => {
    expect(
      resolveWorkspaceKind(session({ id: 's1', title: 'a', projectId: 'p-code' }), [code, material])
    ).toBe('code')
    expect(
      resolveWorkspaceKind(session({ id: 's1', title: 'a', projectId: 'p-mat' }), [code, material])
    ).toBe('material')
  })

  it('绑定的项目不在列表中则视为 unbound', () => {
    expect(
      resolveWorkspaceKind(session({ id: 's1', title: 'a', projectId: 'missing' }), [code])
    ).toBe('unbound')
  })
})

describe('parseNavExpanded', () => {
  it('缺省展开，仅 0/false 收起', () => {
    expect(parseNavExpanded(null)).toBe(true)
    expect(parseNavExpanded('1')).toBe(true)
    expect(parseNavExpanded('0')).toBe(false)
    expect(parseNavExpanded('false')).toBe(false)
  })
})

describe('group collapse', () => {
  it('未选择项目用稳定 key', () => {
    expect(groupStorageKey(null)).toBe(UNSELECTED_GROUP_KEY)
    expect(groupStorageKey('p-be')).toBe('p-be')
  })

  it('解析收起列表，坏 JSON 当空', () => {
    expect(parseCollapsedGroups(null)).toEqual([])
    expect(parseCollapsedGroups('["unselected","p-be"]')).toEqual(['unselected', 'p-be'])
    expect(parseCollapsedGroups('not-json')).toEqual([])
    expect(parseCollapsedGroups('{"a":1}')).toEqual([])
  })

  it('toggle 加入或移除', () => {
    expect(toggleCollapsedGroup([], 'unselected')).toEqual(['unselected'])
    expect(toggleCollapsedGroup(['unselected'], 'unselected')).toEqual([])
    expect(toggleCollapsedGroup(['unselected'], 'p-be')).toEqual(['unselected', 'p-be'])
  })
})

describe('resolveShellLayout', () => {
  it('未绑定且有对话：对话主区 + Inspector', () => {
    expect(
      resolveShellLayout({
        nav: 'projects',
        workspaceKind: 'unbound',
        hasConversation: true
      })
    ).toEqual({
      main: 'chat',
      showInspector: true,
      showChatAside: false
    })
  })

  it('未绑定空态不显示 Inspector', () => {
    expect(
      resolveShellLayout({
        nav: 'projects',
        workspaceKind: 'unbound',
        hasConversation: false
      }).showInspector
    ).toBe(false)
  })

  it('代码项目：代码主区 + 右侧对话，无 Inspector', () => {
    expect(
      resolveShellLayout({
        nav: 'projects',
        workspaceKind: 'code',
        hasConversation: true
      })
    ).toEqual({
      main: 'code',
      showInspector: false,
      showChatAside: true
    })
  })

  it('素材项目：素材主区 + 右侧对话，无 Inspector', () => {
    expect(
      resolveShellLayout({
        nav: 'projects',
        workspaceKind: 'material',
        hasConversation: true
      })
    ).toEqual({
      main: 'material',
      showInspector: false,
      showChatAside: true
    })
  })

  it('技能 / 日历无 Inspector，主区切走', () => {
    expect(
      resolveShellLayout({
        nav: 'skills',
        workspaceKind: 'code',
        hasConversation: true
      })
    ).toEqual({
      main: 'skills',
      showInspector: false,
      showChatAside: false
    })
    expect(
      resolveShellLayout({
        nav: 'calendar',
        workspaceKind: 'unbound',
        hasConversation: true
      }).main
    ).toBe('calendar')
  })
})

describe('resolveChatHostClass', () => {
  it('未绑定项目视图用 chat-main，代码/素材用 chat-aside（同一宿主，只换 class）', () => {
    expect(resolveChatHostClass('projects', 'unbound')).toBe('chat-main')
    expect(resolveChatHostClass('projects', 'code')).toBe('chat-aside')
    expect(resolveChatHostClass('projects', 'material')).toBe('chat-aside')
  })

  it('技能/日历隐藏宿主但不卸载（chat-hidden）', () => {
    expect(resolveChatHostClass('skills', 'unbound')).toBe('chat-hidden')
    expect(resolveChatHostClass('calendar', 'code')).toBe('chat-hidden')
  })
})
