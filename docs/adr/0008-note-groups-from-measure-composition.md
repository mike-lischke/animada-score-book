# ADR-0008: Derive the note groups of a measure from its composition

- Status: accepted
- Date: 2026-09-21
- Related: ADR-0002, ADR-0006, `src/core/MeasureProjection.ts`,
  `src/components/ui/Bar/Staff/StaffMeasureViewer.tsx`, `src/components/ui/Note/StaffNoteViewer.tsx`
- Relevant when: score rendering, selection, hit testing, beams, tuplets, subdivisions, staff view

## Context

The staff hit test resolved groups from rendered geometry, taking the narrowest overlap between an
element and the note runs as the innermost group. That does not match the notation: a beam is drawn
per stroke, so a click reached only the runs underneath it, and a tuplet bracket lies outside the
note band.

## Decision

We will compose the note groups of a measure in one place, `MeasureProjection.noteGroups`: tuplets
and beam runs with their events, spans and nesting depth, ordered innermost first. The renderer draws
from it; the hit test looks up the group of the marker it touched.

## Invariants

- Group membership follows from the measure — its events and subdivisions — and from the timing grid
  of the arrangement: the bar's step count and its exact pulse boundaries, which an averaged pulse
  length cannot stand in for. Never from DOM geometry: the registry supplies identity, not grouping.
- A click addresses the group of its marker; a selection covering markers of several groups of one
  track resolves at note granularity.
- A selection never holds a note group together with the group covering it; the last picked replaces
  the other.
- A hit on a note keeps priority over a marker of the same track; markers are applied after the rows,
  because they lie outside the row's bounds.

## Alternatives considered

| Option | Why not / why chosen |
|---|---|
| Compose groups in `MeasureProjection`, resolve by marker | Chosen: one rule set serves renderer and hit test. |
| Keep measuring overlaps between runs and markers | Rejected: a stroke spans one run, a bracket lies outside the row. |
| Serialize group identity into `data-*` attributes | Rejected by ADR-0002. |
| Register beam strokes as own elements | Rejected: a second element at a position displaces the note run. |

## Consequences

- Positive: a click addresses the group it points at, a drag across groups resolves to their notes,
  and renderer and hit test cannot drift apart.
- Trade-off: a notation rule lives in the core, and the hit test needs a marker's registry target.
- Follow-up / verification: `tests/core/MeasureProjection.spec.ts`, `tests/e2e/staff-selection.spec.ts`.
