import { exec } from 'child_process'
import { promisify } from 'util'

export const CHECK_TIMEOUT_MS = 300_000
export const EVIDENCE_MAX_CHARS = 8192

export type CheckRunResult = {
  command: string
  exitCode: number
  output: string
  timedOut: boolean
  denied: boolean
}

const execAsync = promisify(exec)

function truncateOutput(stdout: string, stderr: string): string {
  const combined = `${stdout}${stderr}`
  if (combined.length <= EVIDENCE_MAX_CHARS) return combined
  if (stderr.length >= EVIDENCE_MAX_CHARS) return stderr.slice(0, EVIDENCE_MAX_CHARS)
  return `${stdout.slice(0, EVIDENCE_MAX_CHARS - stderr.length)}${stderr}`
}

class ExecTimeoutError extends Error {
  readonly timedOut = true
  readonly stdout: string
  readonly stderr: string

  constructor(stdout: string, stderr: string) {
    super('命令执行超时')
    this.stdout = stdout
    this.stderr = stderr
  }
}

async function defaultExecImpl(
  command: string,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: timeoutMs,
      maxBuffer: 2_000_000,
      shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh'
    })
    return { stdout: stdout ?? '', stderr: stderr ?? '', exitCode: 0 }
  } catch (err) {
    const e = err as {
      code?: string | number
      status?: number
      stdout?: string
      stderr?: string
    }
    if (e.code === 'ETIMEDOUT') {
      throw new ExecTimeoutError(e.stdout ?? '', e.stderr ?? '')
    }
    const exitCode =
      typeof e.status === 'number'
        ? e.status
        : typeof e.code === 'number'
          ? e.code
          : 1
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode
    }
  }
}

export async function runCheckCommand(opts: {
  command: string
  approved: ReadonlySet<string>
  pinned: boolean
  confirm: (action: string, detail: string) => Promise<boolean>
  execImpl?: (command: string, timeoutMs: number) => Promise<{ stdout: string; stderr: string; exitCode: number }>
}): Promise<{ result: CheckRunResult; approved: Set<string> }> {
  const { command, confirm, execImpl = defaultExecImpl } = opts
  const approved = new Set(opts.approved)

  if (!approved.has(command)) {
    const ok = await confirm('执行验收命令', command)
    if (!ok) {
      return {
        result: {
          command,
          exitCode: -1,
          output: '用户拒绝验收命令',
          timedOut: false,
          denied: true
        },
        approved
      }
    }
    approved.add(command)
  }

  try {
    const { stdout, stderr, exitCode } = await execImpl(command, CHECK_TIMEOUT_MS)
    return {
      result: {
        command,
        exitCode,
        output: truncateOutput(stdout, stderr),
        timedOut: false,
        denied: false
      },
      approved
    }
  } catch (err) {
    if (err instanceof ExecTimeoutError) {
      return {
        result: {
          command,
          exitCode: -2,
          output: truncateOutput(err.stdout, err.stderr),
          timedOut: true,
          denied: false
        },
        approved
      }
    }
    throw err
  }
}
