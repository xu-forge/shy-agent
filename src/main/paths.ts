import { homedir } from 'os'
import { join } from 'path'
import { mkdirSync } from 'fs'

export type ShyPaths = {
  shyHome: string
  configDir: string
  configSettings: string
  dbDir: string
  dbPath: string
  skillsDir: string
  sessionsDir: string
  logsDir: string
  logsAgentDir: string
  logsAppDir: string
  artifactsDir: string
  reportsDir: string
  screenshotsDir: string
  cacheDir: string
  migrationFile: string
  migrationBackupDir: string
}

/** 数据根：SHY_HOME 优先，否则 ~/.shy */
export function resolveShyHome(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.SHY_HOME?.trim()
  if (override) return override
  return join(homedir(), '.shy')
}

/** 会话默认工作区：~/.shy/sessions/{sessionId}/workspace */
export function getDefaultSessionWorkspace(sessionId: string, home = resolveShyHome()): string {
  return join(getShyPaths(home).sessionsDir, sessionId, 'workspace')
}

/** @deprecated 使用 resolveAgentWorkspace；保留别名供旧测试编译 */
export const getSessionWorkspace = getDefaultSessionWorkspace

export function getShyPaths(home = resolveShyHome()): ShyPaths {
  const configDir = join(home, 'config')
  const dbDir = join(home, 'db')
  const logsDir = join(home, 'logs')
  const artifactsDir = join(home, 'artifacts')
  return {
    shyHome: home,
    configDir,
    configSettings: join(configDir, 'settings.json'),
    dbDir,
    dbPath: join(dbDir, 'shy.sqlite'),
    skillsDir: join(home, 'skills'),
    sessionsDir: join(home, 'sessions'),
    logsDir,
    logsAgentDir: join(logsDir, 'agent'),
    logsAppDir: join(logsDir, 'app'),
    artifactsDir,
    reportsDir: join(artifactsDir, 'reports'),
    screenshotsDir: join(artifactsDir, 'screenshots'),
    cacheDir: join(home, 'cache'),
    migrationFile: join(home, 'migration.json'),
    migrationBackupDir: join(home, 'migration-backup')
  }
}

export function ensureShyHomeDirs(home = resolveShyHome()): ShyPaths {
  const paths = getShyPaths(home)
  const dirs = [
    paths.shyHome,
    paths.configDir,
    paths.dbDir,
    paths.skillsDir,
    paths.sessionsDir,
    paths.logsAgentDir,
    paths.logsAppDir,
    paths.reportsDir,
    paths.screenshotsDir,
    paths.cacheDir,
    paths.migrationBackupDir
  ]
  for (const d of dirs) {
    mkdirSync(d, { recursive: true })
  }
  return paths
}
