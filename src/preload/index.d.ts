import type { AppPaths } from '../shared/ipc'

export interface MyAgentApi {
  ping: () => Promise<'pong'>
  getPaths: () => Promise<AppPaths>
}

declare global {
  interface Window {
    myAgent: MyAgentApi
  }
}

export {}
