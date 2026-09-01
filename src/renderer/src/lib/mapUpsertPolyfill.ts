/**
 * pdf.js 6 依赖 Map/WeakMap.getOrInsertComputed（较新的 V8）。
 * 当前 Electron Chromium 没有这个方法时会炸：this[#methodPromises].getOrInsertComputed is not a function
 */

type UpsertMap<K, V> = {
  has(key: K): boolean
  get(key: K): V | undefined
  set(key: K, value: V): unknown
}

export function getOrInsertComputed<K, V>(
  map: UpsertMap<K, V>,
  key: K,
  compute: (key: K) => V
): V {
  if (map.has(key)) return map.get(key) as V
  const value = compute(key)
  map.set(key, value)
  return value
}

export function getOrInsert<K, V>(map: UpsertMap<K, V>, key: K, defaultValue: V): V {
  if (map.has(key)) return map.get(key) as V
  map.set(key, defaultValue)
  return defaultValue
}

export function installMapUpsertPolyfill(): void {
  const mapProto = Map.prototype as Map<unknown, unknown> & {
    getOrInsert?: (key: unknown, value: unknown) => unknown
    getOrInsertComputed?: (key: unknown, fn: (key: unknown) => unknown) => unknown
  }
  if (typeof mapProto.getOrInsertComputed !== 'function') {
    mapProto.getOrInsertComputed = function (key, compute) {
      return getOrInsertComputed(this, key, compute)
    }
  }
  if (typeof mapProto.getOrInsert !== 'function') {
    mapProto.getOrInsert = function (key, value) {
      return getOrInsert(this, key, value)
    }
  }

  const weakProto = WeakMap.prototype as WeakMap<object, unknown> & {
    getOrInsert?: (key: object, value: unknown) => unknown
    getOrInsertComputed?: (key: object, fn: (key: object) => unknown) => unknown
  }
  if (typeof weakProto.getOrInsertComputed !== 'function') {
    weakProto.getOrInsertComputed = function (key, compute) {
      return getOrInsertComputed(this, key, compute)
    }
  }
  if (typeof weakProto.getOrInsert !== 'function') {
    weakProto.getOrInsert = function (key, value) {
      return getOrInsert(this, key, value)
    }
  }
}

installMapUpsertPolyfill()
