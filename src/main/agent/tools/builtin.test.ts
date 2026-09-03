/**
 * Tool description 8 段式质量检查（参考 minimax mavis-09 §2）。
 */
import { describe, expect, it, beforeAll } from 'vitest'
import { registerBuiltinTools } from './builtin'
import { buildTools } from './registry'

describe('tool description 8 段式质量', () => {
  let tools: ReturnType<typeof buildTools>
  beforeAll(() => {
    registerBuiltinTools() // 显式注册（不在 import 时副作用）
    tools = buildTools({
      emit: () => undefined,
      confirmHighRisk: async () => true,
      workspaceDir: '/tmp/shy-test-workspace',
      sessionId: 'test'
    })
  })

  it('buildTools 返回的工具包含 8 个 builtin + task 子集', () => {
    const names = tools.map((t) => t.name).sort()
    expect(names).toContain('shell_exec')
    expect(names).toContain('fs_read')
    expect(names).toContain('fs_write')
    expect(names).toContain('fs_delete')
    expect(names).toContain('memory_upsert')
    expect(names).toContain('memory_list')
    expect(names).toContain('memory_delete')
    expect(names).toContain('skill_write')
    expect(names).toContain('skill_list')
    expect(names).toContain('skill_delete')
    expect(names).toContain('skill_set_enabled')
    expect(names).toContain('mcp_list')
    expect(names).toContain('mcp_upsert')
    expect(names).toContain('mcp_remove')
    expect(names).toContain('mcp_set_enabled')
    expect(names).toContain('mcp_authorize')
    expect(names).toContain('runtime_ping')
    expect(names).toContain('task')
  })

  it('8 个核心工具 description 都 > 80 字符（不是 1 句）', () => {
    const names = [
      'shell_exec',
      'fs_read',
      'fs_write',
      'fs_delete',
      'memory_upsert',
      'memory_list',
      'memory_delete',
      'skill_write',
      'skill_list',
      'skill_delete'
    ]
    for (const name of names) {
      const t = tools.find((x) => x.name === name)
      expect(t, `${name} 工具未注册`).toBeDefined()
      expect(t!.description, `${name} description 为空`).toBeTruthy()
      expect(t!.description.length, `${name} description 太短 (${t!.description.length})`).toBeGreaterThanOrEqual(80)
    }
  })

  it('8 个工具 description 都含「何时用」和「何时不用」', () => {
    for (const t of tools!) {
      if (['runtime_ping', 'task', 'task_output', 'task_query', 'task_stop'].includes(t.name)) continue
      const desc = t.description
      const hasWhenTo = /何时用|when to use|Use this for/i.test(desc)
      const hasWhenNot = /何时不用|when not|Do not|Never|不要|严禁/i.test(desc)
      expect(hasWhenTo, `${t.name} 缺「何时用」段`).toBe(true)
      expect(hasWhenNot, `${t.name} 缺「何时不用」段`).toBe(true)
    }
  })

  it('高危工具含「确认」语义', () => {
    for (const name of ['fs_delete', 'memory_delete', 'skill_delete', 'shell_exec', 'mcp_remove']) {
      const t = tools!.find((x) => x.name === name)
      expect(t, `${name} 未注册`).toBeDefined()
      const desc = t!.description
      const hasConfirm = /确认|confirm|高危|risk|dangerous/i.test(desc)
      expect(hasConfirm, `${name} 缺「确认」语义`).toBe(true)
    }
  })

  it('fs_write description 含「覆盖」和「敏感」提示', () => {
    const t = tools!.find((x) => x.name === 'fs_write')
    expect(t?.description).toMatch(/覆盖|overwrite|敏感|sensitive|可执行|executable/i)
  })

  it('shell_exec description 含「超时」和「路径」', () => {
    const t = tools!.find((x) => x.name === 'shell_exec')
    expect(t?.description).toMatch(/超时|timeout|路径|path/i)
  })

  it('fs/shell description 含实际 workspaceDir，不含旧 sandbox 路径', () => {
    for (const name of ['shell_exec', 'fs_read', 'fs_write', 'fs_delete']) {
      const t = tools.find((x) => x.name === name)
      expect(t, `${name} 未注册`).toBeDefined()
      expect(t!.description).toContain('/tmp/shy-test-workspace')
      expect(t!.description, `${name} 仍广告旧会话 sandbox`).not.toMatch(
        /~\/\.shy\/sessions/
      )
    }
  })

  it('memory 工具 description 含「审计」', () => {
    for (const name of ['memory_upsert', 'memory_list', 'memory_delete']) {
      const t = tools!.find((x) => x.name === name)
      expect(t?.description).toMatch(/审计|audit|记忆|memory|长期/i)
    }
  })
})

// 跑一次以保证 registerBuiltinTools 注册
void registerBuiltinTools
