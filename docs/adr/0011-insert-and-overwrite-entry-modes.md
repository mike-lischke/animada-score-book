# ADR-0011: Give note entry an insert and an overwrite mode

- Status: accepted
- Date: 2026-09-23
- Related: ADR-0003, ADR-0005, ADR-0007, `src/ui/StaffMeasureEditor.ts`, `src/ui/TrackViewerInputController.ts`
- Relevant when: note entry, note length change, measure editing, delete, grid vs. staff behaviour, entry
  toolbars

## Context

ADR-0003 made room for an entry per view: the grid shortened the new note before the next one, the
staff shifted everything behind it. Neither could replace the element the cursor addresses, which
correcting a bar needs; delete had the same question.

Supersedes: ADR-0003, part "make room for a note per view" — the staff follows the entry mode now, the
grid keeps shortening in overwrite.

## Decision

We will let the user choose how an entry makes room. Insert writes its length and moves the content
behind it to the right; overwrite replaces what the cursor addresses and leaves the rest alone. The app
resolves the mode: the grid always reports overwrite, the staff the mode the user picked, stored with
the other entry values.

## Invariants

- An entry never cuts a following note: the model moves events instead of overlapping them.
- Overwrite replaces the addressed element only, and a style change never alters a note's length.
- Insert writes the selected length and shifts, notating the space it takes as rests.
- A subdivision slot keeps the length its ratio dictates in both modes (ADR-0007); where shifting is
  impossible, the addressed element is only restyled or cleared.
- The entry bars state the mode: their marks show what the next entry uses in insert and what the
  selection carries in overwrite, and follow the selection on a switch.
- Delete follows the split, and insert mode draws no selection.

## Alternatives considered

| Option | Why not / why chosen |
|---|---|
| Two modes, chosen by the user | Chosen: writing and correcting want different edits |
| Keep ADR-0003's per-view rule | Rejected: the staff view could not replace content |
| Always insert or always overwrite | Rejected: correcting would need a delete first |

## Consequences

- Positive: the staff view replaces, corrects and splits content without a detour over delete.
- Trade-off: every entry path branches on the mode, and the toolbars depend on the mode the app reports.
- Follow-up / verification: `tests/e2e/staff-insert.spec.ts`, `tests/ui/StaffMeasureEditor.spec.ts` and
  the entry-toolbar specs cover both modes.
