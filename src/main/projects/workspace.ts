import { getDefaultSessionWorkspace } from '../paths'
import { getSession } from '../sessions/store'
import { getProject } from './store'

export function resolveAgentWorkspace(sessionId: string): string {
  const session = getSession(sessionId)
  if (!session?.projectId) {
    return getDefaultSessionWorkspace(sessionId)
  }
  const project = getProject(session.projectId)
  if (!project?.rootPath) {
    return getDefaultSessionWorkspace(sessionId)
  }
  return project.rootPath
}
