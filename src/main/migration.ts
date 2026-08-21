import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'fs'
import { basename, join } from 'path'
import { getShyPaths, type ShyPaths } from './paths'
import { getDb } from './memory/db'

export type MigrationResult = {
  status: 'success' | 'skipped' | 'noop'
  source?: string
  files: string[]
  migratedAt: string
  reason?: string
}

type MigrationMarker = {
  status: 'success'
  migratedAt: string
  source: string
  files: string[]
}

function hasLegacyPayload(dir: string): boolean {
  if (!dir || !existsSync(dir)) return false
  return (
    existsSync(join(dir, 'memory.sqlite')) ||
    existsSync(join(dir, 'settings.json')) ||
    existsSync(join(dir, 'skills')) ||
    existsSync(join(dir, 'reports')) ||
    existsSync(join(dir, 'screenshots'))
  )
}

function readMarker(paths: ShyPaths): MigrationMarker | null {
  if (!existsSync(paths.migrationFile)) return null
  try {
    const raw = JSON.parse(readFileSync(paths.migrationFile, 'utf8')) as MigrationMarker
    if (raw?.status === 'success') return raw
  } catch {
    /* ignore */
  }
  return null
}

function copyFileIfPresent(src: string, dest: string, files: string[]): void {
  if (!existsSync(src) || !statSync(src).isFile()) return
  mkdirSync(join(dest, '..'), { recursive: true })
  if (existsSync(dest)) {
    // 目标已有文件：不覆盖，记入旁路备份意图由调用方处理；此处跳过
    return
  }
  copyFileSync(src, dest)
  files.push(`${basename(src)}→${dest}`)
}

function copyDirIfPresent(src: string, dest: string, files: string[]): void {
  if (!existsSync(src) || !statSync(src).isDirectory()) return
  mkdirSync(dest, { recursive: true })
  cpSync(src, dest, { recursive: true, force: false, errorOnExist: false })
  files.push(`${basename(src)}/→${dest}`)
}

/**
 * 将旧 Electron userData 关键数据 copy 到 shy home。
 * 可重入：已有成功 migration.json 则跳过。
 */
export function migrateLegacyUserData(
  legacyUserData: string | undefined,
  homePaths: ShyPaths = getShyPaths()
): MigrationResult {
  const migratedAt = new Date().toISOString()
  const marker = readMarker(homePaths)
  if (marker) {
    return {
      status: 'skipped',
      migratedAt: marker.migratedAt,
      source: marker.source,
      files: marker.files,
      reason: 'already_migrated'
    }
  }

  if (!legacyUserData || !hasLegacyPayload(legacyUserData)) {
    return { status: 'noop', migratedAt, files: [], reason: 'no_legacy_data' }
  }

  // 若 shy home 已有较新权威数据（库或设置），避免用旧数据覆盖
  if (existsSync(homePaths.dbPath) || existsSync(homePaths.configSettings)) {
    const markerSkip: MigrationMarker = {
      status: 'success',
      migratedAt,
      source: legacyUserData,
      files: []
    }
    writeFileSync(homePaths.migrationFile, JSON.stringify(markerSkip, null, 2), 'utf8')
    return {
      status: 'skipped',
      migratedAt,
      source: legacyUserData,
      files: [],
      reason: 'target_already_populated'
    }
  }

  const files: string[] = []
  copyFileIfPresent(
    join(legacyUserData, 'settings.json'),
    homePaths.configSettings,
    files
  )
  copyFileIfPresent(join(legacyUserData, 'memory.sqlite'), homePaths.dbPath, files)
  copyDirIfPresent(join(legacyUserData, 'skills'), homePaths.skillsDir, files)
  copyDirIfPresent(join(legacyUserData, 'reports'), homePaths.reportsDir, files)
  copyDirIfPresent(join(legacyUserData, 'screenshots'), homePaths.screenshotsDir, files)

  const markerOk: MigrationMarker = {
    status: 'success',
    migratedAt,
    source: legacyUserData,
    files
  }
  writeFileSync(homePaths.migrationFile, JSON.stringify(markerOk, null, 2), 'utf8')
  return { status: 'success', migratedAt, source: legacyUserData, files }
}

/**
 * 砍掉 workflow 引擎后,把 SQLite 里的 workflows / workflow_runs 表整体备份到
 * `~/.shy/migration-backup/workflows-<ts>.json` 然后 DROP。可重入：已存在备份标记则跳过。
 */
export type WorkflowDropResult = {
  status: 'dropped' | 'skipped' | 'noop'
  backupPath?: string
  workflowCount: number
  runCount: number
  reason?: string
}

const WORKFLOW_DROP_MARKER = 'workflow-dropped-v1'

function hasWorkflowTables(): boolean {
  try {
    const db = getDb()
    const row = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('workflows', 'workflow_runs')`)
      .all() as Array<{ name: string }>
    return row.length > 0
  } catch {
    return false
  }
}

export function dropLegacyWorkflowTables(homePaths: ShyPaths = getShyPaths()): WorkflowDropResult {
  const markerPath = join(homePaths.migrationBackupDir, WORKFLOW_DROP_MARKER + '.json')
  if (existsSync(markerPath)) {
    return { status: 'skipped', workflowCount: 0, runCount: 0, reason: 'already_dropped' }
  }
  if (!hasWorkflowTables()) {
    return { status: 'noop', workflowCount: 0, runCount: 0, reason: 'no_workflow_tables' }
  }

  const db = getDb()
  const workflows = db.prepare(`SELECT * FROM workflows`).all() as Record<string, unknown>[]
  const runs = db.prepare(`SELECT * FROM workflow_runs`).all() as Record<string, unknown>[]

  mkdirSync(homePaths.migrationBackupDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(homePaths.migrationBackupDir, `workflows-${ts}.json`)
  writeFileSync(
    backupPath,
    JSON.stringify({ migratedAt: new Date().toISOString(), workflows, runs }, null, 2),
    'utf8'
  )

  db.exec(`DROP TABLE IF EXISTS workflow_runs; DROP TABLE IF EXISTS workflows;`)
  writeFileSync(markerPath, JSON.stringify({ droppedAt: new Date().toISOString(), backupPath }), 'utf8')

  return { status: 'dropped', backupPath, workflowCount: workflows.length, runCount: runs.length }
}
