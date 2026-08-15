import { selectAutoResume } from './goal-resume'

type InterruptedGoalSession = {
  id: string
  updatedAt: string
}

type ResumeInterruptedGoalCallbacks = {
  resume: (sessionId: string) => void
  pause: (sessionId: string) => void
}

export function resumeInterruptedGoals(
  sessions: InterruptedGoalSession[],
  opts: ResumeInterruptedGoalCallbacks
): { resumed: string | null; paused: string[] } {
  const { resumeId, pauseIds } = selectAutoResume(sessions)

  for (const sessionId of pauseIds) {
    opts.pause(sessionId)
  }
  if (resumeId) {
    opts.resume(resumeId)
  }

  return { resumed: resumeId, paused: pauseIds }
}
