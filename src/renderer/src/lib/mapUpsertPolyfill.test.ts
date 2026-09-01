import { describe, expect, it } from 'vitest'
import { getOrInsert, getOrInsertComputed } from './mapUpsertPolyfill'

type UpsertMap<K, V> = Map<K, V> & {
  getOrInsertComputed(key: K, compute: (key: K) => V): V
}

describe('map upsert polyfill', () => {
  it('getOrInsertComputed 只计算一次并写回', () => {
    const map = new Map<string, number>()
    let n = 0
    expect(getOrInsertComputed(map, 'a', () => ++n)).toBe(1)
    expect(getOrInsertComputed(map, 'a', () => ++n)).toBe(1)
    expect(map.get('a')).toBe(1)
  })

  it('getOrInsert 在缺省时写入默认值', () => {
    const map = new Map<string, string>()
    expect(getOrInsert(map, 'k', 'v')).toBe('v')
    expect(getOrInsert(map, 'k', 'other')).toBe('v')
  })

  it('补上 Map.prototype.getOrInsertComputed，对齐 pdf.js WorkerTransport', () => {
    const map = new Map<string, Promise<number>>() as UpsertMap<string, Promise<number>>
    expect(typeof map.getOrInsertComputed).toBe('function')
    const first = map.getOrInsertComputed('GetDoc', () => Promise.resolve(1))
    const second = map.getOrInsertComputed('GetDoc', () => Promise.resolve(2))
    expect(first).toBe(second)
  })
})
