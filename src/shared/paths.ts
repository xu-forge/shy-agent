import type { AppPaths } from './ipc'

export function assertAppPaths(value: unknown): asserts value is AppPaths {
  if (!value || typeof value !== 'object') throw new Error('paths must be object')
  const v = value as Record<string, unknown>
  if (typeof v.userData !== 'string' || v.userData.length === 0) {
    throw new Error('userData must be non-empty string')
  }
  if (typeof v.platform !== 'string' || v.platform.length === 0) {
    throw new Error('platform must be non-empty string')
  }
}
