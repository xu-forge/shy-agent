import { describe, expect, it } from 'vitest'
import type { SessionFileRecord, SessionSummary } from '../../../shared/ipc'
import {
  BIND_ERROR_LABEL,
  artifactFiles,
  chatStatusTone,
  isProjectPickerLocked,
  projectDeleteConfirmDetail,
  resolveBoundProjectId,
  sameProjectSessions,
  shouldBindOnSend,
  shouldShowProjectPicker
} from './projectBind'

describe('isProjectPickerLocked', () => {
  it('空会话且未绑定时可改选', () => {
    expect(isProjectPickerLocked({ hasUserMessages: false, projectId: null })).toBe(false)
  })

  it('已有用户消息或已绑定则只读', () => {
    expect(isProjectPickerLocked({ hasUserMessages: true, projectId: null })).toBe(true)
    expect(isProjectPickerLocked({ hasUserMessages: false, projectId: 'p1' })).toBe(true)
  })
})

describe('shouldShowProjectPicker', () => {
  it('未绑定主对话展示，已绑定（右侧会话）不展示', () => {
    expect(shouldShowProjectPicker(null)).toBe(true)
    expect(shouldShowProjectPicker(undefined)).toBe(true)
    expect(shouldShowProjectPicker('p1')).toBe(false)
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

  it('同一路径多次 write 只保留一条（最近一次）', () => {
    const files: SessionFileRecord[] = [
      { id: 1, sessionId: 's', op: 'write', path: '/w/攻略.html', occurredAt: 10 },
      { id: 2, sessionId: 's', op: 'write', path: '/w/攻略.html', occurredAt: 20 },
      { id: 3, sessionId: 's', op: 'write', path: '/w/攻略.html', occurredAt: 15 },
      { id: 4, sessionId: 's', op: 'write', path: '/w/notes.md', occurredAt: 12 }
    ]
    const listed = artifactFiles(files)
    expect(listed.map((f) => f.path)).toEqual(['/w/攻略.html', '/w/notes.md'])
    expect(listed[0]?.id).toBe(2)
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

describe('resolveBoundProjectId', () => {
  it('服务端 null / undefined / 空串视为未绑定，不回落到上一会话', () => {
    expect(resolveBoundProjectId(null)).toBeNull()
    expect(resolveBoundProjectId(undefined)).toBeNull()
    expect(resolveBoundProjectId('')).toBeNull()
  })

  it('有值时原样返回', () => {
    expect(resolveBoundProjectId('p1')).toBe('p1')
  })
})

describe('projectDeleteConfirmDetail', () => {
  it('names the project and says disk files are not deleted', () => {
    const detail = projectDeleteConfirmDetail('demo-repo')
    expect(detail).toContain('demo-repo')
    expect(detail).toMatch(/不会删除.*文件|不删除.*文件/)
    expect(detail).toMatch(/解绑/)
  })
})

describe('chatStatusTone', () => {
  it('idle 时 bind 错误仍显示 err，不因未 busy/paused 而隐藏', () => {
    expect(
      chatStatusTone({
        busy: false,
        paused: false,
        status: BIND_ERROR_LABEL.has_messages
      })
    ).toBe('err')
    expect(
      chatStatusTone({
        busy: false,
        paused: false,
        status: BIND_ERROR_LABEL.already_bound
      })
    ).toBe('err')
    expect(
      chatStatusTone({
        busy: false,
        paused: false,
        status: BIND_ERROR_LABEL.not_found
      })
    ).toBe('err')
  })

  it('无 status 且未运行则不显示', () => {
    expect(chatStatusTone({ busy: false, paused: false, status: '' })).toBe('')
  })

  it('busy / paused 优先', () => {
    expect(chatStatusTone({ busy: true, paused: false, status: '' })).toBe('busy')
    expect(chatStatusTone({ busy: false, paused: true, status: '' })).toBe('warn')
  })
})
