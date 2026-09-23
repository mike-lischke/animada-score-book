# Architecture Decision Records

ADRs document only durable, cross-module decisions or invariants that would be
hard to infer from code alone.

## Rules

- ADRs live in this directory and use `NNNN-kebab-case-title.md`.
- One ADR records one decision.
- Status is `proposed`, `accepted`, `deprecated`, or `superseded by ADR-NNNN`.
- Do not rewrite accepted decisions to change history.
  Create a new ADR and mark the old one as superseded.
- A partial replacement names the ADR and the part it replaces in the new ADR
  (`Supersedes:`); the replaced ADR keeps its status and its text.
- Do not create ADRs for ordinary fixes, local refactorings, or implementation
  details.
- Keep ADRs concise: normally 200–400 words.

## Index

| ADR | Status | Decision | Relevant when |
|---|---|---|---|
| ADR-0001 | accepted | Schedule audio against the AudioContext clock and drive playback with a look-ahead scheduler | playback, transport, scheduling, timing |
| ADR-0002 | accepted | Resolve rendered score elements through a viewer-local typed registry | score rendering, selection, keyboard navigation, DOM integration |
| ADR-0003 | accepted | Make room for note entries per view and never overwrite a following note | note entry, note length change, measure editing, grid vs. staff behaviour, subdivision slots |
| ADR-0004 | accepted | Publish state changes as requisitions instead of setting them on other classes | communication between components and managers, state that several modules need, adding a setter or a direct call |
| ADR-0005 | accepted | Give the grid view and the staff view their own measure editor | measure editing, note entry, note length change, delete and style changes, cursor movement, editor boundaries, grid vs. staff behaviour |
| ADR-0006 | accepted | Address notes by fractions and render sub-step notes as a synthetic grid subdivision | note entry, note length change, subdivisions, note addressing, grid vs. staff behaviour, step resolution |
| ADR-0007 | accepted | Treat a subdivision as one atomic block on the track timeline | note length change, dotting, note insertion and deletion, subdivisions, track ripple, space making, note addressing, staff view |
| ADR-0008 | accepted | Derive the note groups of a measure from its composition | score rendering, selection, hit testing, beams, tuplets, subdivisions, staff view |
| ADR-0009 | accepted | Make measure widths data and render only a window of measures in the staff view | score rendering, staff view, measure layout, measure widths, scrolling, selection decoration |
| ADR-0010 | accepted | Select the note groups a selection rectangle covers instead of their notes | staff view, selection, hit testing, note groups, beams, tuplets, drag selection |
| ADR-0011 | accepted | Give note entry an insert and an overwrite mode | note entry, note length change, measure editing, delete, grid vs. staff behaviour, subdivision slots, entry toolbars |
