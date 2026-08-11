import { randomUUID } from 'crypto'
import type { Workflow, WorkflowRun, WorkflowRunStatus } from '../../shared/ipc'
import { getDb } from '../memory/db'

export function ensureWorkflowTables(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      nodes TEXT NOT NULL DEFAULT '[]',
      edges TEXT NOT NULL DEFAULT '[]',
      schedule TEXT NOT NULL DEFAULT '{}',
      output_config TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workflow_runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      workflow_name TEXT NOT NULL,
      status TEXT NOT NULL,
      trigger TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      logs TEXT NOT NULL DEFAULT '[]',
      output TEXT,
      error TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_runs_wid ON workflow_runs(workflow_id, started_at DESC);
  `)
}

function now(): string {
  return new Date().toISOString()
}

export function listWorkflows(): Workflow[] {
  ensureWorkflowTables()
  const rows = getDb().prepare(`SELECT * FROM workflows ORDER BY updated_at DESC`).all() as Record<
    string,
    unknown
  >[]
  return rows.map(rowToWorkflow)
}

export function getWorkflow(id: string): Workflow | null {
  ensureWorkflowTables()
  const row = getDb().prepare(`SELECT * FROM workflows WHERE id = ?`).get(id) as
    Record<string, unknown> | undefined
  return row ? rowToWorkflow(row) : null
}

export function saveWorkflow(wf: Workflow): Workflow {
  ensureWorkflowTables()
  const t = now()
  const existing = getDb().prepare(`SELECT id FROM workflows WHERE id = ?`).get(wf.id)
  const payload = {
    id: wf.id,
    name: wf.name,
    description: wf.description ?? '',
    nodes: JSON.stringify(wf.nodes ?? []),
    edges: JSON.stringify(wf.edges ?? []),
    schedule: JSON.stringify(wf.schedule ?? {}),
    output_config: JSON.stringify(wf.outputConfig ?? {}),
    updated_at: t
  }
  if (existing) {
    getDb()
      .prepare(
        `UPDATE workflows SET name=?, description=?, nodes=?, edges=?, schedule=?, output_config=?, updated_at=? WHERE id=?`
      )
      .run(
        payload.name,
        payload.description,
        payload.nodes,
        payload.edges,
        payload.schedule,
        payload.output_config,
        payload.updated_at,
        payload.id
      )
    return { ...wf, updatedAt: t }
  }
  getDb()
    .prepare(
      `INSERT INTO workflows (id, name, description, nodes, edges, schedule, output_config, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    )
    .run(
      payload.id,
      payload.name,
      payload.description,
      payload.nodes,
      payload.edges,
      payload.schedule,
      payload.output_config,
      t,
      t
    )
  return { ...wf, createdAt: t, updatedAt: t }
}

export function deleteWorkflow(id: string): void {
  ensureWorkflowTables()
  getDb().prepare(`DELETE FROM workflow_runs WHERE workflow_id = ?`).run(id)
  getDb().prepare(`DELETE FROM workflows WHERE id = ?`).run(id)
}

function rowToWorkflow(row: Record<string, unknown>): Workflow {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ''),
    nodes: JSON.parse(String(row.nodes || '[]')),
    edges: JSON.parse(String(row.edges || '[]')),
    schedule: JSON.parse(String(row.schedule || '{}')),
    outputConfig: JSON.parse(String(row.output_config || '{}')),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

/* ── runs ── */

export function createRun(input: {
  workflowId: string
  workflowName: string
  trigger: 'manual' | 'schedule'
}): WorkflowRun {
  ensureWorkflowTables()
  const t = now()
  const run: WorkflowRun = {
    id: randomUUID(),
    workflowId: input.workflowId,
    workflowName: input.workflowName,
    status: 'running',
    trigger: input.trigger,
    startedAt: t,
    logs: []
  }
  getDb()
    .prepare(
      `INSERT INTO workflow_runs (id, workflow_id, workflow_name, status, trigger, started_at, created_at)
       VALUES (?,?,?,?,?,?,?)`
    )
    .run(run.id, run.workflowId, run.workflowName, run.status, run.trigger, run.startedAt, t)
  return run
}

export function updateRun(
  id: string,
  patch: {
    status?: WorkflowRunStatus
    finishedAt?: string
    logs?: WorkflowRun['logs']
    output?: string
    error?: string
  }
): WorkflowRun {
  ensureWorkflowTables()
  const cur = getDb().prepare(`SELECT * FROM workflow_runs WHERE id = ?`).get(id) as
    Record<string, unknown> | undefined
  if (!cur) throw new Error('run not found')
  const logs = patch.logs ?? (JSON.parse(String(cur.logs || '[]')) as WorkflowRun['logs'])
  const updated: WorkflowRun = {
    id,
    workflowId: String(cur.workflow_id),
    workflowName: String(cur.workflow_name),
    status: patch.status ?? (cur.status as WorkflowRunStatus),
    trigger: String(cur.trigger) as WorkflowRun['trigger'],
    startedAt: String(cur.started_at),
    finishedAt: patch.finishedAt ?? (cur.finished_at ? String(cur.finished_at) : undefined),
    logs,
    output: patch.output ?? (cur.output ? String(cur.output) : undefined),
    error: patch.error ?? (cur.error ? String(cur.error) : undefined)
  }
  getDb()
    .prepare(
      `UPDATE workflow_runs SET status=?, finished_at=?, logs=?, output=?, error=? WHERE id=?`
    )
    .run(
      updated.status,
      updated.finishedAt ?? null,
      JSON.stringify(updated.logs),
      updated.output ?? null,
      updated.error ?? null,
      id
    )
  return updated
}

export function listRuns(workflowId?: string, limit = 50): WorkflowRun[] {
  ensureWorkflowTables()
  const rows = workflowId
    ? (getDb()
        .prepare(
          `SELECT * FROM workflow_runs WHERE workflow_id = ? ORDER BY started_at DESC LIMIT ?`
        )
        .all(workflowId, limit) as Record<string, unknown>[])
    : (getDb()
        .prepare(`SELECT * FROM workflow_runs ORDER BY started_at DESC LIMIT ?`)
        .all(limit) as Record<string, unknown>[])
  return rows.map(rowToRun)
}

function rowToRun(row: Record<string, unknown>): WorkflowRun {
  return {
    id: String(row.id),
    workflowId: String(row.workflow_id),
    workflowName: String(row.workflow_name),
    status: row.status as WorkflowRunStatus,
    trigger: String(row.trigger) as WorkflowRun['trigger'],
    startedAt: String(row.started_at),
    finishedAt: row.finished_at ? String(row.finished_at) : undefined,
    logs: JSON.parse(String(row.logs || '[]')),
    output: row.output ? String(row.output) : undefined,
    error: row.error ? String(row.error) : undefined
  }
}
