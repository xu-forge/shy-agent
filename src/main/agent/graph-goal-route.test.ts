import { describe, expect, it } from 'vitest'
import { routeAfterActForGoal } from './graph'

describe('routeAfterActForGoal', () => {
  it('routes tool calls to tools', () => {
    expect(
      routeAfterActForGoal({
        hasToolCalls: true,
        round: 60,
        segmentSteps: 60
      })
    ).toBe('tools')
  })

  it('ends the burst when there are no tool calls', () => {
    expect(
      routeAfterActForGoal({
        hasToolCalls: false,
        round: 1,
        segmentSteps: 60
      })
    ).toBe('end_burst')
  })

  it('ends the segment when its step limit is reached', () => {
    expect(
      routeAfterActForGoal({
        hasToolCalls: false,
        round: 60,
        segmentSteps: 60
      })
    ).toBe('end_segment')
  })
})
