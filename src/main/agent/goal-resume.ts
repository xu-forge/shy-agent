export function selectAutoResume(
  sessions: Array<{ id: string; updatedAt: string }>
): { resumeId: string | null; pauseIds: string[] } {
  const sorted = [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return {
    resumeId: sorted[0]?.id ?? null,
    pauseIds: sorted.slice(1).map((session) => session.id)
  }
}
