# ADR-0007: Treat a subdivision as one atomic block on the track timeline

- Status: proposed
- Date: 2026-09-20
- Related: ADR-0003, ADR-0006, `src/core/ScoreBookDataModel.ts`, `src/core/MeasureProjection.ts`
- Relevant when: note length change, dotting, subdivisions, track ripple, space making, note
  addressing, staff view

## Context

A length change ripples through a track: `resizeNotes`/`resizeEvents` collect the track's notes on an
absolute timeline, apply the requested durations and lay the result out again, filling the gaps with
rests. Subdivisions were outside that model — every track holding one was skipped outright, so a
plain note or rest beside a tuplet could not be dotted or resized at all. Treating slots like
ordinary notes is not an option either: the slots of a subdivision are fixed by its ratio, and a
cut or moved slot would break the tuplet.

## Decision

We will treat a subdivision as one item on the absolute timeline. The item carries the
subdivision's span and its leaf events with starts relative to the block, and the ripple moves it as
a whole: it never reshapes, cuts or drops it. A request that addresses a slot is ignored, because a
slot's length follows from its ratio and not from a request. The layout rebuilds the subdivision
records from the block's placements instead of remapping them by start position, and protects the
slot starts while it recomputes the rests.

## Invariants

- A subdivision's span always equals the span its ratio dictates; no request changes it.
- Slots keep their relative positions while the block moves.
- A block never crosses a bar line and never loses a slot. An edit that would need to cut or drop it
  is refused rather than applied halfway.
- A subdivision record points at the event that starts its first slot in the laid-out measure.
- `MeasureProjection` stays the single source of nesting and leaf positions: collection, slot
  protection and the "which value is drawn" rule are all derived from it.

## Alternatives considered

| Option | Why not / why chosen |
|---|---|
| Atomic block (chosen) | Keeps the ratio intact and still lets neighbouring notes take a new length |
| Reshaping slots like notes | Rejected: breaks the ratio, so a tuplet would silently stop being one |
| Skipping tracks with subdivisions (status quo) | Rejected: plain notes beside a tuplet could not be edited at all |
| Cutting or dropping a block that no longer fits | Rejected: destroys user content without an edit that says so |
| Remapping records by their old start position | Rejected: after a move that position may coincide with an unrelated event, so the record lands on the wrong one |

## Consequences

- Positive: length and dot edits work beside tuplets, the toolbar can offer lengths exactly where the
  model accepts them, and blocks survive every edit intact.
- Trade-off: the ripple compares items rather than notes, and a block pushed past the end of the last
  measure is dropped as a whole, like a note that no longer fits.
- Follow-up / verification: `tests/core/ScoreBookDataModel.spec.ts` covers slots that keep their
  length, a block stepping aside for a growing note and for a shrinking rest, and the record
  following the moved first slot; `tests/e2e/staff-subdivision.spec.ts` dots a note beside a
  subdivision; `tests/ui/NoteLengthToolbar.spec.tsx` covers the disabled states.
