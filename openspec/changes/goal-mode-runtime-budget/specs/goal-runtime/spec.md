# Spec: goal-runtime

## Requirements

### Token budget
- In goal mode, THE system SHALL track cumulative token usage across act/tool/verify steps from OpenAI-compatible `usage_metadata`.
- When cumulative usage exceeds `tokenBudget` (0 = disabled), THE runtime SHALL soft-pause and report the reason.
- Budget tracking SHALL reset when a goal-mode run completes or is cancelled.

#### Scenario: token budget pause
- **WHEN** goal-mode cumulative usage reaches the configured `tokenBudget`
- **THEN** the runtime pauses, persists progress, and reports "已触及 token 预算"

#### Scenario: budget disabled
- **WHEN** `tokenBudget` is 0
- **THEN** no budget pause occurs and the run proceeds on round/stagnation guards only

### Stagnation refinement
- The stagnation counter SHALL only increment when a verify round reports no new checklist item done AND no effective tool result occurred since the last verify.
- Any effective tool result SHALL reset the stagnation counter.

#### Scenario: tool progress avoids pause
- **WHEN** a verify round has no new done item but an effective tool result occurred since the last verify
- **THEN** the stagnation counter resets instead of incrementing

#### Scenario: true stagnation pauses
- **WHEN** a verify round has no new done item and no effective tool result since the last verify
- **THEN** the stagnation counter increments

### Verifiable acceptance hook
- Checklist items MAY carry an optional `check` description describing an executable acceptance rule.
- The verify prompt SHALL require observable evidence rather than bare completion claims.

#### Scenario: check field passthrough
- **WHEN** a plan/verify LLM response includes a `check` on a checklist item
- **THEN** the item retains and surfaces the `check` description
