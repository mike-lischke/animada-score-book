# ADR-0021: Derive the step grid from the meter instead of storing it

- Status: accepted
- Date: 2026-11-01
- Supersedes: ADR-0006, the invariant that `stepResolution` survives in the data because a real subdivision records how many steps it replaces
- Related: ADR-0006, ADR-0008, issue #58, `src/core/StepGrid.ts`, `src/core/TimeParams.ts`, `src/core/serialisation/snapshot-packing.ts`
- Relevant when: step resolution, grid construction, meter, note addressing, subdivisions, snapshots, migration, metronome, score metrics, auto-scroll

## Context

Grid steps were stored twice, in two meanings: `stepResolution` counted steps per whole note, the meter a step count per bar, and `beatGroups` the pulse boundaries. All three follow from the meter, so as data they could disagree with it: a 6/8 measure could hold sixteen steps, and every snapshot, undo step and clipboard payload carried a raster the meter already implies.

## Decision

We will derive the step grid from the meter. `StepGrid` is the single authority: it maps a meter to its steps per bar, pulse groups, steps per pulse and beat parity. No score stores a step count, a resolution or a beat group, and `IScoreMetrics` carries only musical numbers. Notes stay addressed by fractions, as ADR-0006 decided.

## Invariants

- No snapshot, undo state, clipboard payload or model API holds a step count, a resolution or pulse groups.
- Only `StepGrid` turns a meter into steps; no module re-implements the rule, including its parity variants.
- A measure's grid follows its own `meter`; changing the meter changes that measure's grid alone.
- Playback and notation consume pulses and fractions; auto-scroll follows rendered geometry.
- A regular meter with a beat unit of a quarter or longer counts sixteenths (4/4 → 16, 3/4 → 12, 2/4 → 8); any other meter counts its own beat unit at most (6/8 → 6, 9/8 → 9, 12/8 → 12, 5/4 → 10, 7/8 → 7).

## Alternatives considered

| Option | Why not / why chosen |
| --- | --- |
| Derive from the meter in one authority | Chosen: the raster cannot drift from its meter. |
| Keep `stepResolution` on the time params | Rejected: a per-whole-note number beside a per-bar one is ambiguous. |
| Keep a step count per measure | Rejected: a derivable value every writer must agree on. |
| Derive ad hoc where steps are needed | Rejected: parity and irregular-meter rules diverge. |

## Consequences

- Positive: one grid rule, no stored raster, no measure with a stale grid.
- Trade-off: the snapshot schema bumps to version 7; older packed snapshots are upgraded on unpack by dropping the fields.
- Follow-up / verification: `StepGrid.spec.ts`, the meter cases of the measure-editor specs, and the metronome and score-metric tests.
