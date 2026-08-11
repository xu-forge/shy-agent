# Spec: final-runtime

## Requirements

### Goal loop
- WHEN mode=goal AND checklist empty, THE system SHALL run a plan node that emits goal + checklist
- WHEN tools are requested, THE system SHALL execute them then return to act
- WHEN act finishes without tools in goal mode, THE system SHALL verify and update checklist
- WHEN all checklist items done, THE system SHALL emit completion and end

### Pause / resume
- WHEN user pauses, THE runtime SHALL gate subsequent graph steps until resume
- WHEN cold resume (no live waiters), THE system SHALL restart graph with resume prompt and prior checklist

### Memory & skills
- THE system SHALL inject matched local skills into act context
- THE system SHALL compress short memory with LLM keep-key strategy after a run
- Long memory updates SHALL increment revision and write audit rows

### Sessions UI
- THE renderer SHALL list/create/delete sessions and show goal checklist progress
