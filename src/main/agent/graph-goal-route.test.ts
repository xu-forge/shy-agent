import { describe, expect, it } from 'vitest'
import { mapChecklistItem, routeAfterActForGoal, routeAtStart } from './graph'

describe('routeAfterActForGoal', () => {
  it('routes tool calls to tools while under the segment cap', () => {
    expect(
      routeAfterActForGoal({
        hasToolCalls: true,
        round: 59,
        segmentSteps: 60
      })
    ).toBe('tools')
  })

  it('ends the segment at its step limit even with tool calls', () => {
    expect(
      routeAfterActForGoal({
        hasToolCalls: true,
        round: 60,
        segmentSteps: 60
      })
    ).toBe('end_segment')
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

describe('mapChecklistItem', () => {
  it('never trusts model-provided completion state', () => {
    expect(
      mapChecklistItem(
        {
          id: 'model-id',
          title: 'Model title',
          done: true,
          check: 'Model check'
        },
        0
      )
    ).toMatchObject({
      id: 'model-id',
      title: 'Model title',
      done: false,
      check: 'Model check'
    })
  })
})

describe('routeAtStart', () => {
  it('always routes goal mode to act even with an empty checklist', () => {
    expect(routeAtStart({ mode: 'goal', checklistLength: 0 })).toBe('act')
    expect(routeAtStart({ mode: 'goal', checklistLength: 3 })).toBe('act')
  })

  it('routes interactive with an empty checklist to plan', () => {
    expect(routeAtStart({ mode: 'interactive', checklistLength: 0 })).toBe('plan')
  })

  it('routes interactive with a checklist to act', () => {
    expect(routeAtStart({ mode: 'interactive', checklistLength: 1 })).toBe('act')
  })
})
