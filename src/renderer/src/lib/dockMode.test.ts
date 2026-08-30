import { describe, expect, it } from 'vitest'
import {
  parseDockMode,
  serializeDockMode,
  toggleDockMode,
  clampDockWidth,
  parseDockWidth,
  shouldRenderSessionDock
} from './dockMode'

describe('parseDockMode', () => {
  it('识别 tasks / browser / files', () => {
    expect(parseDockMode('tasks')).toBe('tasks')
    expect(parseDockMode('browser')).toBe('browser')
    expect(parseDockMode('files')).toBe('files')
  })

  it('空串、null 字面量、非法值 → 收起', () => {
    expect(parseDockMode('')).toBe(null)
    expect(parseDockMode('null')).toBe(null)
    expect(parseDockMode('details')).toBe(null)
    expect(parseDockMode('TASKS')).toBe(null)
  })

  it('缺省收起：两键皆缺失', () => {
    expect(parseDockMode(null)).toBe(null)
    expect(parseDockMode(null, null)).toBe(null)
    expect(parseDockMode(null, 'false')).toBe(null)
  })

  it('旧 shy.inspectorOpen=true 且尚未写入 dockMode → tasks', () => {
    expect(parseDockMode(null, 'true')).toBe('tasks')
  })

  it('已写入 dockMode 时不再看旧键', () => {
    expect(parseDockMode('', 'true')).toBe(null)
    expect(parseDockMode('files', 'true')).toBe('files')
  })
})

describe('serializeDockMode', () => {
  it('null 写成空串以便与「键缺失」区分', () => {
    expect(serializeDockMode(null)).toBe('')
    expect(serializeDockMode('browser')).toBe('browser')
  })
})

describe('toggleDockMode', () => {
  it('再点当前模式收起，点其它模式切换', () => {
    expect(toggleDockMode(null, 'tasks')).toBe('tasks')
    expect(toggleDockMode('tasks', 'tasks')).toBe(null)
    expect(toggleDockMode('tasks', 'browser')).toBe('browser')
  })
})

describe('shouldRenderSessionDock', () => {
  it('会话主列有 inspector 时始终渲染（含收起）', () => {
    expect(shouldRenderSessionDock(true, null)).toBe(true)
    expect(shouldRenderSessionDock(true, 'browser')).toBe(true)
  })

  it('素材/代码 IDE 无 inspector 时，仅在 Dock 被打开时渲染', () => {
    expect(shouldRenderSessionDock(false, null)).toBe(false)
    expect(shouldRenderSessionDock(false, 'browser')).toBe(true)
    expect(shouldRenderSessionDock(false, 'files')).toBe(true)
  })
})

describe('clampDockWidth / parseDockWidth', () => {
  it('夹在 340–720，缺省 340', () => {
    expect(clampDockWidth(500)).toBe(500)
    expect(clampDockWidth(200)).toBe(340)
    expect(clampDockWidth(900)).toBe(720)
    expect(parseDockWidth(null)).toBe(340)
    expect(parseDockWidth('560')).toBe(560)
    expect(parseDockWidth('abc')).toBe(340)
  })
})
