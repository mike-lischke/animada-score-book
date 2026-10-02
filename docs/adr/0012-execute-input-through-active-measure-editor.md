# ADR-0012: Execute the input through the active measure editor

- Status: accepted
- Date: 2026-09-23
- Related: ADR-0002, ADR-0003, ADR-0005, ADR-0006, ADR-0011, `src/ui/MeasureEditor.ts`,
  `src/ui/TrackViewerInputController.ts`
- Relevant when: measure editing, note entry, note length change, delete, cursor movement, input
  handling, editor boundaries, grid vs. staff behaviour

## Context

ADR-0005 split the editing by address space but left the input in `TrackViewerInputController`. It held
both editors, dispatched per view mode, and owned the cursor, the entry values, the resolution of
rendered cells and runs, the cursor navigation and the grid's note action menu, including its
rendering. Every new edit added another view-mode branch, and the controller grew past 1200 lines.

## Decision

We will let the editor of the view the user works in execute the input. The controller translates
pointer and key events into actions of the active `MeasureEditor` and forwards the requisitions of the
toolbars to it; the app reports which editor is active when the view mode changes. Cursor, entry values,
preview and the resolution of rendered elements live in the editor, so the controller carries no view
knowledge, no position format and no rendering.

Supersedes: ADR-0005, part "The input controller holds both and dispatches per view mode", and its
consequence that a caller must know which view it serves.

## Invariants

- The controller holds one editor — the active one — and never branches on the view mode or handles a
  position.
- An action a view does not offer does nothing: only the grid shows a note action menu, and it builds
  its items next to the edits they perform.
- The shared cursor is an exact fraction of the measure; the grid derives the raster step from it
  (ADR-0006), the staff uses it as it is. Space making and the entry mode stay per-view decisions
  (ADR-0003, ADR-0011).
- The editor resolves rendered elements through the score element registry (ADR-0002).

## Alternatives considered

| Option | Why not / why chosen |
|---|---|
| The active editor executes the input | Chosen: cursor, entry values and addresses belong to the edits that use them. |
| The controller keeps the cursor and passes positions on | Rejected: it keeps the position formats and the view branches in a class that only translates input. |
| A per-view input handler beside each editor | Rejected: it splits the cursor from the edits and duplicates the shared orchestration. |

## Consequences

- Positive: the controller is a thin translation layer; every view rule lives with the edits it serves.
- Trade-off: the editors resolve rendered elements, play the preview and — in the grid — open the menu,
  so they depend on the score element registry and the selection manager.
- Follow-up / verification: `tests/ui/GridMeasureEditor.spec.ts`, `tests/ui/StaffMeasureEditor.spec.ts`,
  `tests/ui/TrackViewerInputController.spec.ts` and `tests/e2e/grid-note-menu.spec.ts`.
