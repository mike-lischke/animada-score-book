# ADR-0005: Give the grid view and the staff view their own measure editor

- Status: accepted
- Date: 2026-09-15
- Related: ADR-0002, ADR-0003, `src/ui/GridMeasureEditor.ts`, `src/ui/TrackViewerInputController.ts`
- Relevant when: measure editing, note entry, note length change, cursor movement, grid vs. staff behaviour

## Context

One `GridMeasureEditor` serves both views, addressed through `IGridEditorPosition` and guarded in the
input controller by `instanceof` plus a view-mode branch. That mixes two address spaces: the grid has a
fixed raster of steps, the staff has none — notes are aligned to grid points for the eye only. The grid
also needs a projection the staff must never see: a long note is split into virtual sub-notes so single
cells can be selected and edited.

## Decision

We will give each view its own measure editor, split by address space rather than by operation.
`StaffMeasureEditor` addresses positions exclusively by exact fractions (`{ bar, trackId, start }`) and
owns the edits of the free staff layout. `GridMeasureEditor` owns the raster: cells including a
subdivision slot's exact start fraction, space making on the grid, and the virtual sub-note projection.
The input controller holds both and dispatches per view mode.

## Invariants

- Fractions are the domain form everywhere outside the grid view and its editor. The virtual sub-notes
  stay inside `GridMeasureEditor` and never reach the data model, a snapshot or the undo stack.
- A staff position never carries a step index; the grid editor derives it from the model objects it is
  given.
- Space making stays a per-view decision (ADR-0003): staff edits shift, grid edits shorten.
- Both editors act only through the fraction-based data model APIs, so an edit's undo record does not
  depend on the view.

## Alternatives considered

| Option | Why not / why chosen |
|---|---|
| One editor per view | Chosen: the address spaces and the space-making rules differ. |
| One editor with view-mode branches | Rejected: grid concepts would leak into the staff. |
| Grid projection inside the data model | Rejected: virtual sub-notes are a display concern. |

## Consequences

- Positive: the staff path carries no step knowledge, the grid stays the sole owner of the raster.
- Trade-off: a caller must know which view it serves (per ADR-0003).
- Follow-up: `StaffMeasureEditor.spec.ts`; verify entry, length change, delete and style change in both
  views.
