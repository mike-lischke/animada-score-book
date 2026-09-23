# ADR-0007: Treat a subdivision as one atomic block on the track timeline

- Status: accepted
- Date: 2026-09-20
- Related: ADR-0003, ADR-0006, ADR-0011, `src/core/ScoreBookDataModel.ts`, `src/core/MeasureProjection.ts`
- Relevant when: note length change, dotting, note insertion and deletion, subdivisions, track ripple,
  staff view

## Context

A length change ripples through a track: the model collects its notes on an absolute timeline, applies
the requested durations and lays the result out again. Subdivisions were outside that model — every
track holding one was skipped, so a note beside a tuplet could not be dotted or resized.

## Decision

We will treat a subdivision as one item on the absolute timeline. The item carries the block's span and
its leaf events relative to the block; the ripple moves it as a whole and never reshapes, cuts or drops
it, and a request addressing a slot is ignored. The layout rebuilds the subdivision records from the
block's placements.

## Invariants

- A subdivision's span always equals the span its ratio dictates; no request changes it, and slots keep
  their relative positions.
- A block moves as a whole, over the bar line into the following measure; an edit that would have to cut
  a slot is refused, and the insert and delete paths then only clear the addressed element (ADR-0011).
- Content pushed past the last measure grows the arrangement, where growing is off it is dropped.
- A record points at the event that starts its first slot in the laid-out measure, and
  `MeasureProjection` stays the single source of nesting, leaf positions and the "which value is drawn"
  rule.

## Alternatives considered

| Option | Why not / why chosen |
|---|---|
| Atomic block (chosen) | Keeps the ratio intact, neighbours still take a new length |
| Reshaping slots like notes | Rejected: breaks the ratio, a tuplet stops being one |
| Skipping such tracks (status quo) | Rejected: notes beside a tuplet could not be edited |
| Cutting or dropping a block | Rejected: destroys content without a reason |

## Consequences

- Positive: length and dot edits work beside tuplets, and blocks survive edits intact.
- Trade-off: the ripple compares items rather than notes, and a block pushed past the last measure grows
  a measure.
- Follow-up / verification: `tests/core/ScoreBookDataModel.spec.ts` covers moving blocks and slots that
  keep their length; `tests/e2e/staff-subdivision.spec.ts` dots a note beside a subdivision.
