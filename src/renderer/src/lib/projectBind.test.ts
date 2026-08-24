import { describe, expect, it } from 'vitest'
import type { SessionFileRecord, SessionSummary } from '../../../shared/ipc'
import {
  BIND_ERROR_LABEL,
  INSPECTOR_TABS,
  artifactFiles,
  isProjectPickerLocked,
  normalizeInspectorTab,
  sameProjectSessions,
  shouldBindOnSend
} from './projectBind'

describe('INSPECTOR_TABS', () => {
  it('仅含会话详情与浏览器', () => {
    expect(INSPECTOR_TABS.map((t) => t.key)).toEqual(['details', 'browser'])
    expect(INSPECTOR_TABS.map((t) => t.label)).toEqual(['会话详情', '浏览器'])
  })
})

describe('normalizeInspectorTab', () => {
  it('browser 保留，其余（含旧 tasks/diffs）落到 details', () => {
    expect(normalizeInspectorTab('browser')).toBe('browser')
    expect(normalizeInspectorTab('details')).toBe('details')
    expect(normalizeInspectorTab('tasks')).toBe('details')
    expect(normalizeInspectorTab('diffs')).toBe('details')
    expect(normalizeInspectorTab(null)).toBe('details')
  })
})

describe('isProjectPickerLocked', () => {
  it('空会话且未绑定时可改选', () => {
    expect(isProjectPickerLocked({ hasUserMessages: false, projectId: null })).toBe(false)
  })

  it('已有用户消息或已绑定则只读', () => {
    expect(isProjectPickerLocked({ hasUserMessages: true, projectId: null })).toBe(true)
    expect(isProjectPickerLocked({ hasUserMessages: false, projectId: 'p1' })).toBe(true)
  })
})

describe('shouldBindOnSend', () => {
  it('无用户消息、未绑定、有 pending 时才 bind', () => {
    expect(
      shouldBindOnSend({
        hasUserMessages: false,
        boundProjectId: null,
        pendingProjectId: 'p1'
      })
    ).toBe(true)
  })

  it('已有消息、已绑定或未选 pending 时不 bind', () => {
    expect(
      shouldBindOnSend({
        hasUserMessages: true,
        boundProjectId: null,
        pendingProjectId: 'p1'
      })
    ).toBe(false)
    expect(
      shouldBindOnSend({
        hasUserMessages: false,
        boundProjectId: 'p1',
        pendingProjectId: 'p2'
      })
    ).toBe(false)
    expect(
      shouldBindOnSend({
        hasUserMessages: false,
        boundProjectId: null,
        pendingProjectId: null
      })
    ).toBe(false)
  })
})

describe('BIND_ERROR_LABEL', () => {
  it('覆盖 already_bound / has_messages / not_found', () => {
    expect(BIND_ERROR_LABEL.already_bound).toBeTruthy()
    expect(BIND_ERROR_LABEL.has_messages).toBeTruthy()
    expect(BIND_ERROR_LABEL.not_found).toBeTruthy()
  })
})

describe('artifactFiles', () => {
  it('会话详情只列 write 产物', () => {
    const files: SessionFileRecord[] = [
      { id: 1, sessionId: 's', op: 'read', path: 'a.ts', occurredAt: 1 },
      { id: 2, sessionId: 's', op: 'write', path: 'out.md', occurredAt: 2 },
      { id: 3, sessionId: 's', op: 'delete', path: 'gone.ts', occurredAt: 3 }
    ]
    expect(artifactFiles(files).map((f) => f.path)).toEqual(['out.md'])
  })
})

describe('sameProjectSessions', () => {
  it('只返回同一 projectId 的会话', () => {
    const sessions: SessionSummary[] = [
      {
        id: 's1',
        title: 'a',
        mode: 'interactive',
        updatedAt: '',
        createdAt: '',
        paused: false,
        projectId: 'p1'
      },
      {
        id: 's2',
        title: 'b',
        mode: 'interactive',
        updatedAt: '',
        createdAt: '',
        paused: false,
        projectId: 'p2'
      },
      {
        id: 's3',
        title: 'c',
        mode: 'interactive',
        updatedAt: '',
        createdAt: '',
        paused: false,
        projectId: 'p1'
      }
    ]
    expect(sameProjectSessions(sessions, 'p1').map((s) => s.id)).toEqual(['s1', 's3'])
  })
})
