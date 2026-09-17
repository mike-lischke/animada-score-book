# ADR-0003: Make room for note entries per view and never overwrite a following note

- Status: accepted
- Date: 2026-09-10
- Related: ADR-0002, `src/ui/GridMeasureEditor.ts`, `src/core/ScoreBookDataModel.ts`
- Relevant when: note entry, note length change, measure editing, grid vs. staff behaviour, subdivision slots

## Context

Entering a note, or changing an existing note's duration, can require space that is already occupied.
Grid editor, staff editor and data model answered that on their own: the model overwrote following
notes, the grid rejected the edit while still advancing the cursor, the staff view shortened the new
note instead of applying the selected length.

## Decision

We will make room for a note per view: the grid view shortens it to the free space before the next
note, the staff view keeps the requested length and shifts later notes to the right.

## Invariants

- Events tile their measure without gaps and an edit may only move them: a note never overwrites a
  following note. The data model rejects a span containing a following note's start (`insertNote`).
- Making room is a UI decision (`GridMeasureEditor`); callers resolve their insertion through it
  rather than passing an unfitting span to the model.
- Rests are the elastic slack: growth consumes the rest behind the note first, only the excess moves
  later notes, which again use the next available rest (`resizeNote`).
- Grid view: a note whose selected length does not fit before the next note is shortened to that free
  space, so the clicked cell always changes.
- Staff view: a note entry keeps the selected length and following notes give way
  (`insertNoteWithShift`); where shifting is impossible, the shortened note remains.
- A length change ripples following notes instead of overwriting them (`resizeNote`), while a style
  change never alters a note's length; subdivision slots stay addressable only through their exact
  start fraction (ADR-0002).

## Alternatives considered

| Option | Why not / why chosen |
|---|---|
| Per-view space-making | Chosen: the grid reacts per fixed step, where the clicked cell must change, while staff positions are free and must honour the selected length. |
| One shared rule for both views | Rejected: shortening silently drops the selected length in the staff view, shifting displaces the rest of the measure in the grid view. |
| Let the model overwrite following notes | Rejected: it destroys user content without a visible reason. |

## Consequences

- Positive: the asymmetry is intentional and documented; both views always produce a visible edit.
- Trade-off: two insertion paths exist, so a caller must know which view it serves.
- Follow-up / verification: keep the model's rejection semantics and its spec; verify insertions and
  length changes in both views, including the tuplet case.
